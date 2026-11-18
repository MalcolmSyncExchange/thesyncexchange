# Live Enhancement #002 — cinematic homepage motion

Status: local review candidate; founder visual approval required before any publication.
Base: `5f62d55ae16285fcb4ed99df26ba21e17b19e5d2` (live restoration).

The existing logo files, original hero artwork, copy, typography, section geometry,
links, authentication and production restrictions are preserved. No new animation
library, image, remote service, credential, schema or infrastructure is introduced.

## Timing and intensity

| Element | Motion |
| --- | --- |
| Background entrance | 105% to 100% in 1.8 seconds, eased; existing 1.008 image scale retained |
| Header | 0.1-second delay, 0.9-second reveal; 5px maximum travel, immediately visible on focus |
| Eyebrow / headline / description | Start at 0.20 / 0.34 / 0.51 seconds; 0.85-second reveal, 18px travel |
| Primary / secondary CTA / sign-in | Start at 0.68 / 0.80 / 0.92 seconds; finish by 1.77 seconds |
| Living artwork | 20-second full cycle, 100–101.8% scale, 0.35% horizontal / 0.25% vertical drift |
| Blue illumination | 20-second full cycle; low-opacity radial light, 1.5% / 1% travel |
| Scroll depth | Artwork +12px, copy -8px, illumination +8px maximum; native scrolling unchanged |
| Pointer depth | Background only; at most 6px horizontally / 4px vertically; hover-capable fine pointer only |
| Section reveals | 700ms, 18px travel; stagger 0 / 80 / 160 / 240ms; once per mount |
| Divider / hover | 1-second line reveal; restrained borders/shadows, 3px card elevation |

An 18px/10px decorative overscan prevents edges appearing during depth movement.
All movement is transform/opacity based; it never changes document flow.

## Accessibility and fallback

- The visible Pause motion control stops background/depth motion and exposes pending content.
- `prefers-reduced-motion` disables entrances, loops, reveals, hover travel and parallax.
- Pointer depth ignores touch and coarse-pointer devices; foreground copy does not follow the cursor.
- Keyboard focus reveals a pending link immediately and retains existing focus indicators.
- Below-fold elements are hidden only after successful client enhancement; server HTML is visible.
- Missing IntersectionObserver leaves all content visible. Initializer failure cleans up enhancement.
- With JavaScript disabled, static links/content remain usable; finite CSS entrance completes,
  while continuous background motion and its nonfunctional control are not enabled.
- Page visibility pauses animations and cancels pending frame work. An offscreen hero pauses
  its decorative loops. Section observers disconnect each revealed target, avoiding replay.
- Input events share at most one pending animation frame; there is no continuous JavaScript ticker.
- Route unmount cancels the frame, disconnects observers and removes registered listeners.

## Review and release boundary

Review desktop/mobile recordings, scroll reveals, pause/resume, reduced-motion and
static fallback before approval. Automated checks and desktop diagnostics do not
establish performance on every physical phone/browser. Production acceptance remains
separate. Do not deploy or push as part of this local implementation assignment.
