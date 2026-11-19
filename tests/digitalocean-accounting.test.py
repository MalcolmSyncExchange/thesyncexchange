import importlib.util,json,pathlib,tempfile,unittest
spec=importlib.util.spec_from_file_location('accounting',pathlib.Path(__file__).resolve().parents[1]/'infra/media-host/do-accounting.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
A='1287548f-d8c3-4d24-9f77-e37593fc66db';B='c9f16c23-0c25-416c-b22e-b23a705b15cf';C='adaca448-f232-4a93-945e-22896c1a182e'
class Accounting(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=pathlib.Path(self.tmp.name)
  self.old={'provider':'digitalocean','host_id':'620470021','boot_id':A,'traffic_bytes':100,'log_bytes':8,'sampled_at':1000}
  self.original=json.dumps(self.old);(self.root/'ledger.json').write_text(self.original)
  self.e={'source':'authenticated provider interval data; conservative reserve','previous_boot':A,'current_boot':B,'coverage_start_ms':1000,'coverage_end_ms':9000,'current_boot_start_ms':1900,'traffic_bound_bytes':500,'log_bound_bytes':20}
 def event(self,**kw):return m.reconcile(self.root,B,m.digest(self.old),500,20,{**self.e,**kw},2000)
 def test_reboot_without_evidence_fails(self):
  with self.assertRaisesRegex(ValueError,'REBOOT_ACCOUNTING'):m.advance(self.root,self.old,B,10,2,2000)
 def test_carry_preserves_original_and_adds_current_once(self):
  self.event();v=m.advance(self.root,self.old,B,10,2,2100)
  self.assertEqual(v['traffic_bytes'],610);self.assertEqual(v['log_bytes'],28)
  self.assertEqual(m.advance(self.root,v,B,15,3,2200)['traffic_bytes'],615)
  self.assertEqual((self.root/'ledger.json').read_text(),self.original)
 def test_crash_after_event_can_resume(self):
  self.event();self.assertEqual(m.advance(self.root,self.old,B,10,2,2100)['traffic_bytes'],610)
 def test_idempotent_operator_retry(self):
  one=self.event();two=m.reconcile(self.root,B,m.digest(self.old),500,20,self.e,2100);self.assertEqual(one,two)
 def test_conflicting_adjustment_rejected(self):
  self.event()
  with self.assertRaisesRegex(ValueError,'CONFLICT'):m.reconcile(self.root,B,m.digest(self.old),501,20,{**self.e,'traffic_bound_bytes':501},2100)
 def test_stale_state_rejected(self):
  with self.assertRaisesRegex(ValueError,'STALE'):m.reconcile(self.root,B,'0'*64,500,20,self.e,2000)
 def test_missing_source_and_partial_coverage_rejected(self):
  for kw in ({'source':''},{'coverage_start_ms':1001},{'coverage_end_ms':1899},{'current_boot':C}):
   with self.subTest(kw=kw),self.assertRaisesRegex(ValueError,'EVIDENCE'):self.event(**kw)
 def test_counter_regression_rejected(self):
  with self.assertRaisesRegex(ValueError,'COUNTER_REGRESSION'):m.advance(self.root,self.old,A,99,8,2100)
 def test_corrupted_event_rejected(self):
  self.event();p=self.root/'reconciliations'/(B+'.json');x=json.loads(p.read_text());x['previous_sha256']='bad';p.write_text(json.dumps(x))
  with self.assertRaisesRegex(ValueError,'REBOOT_ACCOUNTING'):m.advance(self.root,self.old,B,10,2,2100)
 def test_second_reboot_requires_new_evidence(self):
  self.event();v=m.advance(self.root,self.old,B,10,2,2100)
  with self.assertRaisesRegex(ValueError,'REBOOT_ACCOUNTING'):m.advance(self.root,v,C,1,1,2200)
 def test_offset_corruption_rejected(self):
  self.event();p=self.root/'reconciliations'/(B+'.json');x=json.loads(p.read_text());x['traffic_offset']=0;p.write_text(json.dumps(x))
  with self.assertRaisesRegex(ValueError,'CORRUPT'):m.advance(self.root,self.old,B,10,2,2100)
 def test_state_corruption_rejected(self):
  self.event();v=m.advance(self.root,self.old,B,10,2,2100);v['traffic_bytes']=0
  with self.assertRaisesRegex(ValueError,'TOTAL'):m.advance(self.root,v,B,15,3,2200)
 def test_same_boot_migration_does_not_double_count(self):self.assertEqual(m.advance(self.root,self.old,A,110,5,2000)['traffic_bytes'],110)
 def test_missing_baseline_rejected(self):
  with self.assertRaisesRegex(ValueError,'BASELINE'):m.advance(self.root,None,A,1,1,2000)
if __name__=='__main__':unittest.main()
