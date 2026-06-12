import { useEffect } from 'react';
import { useStore } from '../state/store';

function Toast({ id, message, kind }: { id: number; message: string; kind: 'info' | 'error' }) {
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismiss(id), 6000);
    return () => clearTimeout(t);
  }, [id, dismiss]);
  return (
    <div className={`tf-toast tf-toast--${kind}`} role="alert" onClick={() => dismiss(id)}>
      {message}
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="tf-toasts" aria-live="polite">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} />
      ))}
    </div>
  );
}
