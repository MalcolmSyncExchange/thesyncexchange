"""Fixed local child launcher; no user supplied command or environment is accepted."""
import os, resource, sys, json

tool, output_limit = sys.argv[1], int(sys.argv[2])
if tool not in ('ffmpeg', 'ffprobe') or output_limit < 1 or output_limit > 250_000_000:
    sys.exit(64)
resource.setrlimit(resource.RLIMIT_CPU, (480, 480))
resource.setrlimit(resource.RLIMIT_FSIZE, (output_limit, output_limit))
resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
if sys.platform == 'linux':
    resource.setrlimit(resource.RLIMIT_AS, (805_306_368, 805_306_368))
    # Linux seccomp: deny creation of network sockets. Architecture is build-pinned.
    import ctypes, platform
    machine = platform.machine()
    network_calls = {'x86_64': [41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,288], 'aarch64': list(range(198,213)) + [242]}.get(machine)
    architecture = {'x86_64':0xc000003e, 'aarch64':0xc00000b7}.get(machine)
    if network_calls is None:
        sys.exit(64)
    class Filter(ctypes.Structure):
        _fields_ = [('code', ctypes.c_ushort), ('jt', ctypes.c_ubyte), ('jf', ctypes.c_ubyte), ('k', ctypes.c_uint)]
    class Program(ctypes.Structure):
        _fields_ = [('len', ctypes.c_ushort), ('filter', ctypes.POINTER(Filter))]
    entries = [Filter(0x20,0,0,4), Filter(0x15,1,0,architecture), Filter(0x06,0,0,0x80000000), Filter(0x20,0,0,0)]
    # Reject the alternate x32 syscall ABI as well as incompatible architectures.
    entries += [Filter(0x45,0,1,0x40000000), Filter(0x06,0,0,0x00050001)]
    for number in network_calls:
        entries += [Filter(0x15,0,1,number), Filter(0x06,0,0,0x00050001)]
    entries += [Filter(0x06,0,0,0x7fff0000)]
    filters = (Filter * len(entries))(*entries)
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(38,1,0,0,0) != 0 or libc.prctl(22,2,ctypes.byref(Program(len(entries), filters)),0,0) != 0:
        sys.exit(64)
    # Fail closed if the kernel cannot confine parser filesystem access. Only
    # executable/shared libraries and this job's scratch directory are reachable.
    class Ruleset(ctypes.Structure):
        _fields_ = [('handled_access_fs', ctypes.c_uint64)]
    class PathRule(ctypes.Structure):
        _pack_ = 1
        _fields_ = [('allowed_access',ctypes.c_uint64),('parent_fd',ctypes.c_int)]
    abi = libc.syscall(444,0,0,1)
    if abi < 3:
        sys.exit(64)
    handled = (1 << 15) - 1
    ruleset = Ruleset(handled)
    fd = libc.syscall(444,ctypes.byref(ruleset),ctypes.sizeof(ruleset),0)
    if fd < 0:
        sys.exit(64)
    read = (1 << 0) | (1 << 2) | (1 << 3)
    work = os.environ['MEDIA_WORK_DIR']
    for path, access in [(os.environ['MEDIA_TOOL_DIR'],read),('/lib',read),('/usr/lib',read),('/etc/ld.so.cache',1 << 2),(work,handled)]:
        if not os.path.exists(path):
            continue
        parent = os.open(path,os.O_PATH | os.O_CLOEXEC)
        rule = PathRule(access,parent)
        result = libc.syscall(445,fd,1,ctypes.byref(rule),0)
        os.close(parent)
        if result != 0:
            sys.exit(64)
    if libc.syscall(446,fd,0) != 0:
        sys.exit(64)
    os.close(fd)
base = os.environ['MEDIA_TOOL_DIR']
if not os.path.isabs(base):
    sys.exit(64)
pid = os.fork()
if pid == 0:
    os.execve(base + '/' + tool, [tool] + sys.argv[3:], {'PATH':'/usr/bin:/bin', 'LC_ALL':'C', 'HOME':'/nonexistent'})
_, status, usage = os.wait4(pid, 0)
os.write(3, json.dumps({'peak_rss_bytes':int(usage.ru_maxrss * (1024 if sys.platform == 'linux' else 1))}).encode())
sys.exit(os.waitstatus_to_exitcode(status) if sys.version_info >= (3,9) else (status >> 8))
