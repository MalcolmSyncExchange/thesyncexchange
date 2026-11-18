import importlib.util,json,pathlib,tempfile,unittest,uuid
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('do_launcher',pathlib.Path(__file__).resolve().parents[1]/'infra/media-host/do-launcher.py');l=importlib.util.module_from_spec(spec);spec.loader.exec_module(l)
class Launcher(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.calls=[];self.container=None;self.fail=None
  self.boot=str(uuid.uuid4());self.config={'enabled':True,'image':'sha256:'+'b'*64,'build_digest':'sha256:'+'b'*64,'boot_id':self.boot}
  self.context={'run_id':str(uuid.uuid4()),'capability':'a'*64,'build_digest':self.config['image']};self.status=self.root/'status.json';self.status.write_text(json.dumps({'host_id':'620470021','boot_id':self.boot,'paused':False,'projected_usd':13,'sampled_at':1000000}))
  self.engine=l.Engine(self.config,self.root/'launcher',self.docker,lambda:1000,status_path=self.status,authorize=lambda config,run:None)
 def tearDown(self):self.tmp.cleanup()
 def docker(self,args):
  self.calls.append(args)
  if args[0]==self.fail:raise ValueError('uncertain command')
  if args[0]=='ps':return 'id' if self.container else ''
  if args[0]=='inspect':return json.dumps([self.container])
  if args[:2]==['image','inspect']:return json.dumps([{'Architecture':'amd64','Id':self.config['image']}])
  if args[0]=='create':self.container={'Config':{'Image':self.config['image'],'Labels':{'io.thesyncexchange.vm-run':self.context['run_id']}},'State':{'Running':False,'ExitCode':0}}
  if args[0]=='start':self.container['State']['Running']=True
  if args[0]=='kill':self.container['State']['Running']=False
  return ''
 def launch(self):
  with patch.object(l.os,'chown'),patch.object(l.shutil,'disk_usage',return_value=type('Disk',(),{'free':3*1024**3})()):return self.engine.start(self.context)
 def test_fixed_credential_free_one_shot_boundary(self):
  self.assertEqual(self.launch()['state'],'RUNNING');self.launch();self.assertEqual(sum(c[0]=='start' for c in self.calls),1)
  args=next(c for c in self.calls if c[0]=='create')
  for flag in ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=1000:1000','--cpus=1','--memory=1g','--memory-swap=1g','--pids-limit=32','--restart=no']:self.assertIn(flag,args)
  self.assertNotIn('docker.sock',' '.join(args));self.assertNotIn('credentials',' '.join(args));self.assertNotIn(self.context['capability'],' '.join(args))
  self.engine.stop(self.context['run_id']);self.assertFalse((self.engine.root/(self.context['run_id']+'.context')).exists());self.launch();self.assertEqual(sum(c[0]=='start' for c in self.calls),1)
 def test_interrupted_start_never_retries(self):
  self.fail='start'
  with self.assertRaises(ValueError):self.launch()
  self.fail=None;self.assertEqual(self.launch()['state'],'EXITED');self.assertEqual(sum(c[0]=='start' for c in self.calls),1)
 def test_daemon_failure_is_not_no_process(self):
  self.fail='ps'
  with self.assertRaises(ValueError):self.engine.status(self.context['run_id'])
 def test_wrong_boot_and_missing_accounting_deny(self):
  data=json.loads(self.status.read_text());data['boot_id']=str(uuid.uuid4());self.status.write_text(json.dumps(data))
  with self.assertRaises(ValueError):self.launch()
  self.status.unlink()
  with self.assertRaises(FileNotFoundError):self.launch()
  self.assertFalse(any(c[0]=='create' for c in self.calls))
 def test_stale_over_budget_nan_and_persistent_hold_deny(self):
  original=json.loads(self.status.read_text())
  for patch in [{'sampled_at':0},{'projected_usd':15},{'projected_usd':float('nan')},{'paused':True},{'host_id':'8797328859122759463'}]:
   self.status.write_text(json.dumps({**original,**patch}))
   with self.assertRaises(ValueError):self.launch()
  self.status.write_text(json.dumps(original));(self.root/'SUSPENDED').write_text('hold')
  with self.assertRaises(ValueError):self.launch()
 def test_independent_deadline_kills_hung_worker(self):
  self.launch();self.engine.now=lambda:1561;self.assertEqual(self.engine.status(self.context['run_id'])['state'],'EXITED');self.assertTrue(any(c[0]=='kill' for c in self.calls))
 def test_missing_live_permit_never_creates_container(self):
  def denied(*args):raise ValueError('not admitted')
  self.engine.authorize=denied
  with self.assertRaises(ValueError):self.launch()
  self.assertFalse(any(c[0]=='create' for c in self.calls))
 def test_image_change_is_not_adopted(self):
  self.launch();self.container['Config']['Image']='other'
  with self.assertRaises(ValueError):self.engine.status(self.context['run_id'])
if __name__=='__main__':unittest.main()
