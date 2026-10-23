import {test,expect} from '@playwright/test';
import {mkdir,copyFile,rm} from 'node:fs/promises';
const dir='app/combined-release-fixture-local';
let created=false;
test.beforeAll(async()=>{await mkdir(dir);created=true;await copyFile('tests/fixtures/combined-release-page.tsx.fixture',`${dir}/page.tsx`);});
test.afterAll(async()=>{if(created)await rm(dir,{recursive:true,force:true});});
async function isolated(context){await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:3087'?r.continue():r.abort());}
async function artist(context,step='basics'){
 const user={id:'combined-fixture-artist',email:'artist@fixture.invalid',role:'artist',fullName:'Fixture Artist',onboardingStep:step,onboardingCompletedAt:null,onboardingData:{fullName:'Fixture Artist',artistName:'Fixture Stage',bio:'A useful fixture biography with enough context.',location:'London',payoutEmail:'payout@fixture.invalid',firstTrackChoice:'later'}};
 await context.addCookies([{name:'sync-exchange-session',url:'http://127.0.0.1:3087',value:JSON.stringify(user)},{name:'sync-exchange-demo-directory',url:'http://127.0.0.1:3087',value:JSON.stringify({users:[user],artistProfiles:{},buyerProfiles:{}})}]);
}
for(const width of [375,768,1440]){
 test(`onboarding native validation, saved progress and responsive rendering ${width}px`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:900}});await isolated(context);await artist(context);const page=await context.newPage();let captures=0;page.on('request',r=>{if(r.url().includes('/api/analytics'))captures++;});
  await page.goto('/onboarding/artist');await expect(page.getByRole('heading',{name:'Account basics',exact:true})).toBeVisible();
  const name=page.getByLabel('Full name',{exact:true});await name.fill('');await page.getByRole('button',{name:'Continue to Profile',exact:true}).click();await expect(page).toHaveURL(/\/onboarding\/artist$/);expect(await name.evaluate(e=>e.validity.valueMissing)).toBe(true);
  await name.fill('Fixture Artist');await page.getByLabel('Artist or stage name').fill('Fixture Stage');await page.getByRole('button',{name:'Continue to Profile',exact:true}).click();await expect(page).toHaveURL(/step=profile/);await expect(page.getByLabel('Bio',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByLabel('Bio',{exact:true})).toBeVisible();
  await page.goto('/onboarding/artist?step=complete');await expect(page.getByLabel('Bio',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);expect(captures).toBe(0);
  await page.screenshot({path:`/private/tmp/tse-combined-onboarding-${width}.png`,fullPage:true});
  for(const [step,title]of [['licensing','Licensing setup'],['first-track','Choose your next move'],['complete','Review your artist setup before finishing']]){
   await artist(context,step);await page.goto('/onboarding/artist');await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
   if(step==='licensing'){const email=page.getByLabel('Payout email',{exact:true});await email.fill('invalid');expect(await email.evaluate(e=>e.validity.typeMismatch)).toBe(true);}
   if(step==='first-track'){await page.locator('input[value="later"]').check();await expect(page.locator('input[value="later"]')).toBeChecked();}
   if(step==='complete'){await expect(page.getByText('The setup is complete.',{exact:false})).toHaveCount(0);await expect(page.getByText('Finish setup to save completion, then choose where to go next.',{exact:true})).toBeVisible();await expect(page.locator('form')).toHaveCount(1);await expect(page.getByRole('button',{name:/Finish and/})).toHaveCount(2);await page.screenshot({path:`/private/tmp/tse-combined-review-${width}.png`,fullPage:true});}
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  }
  expect(captures).toBe(0);await context.close();
 });
 test(`SEC pagination, chart keyboard and unavailable financial feed ${width}px`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:900}});await isolated(context);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/combined-release-fixture-local');await expect(page.getByText('Track page 1 of 3', {exact:false})).toBeVisible();
  const chart=page.getByRole('region',{name:'Marketplace activity time series'});const points=chart.getByRole('button');await points.first().focus();await points.first().press('ArrowRight');await expect(points.nth(1)).toBeFocused();await expect(chart.getByRole('tooltip')).toContainText('2026-01-02');
  await page.getByLabel('Chart metric').selectOption('license_selected');await page.getByRole('button',{name:'Apply / refresh'}).click();await expect(page).toHaveURL(/seriesMetric=license_selected/);await expect(page.getByLabel('Chart metric')).toHaveValue('license_selected');
  await page.goto('/combined-release-fixture-local?trackPage=2');await expect(page.getByText('Track page 2 of 3',{exact:false})).toBeVisible();await expect(page.getByRole('heading',{name:'Track track-050',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Track track-000',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await page.screenshot({path:`/private/tmp/tse-combined-sec-${width}.png`,fullPage:true});
  await page.goto('/combined-release-fixture-local?tests=yes');await expect(page.getByText('No track-level evidence in this window.',{exact:true})).toBeVisible();
  await page.goto('/combined-release-fixture-local?unavailable=yes');await expect(page.getByText('Track evidence unavailable',{exact:true})).toBeVisible();
  await page.goto('/combined-release-fixture-local?view=financial');await expect(page.getByRole('heading',{name:'Financial Intelligence',exact:true})).toBeVisible();await expect(page.getByText('Unavailable is not zero.',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.goto('/combined-release-fixture-local?interval=hour&start=2026-01-01&end=2026-01-09');await expect(page.getByRole('alert').filter({hasText:'maximum seven days'})).toContainText('maximum seven days');expect(errors).toEqual([]);await context.close();
 });
}
test('unauthenticated and buyer sessions cannot enter admin reporting',async({browser})=>{
 const context=await browser.newContext();await isolated(context);const page=await context.newPage();await page.goto('/admin/analytics');await expect(page).toHaveURL(/\/login/);
 await context.addCookies([{name:'sync-exchange-session',url:'http://127.0.0.1:3087',value:JSON.stringify({id:'combined-fixture-buyer',email:'buyer@fixture.invalid',role:'buyer',fullName:'Fixture Buyer',onboardingComplete:true})}]);await page.goto('/admin/analytics');await expect(page).not.toHaveURL(/\/admin\/analytics/);await context.close();
});
