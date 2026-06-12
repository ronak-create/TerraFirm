import { useStore } from '../state/store';
import type { ViewTier } from '../config';

const TIERS: { key: ViewTier; label: string; hint: string }[] = [
  { key: 'STREET', label: 'STREET', hint: 'live businesses' },
  { key: 'REGIONAL', label: 'REGIONAL', hint: 'density hexes' },
  { key: 'ORBIT', label: 'ORBIT', hint: 'global companies' },
];

export function AltitudeRail() {
  const tier = useStore((s) => s.tier);
  return (
    <div className="tf-rail" aria-label="Altitude tier indicator">
      {TIERS.map((t) => (
        <div key={t.key} className={`tf-rail__tier ${tier === t.key ? 'is-active' : ''}`}>
          <span className="tf-rail__mark" />
          <span className="tf-rail__label">{t.label}</span>
          <span className="tf-rail__hint">{t.hint}</span>
        </div>
      ))}
    </div>
  );
}
