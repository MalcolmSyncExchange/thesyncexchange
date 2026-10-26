"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { attachHomepageMotion } from "./homepage-motion-controller";
import styles from "./homepage.module.css";

export function HomepageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const motion = useRef<ReturnType<typeof attachHomepageMotion> | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!root.current) return;
    motion.current = attachHomepageMotion(root.current);
    return () => { motion.current?.dispose(); motion.current = null; };
  }, []);
  return <main ref={root} className={styles.home} data-homepage-motion>
    {children}
    <button type="button" className={styles.motionToggle} aria-pressed={paused}
      aria-label={paused ? "Resume homepage motion" : "Pause homepage motion"}
      onClick={() => { motion.current?.setPaused(!paused); setPaused(!paused); }}>
      {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
      {paused ? "Resume motion" : "Pause motion"}
    </button>
  </main>;
}
