import ctypes,platform,os,json
libc=ctypes.CDLL(None,use_errno=True)
result={'machine':platform.machine(),'uid':os.getuid(),'landlock_abi':libc.syscall(444,0,0,1),'landlock_errno':ctypes.get_errno()}
ctypes.set_errno(0);result['no_new_privs']=libc.prctl(38,1,0,0,0);result['no_new_privs_errno']=ctypes.get_errno()
class Filter(ctypes.Structure):_fields_=[('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),('jf',ctypes.c_ubyte),('k',ctypes.c_uint)]
class Program(ctypes.Structure):_fields_=[('len',ctypes.c_ushort),('filter',ctypes.POINTER(Filter))]
f=(Filter*1)(Filter(0x06,0,0,0x7fff0000));p=Program(1,f)
ctypes.set_errno(0);result['seccomp_allow_all_install']=libc.prctl(22,2,ctypes.byref(p),0,0);result['seccomp_errno']=ctypes.get_errno()
print(json.dumps(result))
