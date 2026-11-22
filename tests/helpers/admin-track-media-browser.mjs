import assert from 'node:assert/strict';
import path from 'node:path';
import { expect } from '@playwright/test';
import { parseWaveform } from '../../lib/media/waveform.mjs';

const image = page => page.getByRole('img', { name: 'Full recording waveform' });
const controls = page => page.getByRole('region', { name: 'Review audio' });
const mediaPaths = assets => ({
  original: `/api/media/${assets.submission}/${assets.master}/original`,
  waveform: `/api/media/${assets.submission}/${assets.waveform}`,
  signed: `/storage/v1/object/sign/submission-source/${assets.objectPath}`
});

export async function verifyReviewSigning({ page, origin, fixture, assets, baseline = false }) {
  const { original, signed } = mediaPaths(assets);
  const detail = origin + '/admin/tracks/' + fixture.draftTrack;
  const timeline = controls(page).getByRole('group', { name: 'Waveform timeline' });
  const initialPlay = controls(page).getByRole('button', { name: 'Play Full Track' });
  const toggle = controls(page).getByRole('button', { name: /^(Play|Pause) Full Track$/ });
  const audio = controls(page).locator('audio');
  const observations = [];
  const isOriginal = request => request.method() === 'POST' && new URL(request.url()).pathname === original;
  const providerSigns = () => fixture.calls.filter(call => call.method === 'POST' && call.path === signed).length;
  let requests = 0;
  const capture = request => { if (isOriginal(request)) requests++; };
  page.on('request', capture);
  try {
    if (!baseline) await page.clock.install();
    for (const [width, height, gesture] of [[1440, 1000, 'click'], [820, 1024, 'Enter'], [390, 844, 'Space']]) {
      const start = { app: requests, storage: providerSigns() };
      const observation = { width, height };
      const count = () => ({ app: requests - start.app, storage: providerSigns() - start.storage });
      async function measure(phase, expected) {
        // Allow a viewport/input callback to reach the local signer before evaluating silence.
        await page.waitForTimeout(300);
        observation[phase] = count();
        assert.deepEqual(observation[phase], { app: expected, storage: expected }, width + 'px ' + phase);
      }
      await page.setViewportSize({ width, height });
      await page.goto(detail);
      await expect(image(page)).toBeInViewport();
      await expect(timeline).toBeInViewport();
      await measure('opening', baseline ? 1 : 0);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await expect(timeline).not.toBeInViewport();
      await timeline.scrollIntoViewIfNeeded();
      await expect(timeline).toBeInViewport();
      await measure('scrolling', baseline ? 1 : 0);
      await initialPlay.focus();
      await expect(initialPlay).toBeFocused();
      const preview = controls(page).getByRole('button', { name: 'Play Public Preview' });
      await preview.hover();
      await preview.focus();
      await expect(preview).toBeFocused();
      await initialPlay.focus();
      await measure('hoveringAndFocusing', baseline ? 1 : 0);
      assert.equal(await audio.getAttribute('src'), null);

      if (!baseline) {
        observation.gesture = gesture;
        const authorized = page.waitForResponse(response => isOriginal(response.request()));
        const range = page.waitForResponse(response => new URL(response.url()).pathname === signed && response.status() === 206);
        if (gesture === 'click') await initialPlay.click();
        else await page.keyboard.press(gesture);
        const authorization = await authorized;
        assert.equal(authorization.status(), 200);
        const capability = await authorization.json();
        assert.equal(capability.assetId, assets.master);
        assert.match((await range).headers()['content-range'], /^bytes \d+-\d+\/\d+$/);
        await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThan(0.2);
        await measure('playing', 1);

        for (let i = 0; i < 3; i++) {
          await toggle.press('Space');
          await expect.poll(() => audio.evaluate(element => element.paused)).toBe(true);
          await expect(toggle).toHaveAttribute('aria-pressed', 'false');
          await toggle.press('Enter');
          await expect.poll(() => audio.evaluate(element => element.paused)).toBe(false);
        }
        await toggle.press('Space');
        await expect.poll(() => audio.evaluate(element => element.paused)).toBe(true);
        await expect(toggle).toHaveAttribute('aria-pressed', 'false');
        await measure('pauseAndResume', 1);

        if (width === 1440) {
          // Move browser time past the real capability TTL without pushing real sessions forward.
          await page.clock.setSystemTime(capability.expiresAt + 1);
          await toggle.blur();
          await toggle.focus();
          await measure('focusAfterExpiry', 1);
          const renewed = page.waitForResponse(response => isOriginal(response.request()));
          await page.keyboard.press('Enter');
          const renewal = await renewed;
          assert.equal(renewal.status(), 200);
          const updated = await renewal.json();
          assert.equal(updated.assetId, assets.master);
          assert.notEqual(updated.url, capability.url);
          await expect.poll(() => audio.evaluate(element => element.paused)).toBe(false);
          await page.clock.setSystemTime(Date.now());
          await measure('explicitRenewal', 2);
        }
      }
      observations.push(observation);
    }
    return observations;
  } finally {
    page.off('request', capture);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}

export async function verifyLegacyMasterPlayback({ page, assets, fixture, open }) {
  const { original, signed } = mediaPaths(assets);
  const player = page.getByRole('region', { name: 'Full recording and preview selection' });
  const signs = () => fixture.calls.filter(call => call.method === 'POST' && call.path === signed).length;
  const before = signs();
  let requests = 0;
  const capture = request => { if (new URL(request.url()).pathname === original && request.method() === 'POST') requests++; };
  page.on('request', capture);
  try {
    await open();
    await expect(image(page)).toBeVisible();
    const play = player.getByRole('button', { name: 'Play Full Track' });
    await play.focus();
    await expect(play).toBeFocused();
    // The shared player retains its existing viewport and focus warmup on these surfaces.
    await expect.poll(signs).toBe(before + 1);
    const range = page.waitForResponse(response => new URL(response.url()).pathname === signed && response.status() === 206);
    await page.keyboard.press('Enter');
    await range;
    await expect.poll(() => player.locator('audio').evaluate(element => element.currentTime)).toBeGreaterThan(0.2);
    assert.equal(signs(), before + 1);
    assert.equal(requests, 1);
  } finally {
    page.off('request', capture);
  }
}

export async function verifyExpiredReviewPlayback({ page, origin, fixture, media, assets }) {
  const { original, signed } = mediaPaths(assets);
  const signs = () => fixture.calls.filter(call => call.method === 'POST' && call.path === signed).length;
  const before = signs();
  const player = controls(page);
  const play = player.getByRole('button', { name: 'Play Full Track' });
  await page.goto(origin + '/admin/tracks/' + fixture.draftTrack);
  await expect(image(page)).toBeVisible();
  media.expireNextOriginal();
  const expired = page.waitForResponse(response => new URL(response.url()).pathname === signed && response.status() === 403);
  await play.click();
  await expired;
  await expect(player.getByRole('alert')).toContainText(/unavailable/i);
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  assert.equal(signs(), before + 1);

  const renewed = page.waitForResponse(response => new URL(response.url()).pathname === original && response.request().method() === 'POST');
  const recovered = page.waitForResponse(response => new URL(response.url()).pathname === signed && response.status() === 206);
  await play.press('Enter');
  assert.equal((await renewed).status(), 200);
  await recovered;
  await expect.poll(() => player.locator('audio').evaluate(element => element.currentTime)).toBeGreaterThan(0.2);
  await expect(player.getByRole('alert')).toHaveCount(0);
  assert.equal(signs(), before + 2);
}

export async function verifyAdminTrackMedia({ page, origin, output, name, assets, providerUrl, fixture }) {
  const queue = '/admin/review-queue?status=all&page=2';
  const record = page.getByRole('link', { name: 'Open record for Synthetic Track' });
  const paths = mediaPaths(assets);
  const original = page.waitForResponse(r => new URL(r.url()).pathname === paths.original && r.request().method() === 'POST');
  const waveform = page.waitForResponse(r => new URL(r.url()).pathname === paths.waveform && r.request().method() === 'GET');
  await page.goto(origin + queue);
  await record.click();
  await expect(page.getByRole('heading', { name: 'Synthetic Track', exact: true })).toBeVisible();
  await expect(controls(page)).toBeVisible();
  await expect(controls(page).getByRole('heading',{name:'Review audio'})).toBeVisible();
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
  const preview = controls(page).getByRole('button', { name: 'Play Public Preview' });
  await preview.click();
  await expect(controls(page).getByRole('button', { name: 'Pause Public Preview' })).toHaveAttribute('aria-pressed','true');
  await expect.poll(() => page.locator('audio').evaluate(a => a.paused)).toBe(false);
  await controls(page).getByRole('button', { name: 'Pause Public Preview' }).click();
  await expect(controls(page).getByRole('alert')).toHaveCount(0);

  for (const [width, height] of [[1440, 1000], [820, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
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
    const playBottom = await play.evaluate(button => button.getBoundingClientRect().bottom + scrollY);
    assert.ok(playBottom <= height, `Full-track playback requires scrolling at ${width}px`);
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
  await verifyLegacyMasterPlayback({ page, assets, fixture, open: async () => {
    await page.getByRole('link', { name: 'Inspect media in Media Operations' }).click();
    await expect(page).toHaveURL(`${origin}/admin/media?draft=${assets.submission}`);
    await expect(page.getByRole('region', { name: 'Recording studio' })).toBeVisible();
  } });
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
      await expect(page.getByRole('link', { name: 'Inspect media in Media Operations' })).toBeVisible();
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
