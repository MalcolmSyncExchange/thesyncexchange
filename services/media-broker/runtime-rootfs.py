"""Build-only Debian runtime closure. Retain accurate package metadata/licenses.
No downloads, media, credentials or user-controlled input. Never executed in runtime.
"""
import pathlib, os, shutil, subprocess, sys, json
root = pathlib.Path('/runtime-rootfs')
root.mkdir()
for name in ('usr/lib','usr/lib64','usr/bin','usr/local/bin','etc','opt/licenses','var/lib/dpkg','work'):
    (root/name).mkdir(parents=True,exist_ok=True)
(root/'lib').symlink_to('usr/lib'); (root/'lib64').symlink_to('usr/lib64')
os.chown(root/'work',1000,1000); os.chmod(root/'work',0o700)
files = set()
def copy(path):
    p=pathlib.Path(path); real=p.resolve(strict=True)
    if real.stat().st_mode & 0o6000: raise RuntimeError('Setuid/setgid runtime file forbidden')
    target=root/str(real).lstrip('/'); target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(real,target); files.add(str(real))
    alias=root/str(p).lstrip('/')
    if str(p)!=str(real) and not alias.exists():
        alias.parent.mkdir(parents=True,exist_ok=True); alias.symlink_to(str(real))
def closure(path):
    copy(path)
    output=subprocess.check_output(['ldd',str(path)],text=True)
    if 'not found' in output: raise RuntimeError('Missing runtime library')
    for line in output.splitlines():
        for part in line.split():
            if part.startswith('/'): copy(part)
for binary in sys.argv[1:]: closure(binary)
if os.environ.get('WITH_PYTHON') == '1':
    lib=pathlib.Path('/usr/local/lib/python3.14')
    shutil.copytree(lib,root/'usr/local/lib/python3.14',ignore=shutil.ignore_patterns('__pycache__','site-packages','ensurepip','idlelib','tkinter','test','tests'))
    # Sandbox needs only standard-library ctypes/json/platform/os/resource; no
    # SSL, SQLite, XML parser, compression/archive or package installation modules.
    keep={'_ctypes','_struct','_json','resource','_posixsubprocess','math','_opcode','_typing','_datetime','_contextvars','select','fcntl','binascii'}
    for extension in (root/'usr/local/lib/python3.14/lib-dynload').glob('*.so'):
        if extension.name.split('.')[0] not in keep: extension.unlink()
        else: closure(lib/'lib-dynload'/extension.name)
    (root/'usr/bin/python3').symlink_to('/usr/local/bin/python3.14')
    copy('/usr/local/lib/python3.14/LICENSE.txt')
copy('/etc/debian_version')
copy('/usr/local/LICENSE')
copy('/etc/os-release')
# Scanners need a regular os-release, not an absolute symlink in an archive.
(root/'etc/os-release').unlink()
shutil.copyfile('/etc/os-release',root/'etc/os-release')
(root/'etc/passwd').write_text('media:x:1000:1000:media:/nonexistent:/usr/sbin/nologin\n')
(root/'etc/group').write_text('media:x:1000:\n')
(root/'etc/nsswitch.conf').write_text('hosts: files dns\npasswd: files\ngroup: files\n')
packages=set()
for path in sorted(files):
    lookup=subprocess.run(['dpkg-query','-S',path],capture_output=True,text=True)
    for line in lookup.stdout.splitlines():
        package=line.split(': /')[0]
        if package and ' ' not in package: packages.add(package)
status=[]; inventory=[]
for package in sorted(packages):
    status.append(subprocess.check_output(['dpkg-query','-s',package],text=True).strip())
    inventory.append(subprocess.check_output(['dpkg-query','-W','-f=${Package}\t${Version}\n',package],text=True).strip())
    license=pathlib.Path('/usr/share/doc')/package.split(':')[0]/'copyright'
    if license.exists(): copy(license)
(root/'var/lib/dpkg/status').write_text('\n\n'.join(status)+'\n')
(root/'opt/runtime-packages.txt').write_text('\n'.join(inventory)+'\n')
(root/'opt/runtime-files.json').write_text(json.dumps(sorted(files),indent=2)+'\n')
