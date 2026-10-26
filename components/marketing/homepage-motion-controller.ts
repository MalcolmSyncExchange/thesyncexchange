/** Progressive enhancement only: server-rendered content is visible by default. */
export function attachHomepageMotion(root: HTMLElement, win: Window & typeof globalThis = window, doc: Document = document) {
  const hero = root.querySelector<HTMLElement>("[data-home-hero]");
  if (!hero) return { setPaused: (_paused: boolean) => {}, dispose: () => {} };

  const reduced = win.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = win.matchMedia("(hover: hover) and (pointer: fine)");
  const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
  let userPaused = false;
  let heroVisible = true;
  let disposed = false;
  let frame = 0;
  let pointerX = 0;
  let pointerY = 0;
  let reveals: IntersectionObserver | undefined;
  let visibility: IntersectionObserver | undefined;
  const listeners: (() => void)[] = [];
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const active = () => !disposed && !userPaused && !reduced.matches && doc.visibilityState !== "hidden";
  const write = (name: string, value: number) => {
    const next = `${value.toFixed(2)}px`;
    if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);
  };
  const resetDepth = () => {
    pointerX = pointerY = 0;
    for (const name of ["--hero-scroll-y", "--hero-content-y", "--hero-light-y", "--hero-pointer-x", "--hero-pointer-y"]) write(name, 0);
  };
  const revealAll = () => {
    targets.forEach(target => { target.dataset.revealState = "visible"; });
    reveals?.disconnect();
  };
  const cancelFrame = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  };
  const update = () => {
    frame = 0;
    if (!active() || !heroVisible) return;
    const bounds = hero.getBoundingClientRect();
    // Never reposition the document or change layout; depth is capped at 12px.
    const progress = clamp(-bounds.top / Math.max(bounds.height, 1), 0, 1);
    write("--hero-scroll-y", progress * 12);
    write("--hero-content-y", progress * -8);
    write("--hero-light-y", progress * 8);
    write("--hero-pointer-x", finePointer.matches ? pointerX : 0);
    write("--hero-pointer-y", finePointer.matches ? pointerY : 0);
  };
  const schedule = () => {
    if (active() && heroVisible && !frame) frame = win.requestAnimationFrame(update);
  };
  const sync = () => {
    root.dataset.motionReduced = String(reduced.matches);
    root.dataset.motionPaused = String(!active());
    root.dataset.heroPaused = String(!active() || !heroVisible);
    if (!active()) cancelFrame();
    if (reduced.matches || userPaused) {
      root.dataset.motionSettled = "true";
      resetDepth();
      revealAll();
    } else schedule();
  };
  const pointer = (event: PointerEvent) => {
    if (!active() || !heroVisible || !finePointer.matches || event.pointerType === "touch") return;
    const bounds = hero.getBoundingClientRect();
    pointerX = clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1) * 2 - 1, -1, 1) * 6;
    pointerY = clamp((event.clientY - bounds.top) / Math.max(bounds.height, 1) * 2 - 1, -1, 1) * 4;
    schedule();
  };
  const leave = () => { pointerX = pointerY = 0; schedule(); };
  const pointerModeChanged = () => { pointerX = pointerY = 0; schedule(); };
  const focus = (event: FocusEvent) => {
    const target = event.target;
    if (target instanceof win.HTMLElement) {
      const reveal = target.closest<HTMLElement>("[data-reveal]");
      if (reveal) { reveal.dataset.revealState = "visible"; reveals?.unobserve(reveal); }
    }
  };
  const dispose = () => {
    disposed = true;
    cancelFrame();
    reveals?.disconnect();
    visibility?.disconnect();
    listeners.forEach(remove => remove());
    targets.forEach(target => { delete target.dataset.revealState; });
    resetDepth();
    for (const name of ["motionReady", "motionReduced", "motionPaused", "motionSettled", "heroPaused"]) delete root.dataset[name];
  };

  try {
    if ("IntersectionObserver" in win) {
      reveals = new win.IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.revealState = "visible";
          reveals?.unobserve(entry.target);
        }
      }, { threshold: 0.08, rootMargin: "0px 0px -5% 0px" });
      for (const target of targets) {
        // Do not hide anything already visible when hydration arrives late.
        const bounds = target.getBoundingClientRect();
        const belowFold = bounds.top >= win.innerHeight;
        target.dataset.revealState = !reduced.matches && belowFold ? "pending" : "visible";
        if (target.dataset.revealState === "pending") reveals.observe(target);
      }
      visibility = new win.IntersectionObserver(entries => {
        heroVisible = entries.some(entry => entry.isIntersecting);
        sync();
      });
      visibility.observe(hero);
    }
    win.addEventListener("scroll", schedule, { passive: true });
    win.addEventListener("resize", schedule, { passive: true });
    hero.addEventListener("pointermove", pointer, { passive: true });
    hero.addEventListener("pointerleave", leave, { passive: true });
    root.addEventListener("focusin", focus);
    doc.addEventListener("visibilitychange", sync);
    reduced.addEventListener("change", sync);
    finePointer.addEventListener("change", pointerModeChanged);
    listeners.push(
      () => win.removeEventListener("scroll", schedule),
      () => win.removeEventListener("resize", schedule),
      () => hero.removeEventListener("pointermove", pointer),
      () => hero.removeEventListener("pointerleave", leave),
      () => root.removeEventListener("focusin", focus),
      () => doc.removeEventListener("visibilitychange", sync),
      () => reduced.removeEventListener("change", sync),
      () => finePointer.removeEventListener("change", pointerModeChanged)
    );
    root.dataset.motionReady = "true";
    sync();
  } catch {
    // Observer/media support or initialization failure must never hide content.
    dispose();
  }
  return { setPaused: (paused: boolean) => { userPaused = paused; sync(); }, dispose };
}
