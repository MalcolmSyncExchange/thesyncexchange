"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ResponsiveTab {
  id: string;
  label: string;
  panel: ReactNode;
  attention?: boolean;
}

export function ResponsiveTabs({ items, initialId, className }: { items: ResponsiveTab[]; initialId?: string; className?: string }) {
  const [selected, setSelected] = useState(initialId && items.some(item => item.id === initialId) ? initialId : items[0]?.id);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectByIndex(index: number) {
    const normalized = (index + items.length) % items.length;
    const next = items[normalized];
    if (!next) return;
    setSelected(next.id);
    refs.current[normalized]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") { event.preventDefault(); selectByIndex(index + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); selectByIndex(index - 1); }
    if (event.key === "Home") { event.preventDefault(); selectByIndex(0); }
    if (event.key === "End") { event.preventDefault(); selectByIndex(items.length - 1); }
  }

  const active = items.find(item => item.id === selected) || items[0];
  if (!active) return null;

  return (
    <div className={className}>
      <div role="tablist" aria-label="Track sections" className="flex gap-6 overflow-x-auto border-b border-border">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={node => { refs.current[index] = node; }}
            id={`track-tab-${item.id}`}
            type="button"
            role="tab"
            tabIndex={selected === item.id ? 0 : -1}
            aria-selected={selected === item.id}
            aria-controls={`track-panel-${item.id}`}
            className={cn(
              "relative min-h-12 shrink-0 border-b-2 border-transparent px-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected === item.id && "border-accent text-foreground"
            )}
            onClick={() => setSelected(item.id)}
            onKeyDown={event => handleKeyDown(event, index)}
          >
            {item.label}
            {item.attention ? <><span aria-hidden="true" className="absolute right-[-8px] top-3 h-1.5 w-1.5 rounded-full bg-amber-500" /><span className="sr-only"> — needs attention</span></> : null}
          </button>
        ))}
      </div>
      <section id={`track-panel-${active.id}`} role="tabpanel" aria-labelledby={`track-tab-${active.id}`} tabIndex={0} className="pt-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {active.panel}
      </section>
    </div>
  );
}
