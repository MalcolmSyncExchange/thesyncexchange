"""Trusted launcher. No parser executes unless every Linux boundary installs.

The Python supervisor is trusted; only the exec'd media binary parses input.
This policy is inherited by threads/exec and cannot be removed by the parser.
"""
import ctypes
import json
import os
import platform
import resource
import sys

# Fixed pinned-runtime syscall contract. Unknown/future calls are denied.
# Filesystem access is additionally narrowed by Landlock file-leaf rules.
SYSCALLS = {
    'x86_64': {
        'arch': 0xc000003e, 'clone': 56, 'clone3': 435, 'tgkill': 234, 'prlimit': 302,
        'allow': [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,17,18,19,20,21,22,23,24,25,26,27,28,
                  32,33,35,39,59,60,63,72,74,75,77,79,89,95,96,97,98,99,100,102,104,107,108,110,111,
                  131,158,186,202,204,218,219,228,229,230,231,257,262,267,269,270,271,273,292,293,
                  309,318,332,334,439],
    },
    'aarch64': {
        'arch': 0xc00000b7, 'clone': 220, 'clone3': 435, 'tgkill': 131, 'prlimit': 261,
        'allow': [23,24,25,29,46,48,56,57,59,61,62,63,64,65,66,67,68,72,73,78,79,80,82,83,93,94,
                  96,98,99,100,101,113,114,115,124,128,132,134,135,139,160,163,165,166,169,172,
                  173,174,175,176,177,178,179,214,215,216,221,222,226,233,260,278,291,293,439],
    },
}
ALLOW = 0x7fff0000
DENY = 0x00050001  # EPERM
ENOSYS = 0x00050026


def filter_program(machine, pid):
    """Classic BPF tuples; exported for portable policy regression tests."""
    policy = SYSCALLS[machine]
    entries = [(0x20,0,0,4),(0x15,1,0,policy['arch']),(0x06,0,0,0x80000000),(0x20,0,0,0),
               (0x45,0,1,0x40000000),(0x06,0,0,DENY)]
    for number in policy['allow']:
        entries += [(0x15,0,1,number),(0x06,0,0,ALLOW)]
    # clone3 has pointer arguments that classic BPF cannot inspect. ENOSYS
    # permits libc's legacy clone fallback; only same-process threads may clone.
    entries += [(0x15,0,1,policy['clone3']),(0x06,0,0,ENOSYS)]
    entries += [(0x15,0,8,policy['clone']),(0x20,0,0,20),(0x15,0,5,0),(0x20,0,0,16),
                (0x45,0,3,0x10000),(0x45,0,2,0x100),
                (0x45,1,0,(~0x017d0f00) & 0xffffffff),(0x06,0,0,ALLOW),(0x06,0,0,DENY)]
    # Signals can target only this process's own threads. No parent/peer signals.
    entries += [(0x15,0,4,policy['tgkill']),(0x20,0,0,16),(0x15,0,1,pid),
                (0x06,0,0,ALLOW),(0x06,0,0,DENY)]
    # libc may query its limits; it cannot change them or inspect another PID.
    entries += [(0x15,0,8,policy['prlimit']),(0x20,0,0,16),(0x15,0,5,0),
                (0x20,0,0,32),(0x15,0,3,0),(0x20,0,0,36),(0x15,0,1,0),
                (0x06,0,0,ALLOW),(0x06,0,0,DENY),(0x06,0,0,DENY)]
    return entries


def install_seccomp(libc, machine):
    class Filter(ctypes.Structure):
        _fields_ = [('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),('jf',ctypes.c_ubyte),('k',ctypes.c_uint)]
    class Program(ctypes.Structure):
        _fields_ = [('len',ctypes.c_ushort),('filter',ctypes.POINTER(Filter))]
    entries = filter_program(machine, os.getpid())
    filters = (Filter * len(entries))(*(Filter(*x) for x in entries))
    if libc.prctl(22,2,ctypes.byref(Program(len(entries),filters)),0,0) != 0:
        raise RuntimeError()


def library_rules(runtime):
    read_file = 1 << 2
    read_tree = (1 << 0) | read_file | (1 << 3)
    if runtime:
        return [(runtime,read_tree)]
    # Debian's merged /usr exposes /lib as a symlink. Landlock path-beneath
    # needs a directory FD, while O_NOFOLLOW intentionally stays on below.
    # Resolve only these trusted immutable library roots, never input/output.
    roots = list(dict.fromkeys(os.path.realpath(p) for p in ('/lib','/usr/lib')))
    if any(p not in ('/lib','/usr/lib','/lib64','/usr/lib64') for p in roots):
        raise RuntimeError()
    rules = [(p,read_tree) for p in roots]
    # Scratch images can legitimately omit ld.so.cache. Missing required
    # runtime/tool/input/output files still fail; no fallback broadens access.
    if os.path.lexists('/etc/ld.so.cache'):
        rules.append(('/etc/ld.so.cache',read_file))
    return rules


def install_filesystem(libc, inputs, outputs, tool, runtime):
    class Ruleset(ctypes.Structure):
        _fields_ = [('handled_access_fs',ctypes.c_uint64)]
    class PathRule(ctypes.Structure):
        _pack_ = 1
        _fields_ = [('allowed_access',ctypes.c_uint64),('parent_fd',ctypes.c_int)]
    if libc.syscall(444,0,0,1) < 3:
        raise RuntimeError()
    ruleset = Ruleset((1 << 15)-1)
    fd = libc.syscall(444,ctypes.byref(ruleset),ctypes.sizeof(ruleset),0)
    if fd < 0:
        raise RuntimeError()
    read_file = 1 << 2
    read_tree = (1 << 0) | read_file | (1 << 3)
    libraries = library_rules(runtime)
    # No directory write/create/remove/rename/symlink/device/execute access to
    # scratch. Even compromised native code can only write pre-created leaves.
    rules = libraries + [(tool,(1 << 0) | read_file)]
    rules += [(path,read_file) for path in inputs]
    rules += [(path,read_file | (1 << 1) | (1 << 14)) for path in outputs]
    try:
        for path, access in rules:
            parent = os.open(path,os.O_PATH | os.O_CLOEXEC | os.O_NOFOLLOW)
            try:
                if libc.syscall(445,fd,1,ctypes.byref(PathRule(access,parent)),0) != 0:
                    raise RuntimeError()
            finally:
                os.close(parent)
        if libc.syscall(446,fd,0) != 0:
            raise RuntimeError()
    finally:
        os.close(fd)


def main():
    # macOS/unsupported kernels never silently fall back to an unconfined child.
    if sys.platform != 'linux' or platform.machine() not in SYSCALLS or os.geteuid() == 0:
        return 64
    tool, output_limit = sys.argv[1], int(sys.argv[2])
    if tool not in ('ffmpeg','ffprobe') or not 1 <= output_limit <= 50_000_000:
        return 64
    base = os.environ['MEDIA_TOOL_DIR']
    inputs = json.loads(os.environ['MEDIA_INPUT_FILES'])
    outputs = json.loads(os.environ['MEDIA_OUTPUT_FILES'])
    if len(inputs)+len(outputs) > 4 or any(not os.path.isabs(p) or os.path.realpath(p) != p for p in [base]+inputs+outputs):
        return 64
    libc = ctypes.CDLL(None,use_errno=True)
    # Reject effective/permitted capabilities, rather than relying on UID alone.
    class CapHeader(ctypes.Structure):
        _fields_ = [('version',ctypes.c_uint32),('pid',ctypes.c_int)]
    class CapData(ctypes.Structure):
        _fields_ = [('effective',ctypes.c_uint32),('permitted',ctypes.c_uint32),('inheritable',ctypes.c_uint32)]
    caps = (CapData*2)()
    if libc.capget(ctypes.byref(CapHeader(0x20080522,0)),caps) != 0 or any(c.effective or c.permitted or c.inheritable for c in caps):
        return 64
    resource.setrlimit(resource.RLIMIT_CPU,(40,40))
    resource.setrlimit(resource.RLIMIT_AS,(805_306_368,805_306_368))
    resource.setrlimit(resource.RLIMIT_FSIZE,(output_limit,output_limit))
    resource.setrlimit(resource.RLIMIT_NOFILE,(32,32))
    resource.setrlimit(resource.RLIMIT_NPROC,(32,32))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    os.umask(0o077)
    if libc.prctl(38,1,0,0,0) != 0 or libc.prctl(4,0,0,0,0) != 0:
        return 64
    pid = os.fork()
    if pid == 0:
        try:
            # Only pipes 0..2 cross exec. fd3 is supervisor-only measurements.
            os.closerange(3,1_048_576)
            runtime = os.environ.get('MEDIA_RUNTIME_ROOT')
            install_filesystem(libc,inputs,outputs,base+'/'+tool,runtime)
            install_seccomp(libc,platform.machine())
            env = {'LC_ALL':'C','HOME':'/nonexistent'}
            if runtime:
                triplet = 'x86_64-linux-gnu' if platform.machine() == 'x86_64' else 'aarch64-linux-gnu'
                loader = runtime+'/usr/lib/'+triplet+('/ld-linux-x86-64.so.2' if platform.machine() == 'x86_64' else '/ld-linux-aarch64.so.1')
                os.execve(loader,[loader,'--library-path',runtime+'/usr/lib/'+triplet+':'+runtime+'/usr/local/lib',base+'/'+tool]+sys.argv[3:],env)
            else:
                os.execve(base+'/'+tool,[tool]+sys.argv[3:],env)
        except BaseException:
            os._exit(64)
    _,status,usage = os.wait4(pid,0)
    os.write(3,json.dumps({'peak_rss_bytes':int(usage.ru_maxrss*1024),'cpu_user_us':int(usage.ru_utime*1000000),'cpu_system_us':int(usage.ru_stime*1000000)}).encode())
    return os.waitstatus_to_exitcode(status)


if __name__ == '__main__':
    try:
        result = main()
    except BaseException:
        # No paths, arguments, environment values or parser errors in logs.
        result = 64
    sys.exit(result)
