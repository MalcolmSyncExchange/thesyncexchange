import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync('components/marketing/homepage-motion-controller.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const compiled = { exports: {} };
new Function('module', 'exports', code)(compiled, compiled.exports);
const { attachHomepageMotion } = compiled.exports;

function setup({ reduce = false, fine = true, observer = true, hidden = false } = {}) {
  class Events {
    events = new Map();
    addEventListener(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
    removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
    fire(name, event = {}) { for (const fn of this.events.get(name) || []) fn(event); }
    listenerCount() { return [...this.events.values()].reduce((n, s) => n + s.size, 0); }
  }
  class Element extends Events {
    dataset = {};
    values = new Map();
    style = { getPropertyValue: key => this.values.get(key) || '', setProperty: (key, value) => this.values.set(key, value) };
    bounds = { top: 0, left: 0, width: 1440, height: 680 };
    getBoundingClientRect() { return this.bounds; }
    closest() { return this.revealParent || this; }
  }
  const root = new Element(), hero = new Element();
  const visible = new Element(), below = new Element(), second = new Element();
  visible.bounds.top = 740; below.bounds.top = 1100; second.bounds.top = 1500;
  const targets = [visible, below, second];
  root.querySelector = () => hero; root.querySelectorAll = () => targets;
  const reduced = Object.assign(new Events(), { matches: reduce });
  const pointer = Object.assign(new Events(), { matches: fine });
  const instances = [];
  class Observer {
    observed = new Set(); disconnected = false;
    constructor(callback, options) { this.callback = callback; this.options = options; instances.push(this); }
    observe(target) { this.observed.add(target); }
    unobserve(target) { this.observed.delete(target); }
    disconnect() { this.disconnected = true; this.observed.clear(); }
    intersect(target, isIntersecting) { if (this.observed.has(target)) this.callback([{ target, isIntersecting }]); }
  }
  let nextFrame = 0;
  const queue = new Map();
  const win = Object.assign(new Events(), { HTMLElement: Element, innerHeight: 900,
    matchMedia: query => query.includes('reduced-motion') ? reduced : pointer,
    requestAnimationFrame: fn => { queue.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => queue.delete(id)
  });
  if (observer) win.IntersectionObserver = Observer;
  const doc = Object.assign(new Events(), { visibilityState: hidden ? 'hidden' : 'visible' });
  const control = attachHomepageMotion(root, win, doc);
  const flush = () => { const work = [...queue.values()]; queue.clear(); work.forEach(fn => fn()); };
  return { root, hero, targets, reduced, pointer, win, doc, instances, queue, control, flush, Element };
}

test('late hydration leaves visible content exposed; viewport reveals run once', () => {
  const s = setup();
  assert.equal(s.targets[0].dataset.revealState, 'visible');
  assert.equal(s.targets[1].dataset.revealState, 'pending');
  s.instances[0].intersect(s.targets[1], true);
  assert.equal(s.targets[1].dataset.revealState, 'visible');
  assert.equal(s.instances[0].observed.has(s.targets[1]), false);
  s.instances[0].intersect(s.targets[1], false);
  assert.equal(s.targets[1].dataset.revealState, 'visible');
  s.control.dispose();
});

test('scroll/pointer events coalesce to one frame, cap depth and do not move foreground with the pointer', () => {
  const s = setup(); s.flush();
  s.hero.bounds.top = -340;
  for (let i = 0; i < 30; i++) s.win.fire('scroll');
  s.hero.fire('pointermove', { clientX: 9999, clientY: -9999, pointerType: 'mouse' });
  assert.equal(s.queue.size, 1); s.flush();
  assert.equal(s.root.values.get('--hero-scroll-y'), '6.00px');
  assert.equal(s.root.values.get('--hero-content-y'), '-4.00px');
  assert.equal(s.root.values.get('--hero-pointer-x'), '6.00px');
  assert.equal(s.root.values.get('--hero-pointer-y'), '-4.00px');
  s.hero.fire('pointerleave'); s.flush();
  assert.equal(s.root.values.get('--hero-pointer-x'), '0.00px');
  s.control.dispose();
});

test('touch and coarse pointers never generate cursor depth', () => {
  const s = setup({ fine: false }); s.flush();
  s.hero.fire('pointermove', { clientX: 1400, clientY: 650, pointerType: 'mouse' });
  assert.equal(s.queue.size, 0);
  s.pointer.matches = true; s.pointer.fire('change'); s.flush();
  s.hero.fire('pointermove', { clientX: 1400, clientY: 650, pointerType: 'touch' });
  assert.equal(s.queue.size, 0);
  assert.equal(s.root.values.get('--hero-pointer-x'), '0.00px');
  s.control.dispose();
});

test('reduced motion initially and on preference change reveals everything and schedules no work', () => {
  for (const initial of [true, false]) {
    const s = setup({ reduce: initial });
    s.reduced.matches = true; s.reduced.fire('change');
    assert.equal(s.root.dataset.motionReduced, 'true');
    assert.equal(s.root.dataset.motionPaused, 'true');
    assert.ok(s.targets.every(t => t.dataset.revealState === 'visible'));
    assert.equal(s.queue.size, 0);
    s.hero.fire('pointermove', { clientX: 1200, clientY: 100, pointerType: 'mouse' });
    s.win.fire('scroll'); assert.equal(s.queue.size, 0);
    s.control.dispose();
  }
});

test('hidden document and offscreen hero pause work; visibility recovery resumes safely', () => {
  const s = setup(); assert.equal(s.queue.size, 1);
  s.doc.visibilityState = 'hidden'; s.doc.fire('visibilitychange');
  assert.equal(s.queue.size, 0); assert.equal(s.root.dataset.motionPaused, 'true');
  s.doc.visibilityState = 'visible'; s.doc.fire('visibilitychange');
  assert.equal(s.queue.size, 1); s.flush();
  s.instances[1].intersect(s.hero, false);
  assert.equal(s.root.dataset.heroPaused, 'true');
  s.win.fire('scroll'); assert.equal(s.queue.size, 0);
  s.instances[1].intersect(s.hero, true); assert.equal(s.queue.size, 1);
  s.control.dispose();
});

test('manual pause reveals content, clears depth, cancels work and can resume', () => {
  const s = setup(); s.control.setPaused(true);
  assert.equal(s.queue.size, 0); assert.equal(s.root.dataset.motionPaused, 'true');
  assert.ok(s.targets.every(t => t.dataset.revealState === 'visible'));
  assert.equal(s.root.values.get('--hero-scroll-y'), '0.00px');
  s.control.setPaused(false); assert.equal(s.root.dataset.motionPaused, 'false');
  assert.equal(s.queue.size, 1);
  assert.equal(s.root.dataset.motionSettled, 'true'); // Resume must not hide/restart the headline.
  s.control.dispose();
});

test('keyboard focus exposes an unrevealed link without waiting for intersection', () => {
  const s = setup(); const link = new s.Element(); link.revealParent = s.targets[1];
  s.root.fire('focusin', { target: link });
  assert.equal(s.targets[1].dataset.revealState, 'visible');
  assert.equal(s.instances[0].observed.has(s.targets[1]), false);
  s.control.dispose();
});

test('missing IntersectionObserver degrades to visible content and disposal removes all listeners', () => {
  const s = setup({ observer: false });
  assert.ok(s.targets.every(t => t.dataset.revealState !== 'pending'));
  s.control.dispose();
  assert.equal(s.queue.size, 0);
  for (const target of [s.win, s.doc, s.hero, s.root, s.reduced, s.pointer]) assert.equal(target.listenerCount(), 0);
  assert.equal(s.root.dataset.motionReady, undefined);
  assert.ok(s.targets.every(t => t.dataset.revealState === undefined));
});

test('server fallback, pause control and homepage-only styles preserve accessible static content', () => {
  const component = readFileSync('components/marketing/homepage-motion.tsx', 'utf8');
  const css = readFileSync('components/marketing/homepage.module.css', 'utf8');
  const header = readFileSync('components/layout/site-header.module.css', 'utf8');
  assert.match(component, /aria-pressed=\{paused\}/);
  assert.match(component, /Pause homepage motion/);
  assert.doesNotMatch(component, /data-reveal-state="pending"|inert|<main[^>]+aria-hidden/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.home \*, \.home \*::before \{ animation: none !important; transition: none !important;/);
  assert.match(css, /20s ease-in-out/);
  assert.match(header, /body:has\(\[data-homepage-motion\]\)/);
});
