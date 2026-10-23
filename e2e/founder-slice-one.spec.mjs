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
      await expect(page.getByRole('menuitem', { name: role === 'buyer' ? 'My Purchases' : 'Catalog' })).toHaveAttribute('href', role === 'buyer' ? '/buyer/orders' : '/artist/catalog');
      await expect(page.getByRole('menuitem', { name: role === 'buyer' ? 'Catalog' : 'My Purchases', exact: true })).toHaveCount(0);
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
test('missing payment configuration leaves admin available', async ({page,context}) => {
  await session(context,'admin'); await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading',{level:1,name:'What needs my attention?',exact:true})).toBeVisible();
  const readiness = page.getByRole('region', {name:'Payment Readiness',exact:true});
  await expect(readiness).toBeVisible();
  await expect(readiness.getByRole('status', {name:'Checkout readiness',exact:true})).toHaveText('Blocked');
  await expect(readiness.getByRole('status', {name:'Payment configuration',exact:true})).toHaveText('Blocked');
  await expect(readiness.getByRole('alert')).toContainText('Checkout is blocked by deployment configuration');
  await expect(readiness.getByText('Unknown · 6 capabilities not verified', {exact:true})).toBeVisible();
  await expect(page.getByRole('link', {name:'Open Action Center',exact:true})).toBeVisible();
  await page.getByRole('link', {name:'Open Action Center',exact:true}).click();
  await expect(page.getByRole('heading', {level:1,name:'Action Center',exact:true})).toBeVisible();
  await page.goto('/admin/dashboard');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'output/founder-audit/admin-config-mobile.png'});
});
test('buyer must explicitly select a license before read-only review with payment unavailable', async ({page,context}) => {
  await page.setViewportSize({width:390,height:844});
  await session(context,'buyer');
  const writes = [];
  const analytics = [];
  const observe = request => {
    const pathname = new URL(request.url()).pathname;
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(pathname);
    if (pathname === '/api/analytics') analytics.push(pathname);
  };
  page.on('request', observe);
  await page.goto('/buyer/orders');
  await expect(page.getByRole('heading', {name:'My Purchases',exact:true})).toBeVisible();
  const purchaseLinks = () => page.locator('main a[href^="/buyer/orders/"]').evaluateAll(links => [...new Set(links.map(link => link.getAttribute('href')))].sort());
  const purchasesBefore = await purchaseLinks();
  expect(purchasesBefore).toContain('/buyer/orders/ord-1');

  for (const query of ['', '?licenseTypeId=invalid-license']) {
    await page.goto(`/buyer/checkout/midnight-run${query}`);
    await expect(page).toHaveURL(`${baseURL}/buyer/catalog/midnight-run?selection=unavailable#licenses`);
    await expect(page.getByRole('heading', {level:1,name:'Midnight Run',exact:true})).toBeVisible();
    await expect(page.getByRole('region', {name:'Choose a license'})).toBeVisible();
    await expect(page.getByRole('region', {name:'Choose a license'}).getByRole('alert')).toHaveText('That license selection is unavailable. Please choose an available license below.');
    await expect(page.getByRole('radio', {checked:true})).toHaveCount(0);
    await expect(page.getByRole('button', {name:'Continue to Checkout',exact:true})).toBeDisabled();
    await expect(page.getByTestId('buyer-checkout-form')).toHaveCount(0);
    expect(writes, 'Redirect/render must not initiate commerce or analytics').toEqual([]);
    expect(analytics).toEqual([]);
  }

  const radio = page.getByRole('radio', {name:'Digital Campaign $1,200.00 USD',exact:true});
  await radio.check();
  await expect(page.getByRole('radio', {checked:true})).toHaveValue('lt-1');
  await expect(page).toHaveURL(`${baseURL}/buyer/catalog/midnight-run?licenseTypeId=lt-1#licenses`);
  await page.getByRole('link', {name:'Continue to Checkout',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Review your license',exact:true})).toBeVisible();
  const review = page.getByRole('region', {name:'Digital Campaign',exact:true});
  await expect(review.getByText('$1,200.00 USD', {exact:true})).toBeVisible();
  await expect(review.getByRole('status')).toContainText('Payment is temporarily unavailable');
  const confirmation = review.getByRole('checkbox', {name:'I have reviewed this license and its current price.'});
  await expect(confirmation).not.toBeChecked();
  await confirmation.check();
  await expect(review.getByRole('button', {name:/^Continue to (Test )?Payment$/})).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:'output/founder-audit/checkout-config-mobile.png'});

  await review.getByRole('link', {name:'Change license',exact:true}).click();
  await expect(page.getByRole('radio', {checked:true})).toHaveValue('lt-1');
  await page.reload();
  await expect(page.getByRole('radio', {checked:true})).toHaveValue('lt-1');
  await page.goto('/buyer/orders');
  await expect(page.getByRole('heading', {name:'My Purchases',exact:true})).toBeVisible();
  expect(await purchaseLinks(), 'Review must not add a purchase').toEqual(purchasesBefore);
  expect(writes, 'No payment mutation means no order or Stripe session is initiated').toEqual([]);
  expect(analytics, 'Analytics stays disabled through redirect, explicit choice, review and restoration').toEqual([]);
  page.off('request', observe);
  await page.goto('/admin/dashboard');
  // Credential-free builds may prerender the dashboard alias to login. Both deny admin access.
  await expect(page).toHaveURL(/\/(?:buyer\/dashboard|login)/);
  await expect(page.getByRole('heading', {name:'What needs my attention?',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region', {name:'Payment Readiness',exact:true})).toHaveCount(0);
  await session(context,'artist'); await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/(?:artist\/dashboard|login)/);
  await expect(page.getByRole('region', {name:'Payment Readiness',exact:true})).toHaveCount(0);
  await context.clearCookies(); await page.goto('/admin/dashboard'); await expect(page).toHaveURL(/\/login/);
});
