"""Root-only atomic broker UID egress policy. Parser network remains none."""
import ipaddress,json,os,socket,subprocess,sys
HOSTS={'https':['thesyncexchange.com','sgpubcpldfxcuhjjdcau.supabase.co'],'database':['aws-1-us-east-2.pooler.supabase.com']}
def policy(resolve=socket.getaddrinfo):
 addresses={}
 for category,hosts in HOSTS.items():
  values=set()
  for host in hosts:
   entries=resolve(host,None,type=socket.SOCK_STREAM)
   current={str(ipaddress.ip_address(e[4][0])) for e in entries}
   if not current:raise ValueError('MISSING_DNS_IDENTITY')
   values|=current
  addresses[category]=values
 lines=['table inet tse_do_broker {']
 for name,values in addresses.items():
  for version,kind in [(4,'ipv4_addr'),(6,'ipv6_addr')]:
   selected=sorted(v for v in values if ipaddress.ip_address(v).version==version)
   lines.append(' set '+name+str(version)+' { type '+kind+'; elements = { '+', '.join(selected)+' }; }' if selected else ' set '+name+str(version)+' { type '+kind+'; }')
 lines+=[' chain output { type filter hook output priority -10; policy accept;',
 '  meta skuid 20000 ct state established,related accept',
 '  meta skuid 20000 ip daddr 127.0.0.53 udp dport 53 accept',
 '  meta skuid 20000 ip daddr 127.0.0.53 tcp dport 53 accept',
 '  meta skuid 20000 ip daddr @https4 tcp dport 443 accept',
 '  meta skuid 20000 ip6 daddr @https6 tcp dport 443 accept',
 '  meta skuid 20000 ip daddr @database4 tcp dport 5432 accept',
 '  meta skuid 20000 ip6 daddr @database6 tcp dport 5432 accept',
 '  meta skuid 20000 reject',' }','}']
 return '\n'.join(lines)+'\n'
if __name__=='__main__':
 if os.geteuid()!=0:raise SystemExit('ROOT_REQUIRED')
 text=policy()
 # --check performs no change. An apply is explicit and replaces only our table;
 # existing inbound firewall and SSH rules are left intact.
 existing=subprocess.run(['/usr/sbin/nft','list','table','inet','tse_do_broker'],capture_output=True).returncode==0
 batch=('delete table inet tse_do_broker\n' if existing else '')+text
 subprocess.run(['/usr/sbin/nft','--check','-f','-'],input=batch.encode(),check=True)
 if sys.argv[1:]==['--apply']:subprocess.run(['/usr/sbin/nft','-f','-'],input=batch.encode(),check=True)
 elif sys.argv[1:]!=['--check']:raise SystemExit('EXPLICIT_CHECK_OR_APPLY_REQUIRED')
 print(json.dumps({'policy':'broker UID 20000 exact DNS/TLS endpoints; all other IP egress rejected','applied':sys.argv[1:]==['--apply']}))
