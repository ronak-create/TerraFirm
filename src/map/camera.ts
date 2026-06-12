// Camera helpers: gentle globe auto-rotation until first interaction, and eased
// fly-to. Respects prefers-reduced-motion.

import type { Map as MlMap } from 'maplibre-gl';

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Spinner {
  stop: () => void;
}

/** Slowly rotate the globe until the user interacts. No-op under reduced motion. */
export function startSpin(map: MlMap): Spinner {
  if (prefersReducedMotion()) return { stop: () => {} };

  let active = true;
  let raf = 0;
  let last = performance.now();
  const degPerSec = 4;

  const stop = () => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    for (const ev of interactionEvents) map.off(ev, stop as never);
  };

  const tick = (now: number) => {
    if (!active) return;
    const dt = (now - last) / 1000;
    last = now;
    // Only spin while zoomed out; once the user dives in we stop anyway.
    if (map.getZoom() < 4) {
      const c = map.getCenter();
      map.setCenter([c.lng + degPerSec * dt, c.lat]);
      raf = requestAnimationFrame(tick);
    } else {
      stop();
    }
  };

  const interactionEvents = ['mousedown', 'touchstart', 'wheel', 'dragstart', 'keydown'] as const;
  for (const ev of interactionEvents) map.once(ev, stop as never);
  raf = requestAnimationFrame(tick);

  return { stop };
}

export function flyTo(map: MlMap, lon: number, lat: number, zoom?: number): void {
  map.flyTo({
    center: [lon, lat],
    zoom: zoom ?? Math.max(map.getZoom(), 15),
    speed: prefersReducedMotion() ? 4 : 1.2,
    curve: 1.5,
    essential: true,
  });
}

export function easeToEntity(map: MlMap, lon: number, lat: number): void {
  const targetZoom = Math.max(map.getZoom(), 14.5);
  map.easeTo({
    center: [lon, lat],
    zoom: targetZoom,
    duration: prefersReducedMotion() ? 0 : 700,
    essential: true,
  });
}
