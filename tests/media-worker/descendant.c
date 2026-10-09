/* Synthetic local-only parser fixture. No media, network or hosted credentials. */
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <errno.h>
int main(int argc,char **argv) {
  if(argc!=4)return 64;
  if(!strcmp(argv[1],"readonly")) {
    int f=open(argv[2],O_WRONLY);
    if(f!=-1){write(f,"MUTATED",7);close(f);return 70;}
    return errno==EACCES?0:71;
  }
  int out=open(argv[2],O_CREAT|O_WRONLY|O_EXCL,0600),sync[2];
  if(out<0||pipe(sync))return 65;
  pid_t child=fork();if(child<0)return 66;
  if(child==0) {
    close(sync[0]);
    if(setsid()!=-1||setpgid(0,0)!=-1)write(out,"ESCAPED",7);
    write(sync[1],"r",1);close(sync[1]);
    /* Exercise both inherited pipes and the closed-pipe late-writer case. */
    if(!strcmp(argv[1],"closed"))for(int fd=0;fd<32;fd++)if(fd!=out)close(fd);
    while(1){write(out,"x",1);usleep(20000);}
  }
  close(sync[1]);char ready;read(sync[0],&ready,1);close(sync[0]);
  FILE *pid=fopen(argv[3],"w");if(!pid)return 67;fprintf(pid,"%ld",(long)child);fclose(pid);
  if(!strcmp(argv[1],"timeout")||!strcmp(argv[1],"cancel"))sleep(10);
  return !strcmp(argv[1],"failure")?1:0;
}
