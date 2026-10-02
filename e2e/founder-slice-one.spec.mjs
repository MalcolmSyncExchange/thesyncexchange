import { test, expect } from '@playwright/test';

// Run only against the isolated local demo server. These cookies are never real sessions.
const baseURL = process.env.E2E_BASE_URL || '';
test.beforeEach(() => {
  test.skip(!/^http:\/\/127\.0\.0\.1:3106$/.test(baseURL), 'Local isolated demo fixture required');
});
async function session(context, role, id = `${role}-1`) {
  const email = role === 'artist' ? 'maya@sync.exchange' : role === 'buyer' ? 'music@northframe.co' : 'admin@thesyncexchange.com';
  await context.addCookies([{ name: 'sync-exchange-session', value: JSON.stringify({ id, email, role, fullName: 'QA Account', onboardingComplete: true }), url: baseURL }]);
}
for (const role of ['artist', 'buyer']) {
  for (const width of [1440, 390]) {
    test(`${role} account dropdown supports keyboard, role navigation, logout at ${width}px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 900 });
      await session(context, role);
      await page.goto(`/${role}/dashboard`);
      const trigger = page.getByRole('button', { name: /Open account menu/ });
      await trigger.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Dashboard', exact: true })).toHaveAttribute('href', `/${role}/dashboard`);
      await expect(page.getByRole('menuitem', { name: role === 'buyer' ? 'Purchases & orders' : 'Catalog' })).toHaveAttribute('href', role === 'buyer' ? '/buyer/orders' : '/artist/catalog');
      await expect(page.getByRole('menuitem', { name: role === 'buyer' ? 'Catalog' : 'Purchases & orders', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
      await trigger.click();
      await page.screenshot({path:`output/founder-audit/${role}-menu-${width}.png`});
      await page.getByRole('menuitem', {name:'Profile',exact:true}).click();
      await expect(page).toHaveURL(role === 'artist' ? /\/artist\/profile/ : /\/buyer\/settings#account-profile/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await trigger.click(); await page.getByRole('menuitem', {name:'Log out',exact:true}).click();
      await expect(page).toHaveURL(`${baseURL}/`);
      await page.goto(`/${role}/dashboard`); await expect(page).toHaveURL(/\/login/);
    });
  }
}
test('recent submission opens detail; foreign artist URL is denied', async ({page,context}) => {
  await session(context,'artist'); await page.goto('/artist/dashboard');
  const recent=page.getByRole('region',{name:'Your recent submissions'});
  await recent.getByRole('link',{name:'View Midnight Run',exact:true}).click();
  await expect(page).toHaveURL(/\/artist\/tracks\/midnight-run/);
  await expect(page.getByRole('heading',{level:1,name:'Midnight Run'})).toBeVisible();
  await page.goto('/artist/tracks/open-highway');
  await expect(page.getByRole('heading',{name:/page|found|find/i}).first()).toBeVisible();
  await expect(page.getByTestId('track-title-input')).toHaveCount(0);
});
test('missing payment configuration leaves admin available and checkout visibly blocked', async ({page,context}) => {
  await session(context,'admin'); await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading',{level:1})).toContainText('Keep submissions moving');
  await expect(page.getByRole('alert').filter({hasText:'Payments are unavailable'})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'output/founder-audit/admin-config-mobile.png'});
  await session(context,'buyer'); await page.goto('/buyer/checkout/midnight-run');
  await expect(page.getByRole('heading',{name:'License checkout'})).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:'Checkout is temporarily unavailable'})).toBeVisible();
  await expect(page.getByTestId('buyer-checkout-submit')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'output/founder-audit/checkout-config-mobile.png'});
  await page.goto('/admin/dashboard');
  // Credential-free builds may prerender the dashboard alias to login. Both deny admin access.
  await expect(page).toHaveURL(/\/(?:buyer\/dashboard|login)/);
  await expect(page.getByRole('heading', {name:'Keep submissions moving'})).toHaveCount(0);
  await context.clearCookies(); await page.goto('/admin/dashboard'); await expect(page).toHaveURL(/\/login/);
});
