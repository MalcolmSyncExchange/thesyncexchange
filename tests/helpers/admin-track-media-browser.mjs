import assert from 'node:assert/strict';
import path from 'node:path';
import { expect } from '@playwright/test';
import { parseWaveform } from '../../lib/media/waveform.mjs';

const image = page => page.getByRole('img', { name: 'Full recording waveform' });
const controls = page => page.getByRole('region', { name: 'Full recording and preview selection' });
const mediaPaths = assets => ({
  original: `/api/media/${assets.submission}/${assets.master}/original`,
  waveform: `/api/media/${assets.submission}/${assets.waveform}`,
  signed: `/storage/v1/object/sign/submission-source/${assets.objectPath}`
});

export async function verifyAdminTrackMedia({ page, origin, output, name, assets, providerUrl }) {
  const queue = '/admin/review-queue?status=all&page=2';
  const record = page.getByRole('link', { name: 'Open record for Synthetic Track' });
  const paths = mediaPaths(assets);
  const original = page.waitForResponse(r => new URL(r.url()).pathname === paths.original && r.request().method() === 'POST');
  const waveform = page.waitForResponse(r => new URL(r.url()).pathname === paths.waveform && r.request().method() === 'GET');
  await page.goto(origin + queue);
  await record.click();
  await expect(page.getByRole('heading', { name: 'Synthetic Track', exact: true })).toBeVisible();
  await expect(controls(page)).toBeVisible();
  await expect(page.locator('audio')).toHaveCount(1);
  await expect(image(page)).toBeVisible();
  const waveResponse = await waveform;
  assert.equal(waveResponse.status(), 200);
  assert.match(waveResponse.headers()['cache-control'], /private, no-store/);
  assert.equal(parseWaveform(await waveResponse.body(), assets.wavHash).minima.length, 3000);
  const region = controls(page).getByRole('slider', { name: 'Preview region start' });
  await expect(region).toHaveAttribute('aria-disabled', 'true');
  await expect(region).toHaveAttribute('tabindex', '-1');
  await expect(controls(page).getByText('Public Preview · 0:00.000–0:30.000 · Saved region')).toBeVisible();
  assert.equal(await page.locator('audio').getAttribute('src'), null);

  const play = controls(page).getByRole('button', { name: 'Play Full Track' });
  const signed = page.waitForResponse(r => new URL(r.url()).pathname === paths.signed);
  await play.focus();
  await expect(play).toBeFocused();
  await page.keyboard.press('Enter');
  const authorization = await original;
  assert.equal(authorization.status(), 200);
  assert.match(authorization.headers()['cache-control'], /private, no-store/);
  const capability = await authorization.json();
  assert.equal(capability.assetId, assets.master);
  assert.ok(capability.expiresAt > Date.now() && capability.expiresAt <= Date.now() + 60_000);
  const signedUrl = new URL(capability.url);
  assert.equal(signedUrl.origin, providerUrl);
  assert.equal(signedUrl.pathname, paths.signed);
  assert.ok(signedUrl.searchParams.has('token'));
  const audioResponse = await signed;
  assert.ok([200, 206].includes(audioResponse.status()));
  assert.equal(audioResponse.headers()['accept-ranges'], 'bytes');
  await expect.poll(() => page.locator('audio').evaluate(a => a.currentTime)).toBeGreaterThan(0.2);
  await page.keyboard.press('Enter');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.locator('audio').evaluate(a => a.paused)).toBe(true);
  const position = controls(page).getByRole('slider', { name: 'Recording playback position' });
  await expect.poll(() => page.locator('audio').evaluate(a => a.seekable.length ? a.seekable.end(0) : 0)).toBeGreaterThan(10);
  await position.focus();
  await expect(position).toBeFocused();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(() => page.locator('audio').evaluate(a => a.currentTime)).toBeGreaterThan(9);
  await controls(page).getByRole('button', { name: 'Mute recording' }).click();
  await expect.poll(() => page.locator('audio').evaluate(a => a.muted)).toBe(true);
  await controls(page).getByRole('button', { name: 'Unmute recording' }).click();
  await expect(controls(page).getByRole('alert')).toHaveCount(0);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await play.focus();
    await expect(play).toBeFocused();
    const size = await controls(page).evaluate(player => {
      const main = document.querySelector('#admin-main').getBoundingClientRect();
      const box = player.getBoundingClientRect();
      const targets = [...player.querySelectorAll('button, input, [role="slider"], svg[role="img"]')];
      return { width: box.width, available: main.width, visible: box.left >= main.left && box.right <= main.right,
        overflow: player.scrollWidth - player.clientWidth, clipped: targets.filter(target => {
          const child = target.getBoundingClientRect();
          return child.width > 0 && (child.left < box.left - 1 || child.right > box.right + 1);
        }).map(target => target.getAttribute('aria-label') || target.textContent) };
    });
    assert.ok(size.visible && size.overflow <= 1 && size.width <= size.available, JSON.stringify(size));
    assert.deepEqual(size.clipped, []);
    await controls(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `${name}-admin-track-waveform-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goBack();
  await expect(record).toBeFocused();
  await expect(record).toBeInViewport({ ratio: 1 });
  assert.match(page.url(), /status=all&page=2&record=/);
  await page.goForward();
  await expect(image(page)).toBeVisible();
  await page.getByRole('link', { name: 'Back to Track Submissions' }).click();
  await expect(record).toBeFocused();
  await record.click();
  await page.getByRole('link', { name: 'Inspect private assets, processing and integrity' }).click();
  await expect(page).toHaveURL(`${origin}/admin/media?draft=${assets.submission}`);
  await expect(page.getByRole('region', { name: 'Recording studio' })).toBeVisible();
  await expect(image(page)).toBeVisible();
  await page.goBack();
  await expect(image(page)).toBeVisible();
}

export async function verifyUnavailableTrackMedia({ page, origin, fixture, media }) {
  const detail = `${origin}/admin/tracks/${fixture.draftTrack}`;
  const empty = page.getByRole('heading', { name: 'Review media unavailable' });
  const hits = [];
  const capture = request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/media/') || pathname.includes('/storage/v1/object/sign/')) hits.push(pathname);
  };
  page.on('request', capture);
  try {
    await page.goto(`${origin}/admin/tracks/${fixture.track}`);
    await expect(empty).toBeVisible();
    await expect(page.locator('audio')).toHaveCount(0);
    for (const change of [
      state => ({ ...state, waveform: null }),
      state => ({ ...state, files: state.files.map(file => file.role === 'master' ? { ...file, retired: true } : file) }),
      state => ({ ...state, waveform: { ...state.waveform, source_id: fixture.track } })
    ]) {
      media.simulateAdminRead(change);
      await page.goto(detail);
      await expect(empty).toBeVisible();
      await expect(page.locator('audio')).toHaveCount(0);
      await expect(image(page)).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Inspect private assets, processing and integrity' })).toBeVisible();
    }
    assert.deepEqual(hits, []);
  } finally {
    media.simulateAdminRead(undefined);
    page.off('request', capture);
  }
}

export async function verifyAdminMediaDenials({ page, origin, providerUrl, fixture, assets, login }) {
  const { original, waveform, signed } = mediaPaths(assets);
  async function denied(status) {
    assert.equal((await page.request.get(origin + waveform)).status(), status);
    const response = await page.request.post(origin + original, { headers: { origin } });
    assert.equal(response.status(), status);
    assert.deepEqual(Object.keys(await response.json()), ['error']);
  }
  assert.equal((await page.request.get(providerUrl + signed, { ignoreHTTPSErrors: true })).status(), 403);
  fixture.invalidate(fixture.admin.id);
  await denied(401);
  await page.goto(`${origin}/admin/tracks/${fixture.draftTrack}`);
  assert.equal(new URL(page.url()).pathname, '/login');
  await expect(image(page)).toHaveCount(0);
  await login(page, 'admin@fixture.invalid');
  await page.waitForURL(/\/account\/security/);
  await denied(403);
  await login(page, 'buyer@fixture.invalid');
  await page.waitForURL(/\/buyer\//);
  await denied(403);
  fixture.seed('other-artist@fixture.invalid', 'artist', { complete: true });
  await login(page, 'other-artist@fixture.invalid');
  await page.waitForURL(url => url.pathname !== '/login');
  await denied(403);
  await page.context().clearCookies();
  await denied(401);
}
