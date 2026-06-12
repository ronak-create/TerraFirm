import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import type { LiveStatus } from '../types';

const LIVE_LABEL: Record<LiveStatus, string> = {
  idle: 'idle',
  scanning: 'scanning',
  live: 'live',
  error: 'unreachable',
};

function ago(ts: number | null, now: number): string {
  if (!ts) return '—';
  const s = Math.round((now - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function StatusBar() {
  const tier = useStore((s) => s.tier);
  const live = useStore((s) => s.live);
  const lastSync = useStore((s) => s.lastSync);
  const count = useStore((s) => s.visibleCount);
  const center = useStore((s) => s.center);
  const zoom = useStore((s) => s.zoom);
  const requestRefresh = useStore((s) => s.requestRefresh);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="tf-status" role="status">
      <span className={`tf-live tf-live--${live}`}>
        <span className="tf-live__dot" />
        {LIVE_LABEL[live]}
      </span>
      <span className="tf-status__sep">·</span>
      <span className="tf-status__tier">{tier}</span>
      <span className="tf-status__sep">·</span>
      <span>{count.toLocaleString()} entities</span>
      <span className="tf-status__sep">·</span>
      <span className="tf-status__coords">
        {center.lat.toFixed(3)}, {center.lng.toFixed(3)} · z{zoom.toFixed(1)}
      </span>
      <span className="tf-status__sep">·</span>
      <span className="tf-status__sync">sync {ago(lastSync, now)}</span>
      <button
        className="tf-status__refresh"
        onClick={() => requestRefresh()}
        title="Force-refresh visible businesses"
        aria-label="Refresh live businesses"
      >
        ⟳ refresh
      </button>
    </div>
  );
}
