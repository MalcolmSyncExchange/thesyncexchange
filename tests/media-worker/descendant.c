/* Synthetic native adversarial parser. No external services or real secrets. */
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/ptrace.h>
#include <sys/resource.h>
extern char **environ;
int main(int argc,char **argv) {
  if(argc<2)return 64;
  if(!strcmp(argv[1],"isolation")) {
    if(socket(AF_INET,SOCK_STREAM,0)!=-1||errno!=EPERM)return 72;
    if(argc!=3||strncmp(argv[2],"DENIED=",7))return 73;
    if(open(argv[2]+7,O_RDONLY)!=-1||errno!=EACCES)return 73;
    if(setsid()!=-1||errno!=EPERM)return 74;
    if(setpgid(0,0)!=-1||errno!=EPERM)return 75;
    if(ptrace(PTRACE_ATTACH,getppid(),0,0)!=-1||errno!=EPERM)return 76;
    if(syscall(SYS_process_vm_readv,getppid(),0,0,0,0,0)!=-1||errno!=EPERM)return 77;
    if(syscall(SYS_process_vm_writev,getppid(),0,0,0,0,0)!=-1||errno!=EPERM)return 78;
    if(syscall(SYS_kill,getppid(),0)!=-1||errno!=EPERM)return 79;
    if(syscall(1023)!=-1||errno!=EPERM)return 80;
    if(syscall(SYS_clone3,0,0)!=-1||errno!=ENOSYS)return 81;
    char path[128];snprintf(path,sizeof(path),"/proc/%ld/environ",(long)getppid());
    if(open(path,O_RDONLY)!=-1)return 82;
    snprintf(path,sizeof(path),"/proc/%ld/mem",(long)getppid());if(open(path,O_RDONLY)!=-1)return 83;
    int count=0;for(char **p=environ;*p;p++){count++;if(strncmp(*p,"LC_ALL=",7)&&strncmp(*p,"HOME=",5))return 84;}if(count!=2)return 85;
    if(open("unapproved-leaf",O_CREAT|O_WRONLY,0600)!=-1||(errno!=EACCES&&errno!=EROFS))return 86;
    if(fork()!=-1||errno!=EPERM)return 87;
    return 0;
  }
  if(argc!=3)return 64;
  if(!strcmp(argv[1],"readonly")) {
    int f=open(argv[2],O_WRONLY);
    if(f!=-1){write(f,"MUTATED",7);close(f);return 70;}
    return errno==EACCES?0:71;
  }
  if(!strcmp(argv[1],"memory")) {
    void *p=malloc(900UL*1024*1024);if(p){free(p);return 88;}return errno==ENOMEM?0:89;
  }
  int out=open(argv[2],O_WRONLY);if(out<0)return 65;
  // Process descendants are now denied, rather than cleaned up after escape.
  if(fork()!=-1||errno!=EPERM)return 66;
  write(out,"x",1);
  if(!strcmp(argv[1],"filelimit")) {char b[8192]={0};while(1)write(out,b,sizeof(b));}
  if(!strcmp(argv[1],"timeout")||!strcmp(argv[1],"cancel"))while(1){write(out,"x",1);usleep(20000);}
  close(out);return !strcmp(argv[1],"failure")?1:0;
}
