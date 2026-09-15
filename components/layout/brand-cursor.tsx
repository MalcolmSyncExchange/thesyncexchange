"use client";

import { useEffect, useRef } from "react";
import styles from "./brand-cursor.module.css";

/** Decorative only: native cursor fallbacks and input semantics stay intact. */
export function BrandCursor() {
  const glow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) and (forced-colors: none)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const hide = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (glow.current) glow.current.style.opacity = "0";
    };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== "mouse") return hide();
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!glow.current) return;
        glow.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        glow.current.style.opacity = "1";
      });
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Tab") hide(); };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", hide);
    window.addEventListener("keydown", key);
    document.documentElement.addEventListener("pointerleave", hide);
    document.addEventListener("visibilitychange", hide);
    media.addEventListener("change", hide);
    return () => {
      hide();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", hide);
      window.removeEventListener("keydown", key);
      document.documentElement.removeEventListener("pointerleave", hide);
      document.removeEventListener("visibilitychange", hide);
      media.removeEventListener("change", hide);
    };
  }, []);
  return <div ref={glow} className={styles.glow} aria-hidden="true" />;
}
