// Diffing manager for HTML markers (logo + name pills and cluster bubbles).
// Only on-screen markers exist in the DOM; logos lazy-load and fall back to a
// monogram so an image never breaks.

import maplibregl, { type Map as MlMap, type Marker } from 'maplibre-gl';
import type { Entity } from '../types';
import { monogramDataUrl, rememberLoaded, resolveLogo } from '../data/logos';
import { CONFIG } from '../config';

export interface PointSpec {
  type: 'point';
  id: string;
  lon: number;
  lat: number;
  entity: Entity;
  prominence: number; // 0..1 → marker size
}
export interface ClusterSpec {
  type: 'cluster';
  id: string;
  lon: number;
  lat: number;
  count: number;
}
export type MarkerSpec = PointSpec | ClusterSpec;

interface Handle {
  marker: Marker;
  el: HTMLElement;
  signature: string;
}

export class MarkerManager {
  private map: MlMap;
  private handles = new Map<string, Handle>();
  private selectedId: string | null = null;
  onSelect: (e: Entity) => void = () => {};
  onCluster: (lon: number, lat: number) => void = () => {};

  constructor(map: MlMap) {
    this.map = map;
  }

  setSelected(id: string | null): void {
    if (this.selectedId === id) return;
    const prev = this.selectedId && this.handles.get(this.selectedId);
    if (prev) prev.el.classList.remove('tf-marker--selected');
    this.selectedId = id;
    const next = id && this.handles.get(id);
    if (next) next.el.classList.add('tf-marker--selected');
  }

  sync(specs: MarkerSpec[]): void {
    const seen = new Set<string>();

    for (const spec of specs) {
      seen.add(spec.id);
      const signature =
        spec.type === 'cluster' ? `c:${spec.count}` : `p:${Math.round(spec.prominence * 10)}`;
      const existing = this.handles.get(spec.id);

      if (existing && existing.signature === signature) {
        existing.marker.setLngLat([spec.lon, spec.lat]);
        continue;
      }
      if (existing) existing.marker.remove();

      const el = spec.type === 'cluster' ? this.buildCluster(spec) : this.buildPoint(spec);
      const marker = new maplibregl.Marker({ element: el, anchor: spec.type === 'cluster' ? 'center' : 'bottom' })
        .setLngLat([spec.lon, spec.lat])
        .addTo(this.map);
      if (spec.type === 'point' && spec.id === this.selectedId) el.classList.add('tf-marker--selected');
      this.handles.set(spec.id, { marker, el, signature });
    }

    for (const [id, handle] of this.handles) {
      if (!seen.has(id)) {
        handle.marker.remove();
        this.handles.delete(id);
      }
    }
  }

  clear(): void {
    for (const h of this.handles.values()) h.marker.remove();
    this.handles.clear();
  }

  private buildCluster(spec: ClusterSpec): HTMLElement {
    const el = document.createElement('button');
    el.className = 'tf-cluster';
    el.type = 'button';
    el.setAttribute('aria-label', `${spec.count} businesses — zoom in`);
    el.textContent = abbreviate(spec.count);
    const size = Math.min(58, 26 + Math.log2(spec.count + 1) * 6);
    el.style.width = el.style.height = `${size}px`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onCluster(spec.lon, spec.lat);
    });
    return el;
  }

  private buildPoint(spec: PointSpec): HTMLElement {
    const { entity } = spec;
    const el = document.createElement('button');
    el.className = `tf-marker tf-marker--${entity.kind}`;
    el.type = 'button';
    el.setAttribute('aria-label', entity.name);
    const scale = 0.82 + spec.prominence * 0.5;
    el.style.setProperty('--tf-scale', scale.toFixed(2));

    const img = document.createElement('img');
    img.className = 'tf-marker__logo';
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    const primary = resolveLogo({
      name: entity.name,
      logoUrl: entity.logoUrl,
      domain: entity.domain,
      key: entity.id,
      useFavicon: CONFIG.useFaviconService,
    });
    const monogram = monogramDataUrl(entity.name, entity.id);
    img.src = primary;
    img.addEventListener('load', () => rememberLoaded(primary));
    img.addEventListener('error', () => {
      if (img.src !== monogram) img.src = monogram;
    });

    const label = document.createElement('span');
    label.className = 'tf-marker__label';
    label.textContent = entity.name.length > 28 ? entity.name.slice(0, 27) + '…' : entity.name;

    el.append(img, label);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onSelect(entity);
    });
    return el;
  }
}

function abbreviate(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}
