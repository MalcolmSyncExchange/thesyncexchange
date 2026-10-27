"""Portable bytecode-policy validation. NOT native kernel enforcement evidence."""
import importlib.util,json,struct
spec=importlib.util.spec_from_file_location('policy','workers/media/sandbox.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
checks=0

def run(machine,number,args=(),arch=None):
    global checks
    checks+=1
    p=m.filter_program(machine,1234)
    data=struct.pack('<IIQ6Q',number,arch or m.SYSCALLS[machine]['arch'],0,*(list(args)+[0]*6)[:6])
    i=0;acc=0
    for _ in range(1000):
        code,jt,jf,k=p[i]
        if code==0x20:acc=struct.unpack_from('<I',data,k)[0]
        elif code==0x15:i+=jt if acc==k else jf
        elif code==0x45:i+=jt if acc&k else jf
        elif code==0x06:return k
        else:raise AssertionError('unsupported BPF instruction')
        i+=1
    raise AssertionError('unbounded BPF')

for machine,s in m.SYSCALLS.items():
    allowed=set(s['allow'])
    assert len(allowed)==len(s['allow'])
    for n in range(2048):
        result=run(machine,n)
        if n in allowed or n==s['prlimit']:assert result==m.ALLOW,(machine,n)
        elif n==s['clone3']:assert result==m.ENOSYS
        else:assert result==m.DENY,(machine,n,result)
    assert run(machine,0,arch=0x40000003)==0x80000000
    assert run(machine,0x40000000)==m.DENY
    for flag in [0,17,0x100,0x10000,0x10000|0x100|0x20000,0x10000|0x100|0x2000,0x10000|0x100|0x4000,0x10000|0x100|0x8000,0x10000|0x100|0x80000000,0x10000|0x100|(1<<32)]:
        assert run(machine,s['clone'],[flag])==m.DENY,(machine,flag)
    assert run(machine,s['clone'],[0x10000|0x100])==m.ALLOW
    assert run(machine,s['tgkill'],[1234,1235,0])==m.ALLOW
    assert run(machine,s['tgkill'],[1233,1235,0])==m.DENY
    assert run(machine,s['prlimit'],[0,0,0])==m.ALLOW
    assert run(machine,s['prlimit'],[1233,0,0])==m.DENY
    assert run(machine,s['prlimit'],[0,0,1])==m.DENY
    assert run(machine,s['prlimit'],[0,0,1<<32])==m.DENY
    # Explicit parent memory, sockets, namespace/mount, IPC, process escape,
    # io_uring, pidfd and privilege calls; future calls fail closed as above.
    forbidden={'x86_64':[41,42,53,62,101,109,112,155,157,165,169,175,200,246,249,250,272,298,303,304,308,310,311,312,321,323,425,426,427,428,434],
               'aarch64':[40,51,97,117,129,130,154,157,167,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,219,270,271,272,280,282,425,426,427,428,434]}[machine]
    for n in forbidden:assert run(machine,n)==m.DENY,(machine,n)
print(json.dumps({'pass':True,'assertions':checks,'scope':'portable BPF interpreter; not native kernel acceptance'}))
