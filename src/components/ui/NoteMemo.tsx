import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { Memo } from '../../lib/mnemonicApi';
import MemoInfographic from '../MemoInfographic';

/**
 * Renders a stored memo (small JSON) as its poster on demand.
 * The PNG is only generated if the user taps "Télécharger" — never stored.
 */
export function NoteMemo({ memo }: { memo: Memo }) {
  const posterRef = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    const node = posterRef.current;
    if (!node || busy) return;
    setBusy(true);
    setError('');
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#fbf3e4' });
      if (!blob) throw new Error('Export de l’image impossible.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `memo-${memo.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-').slice(0, 40) || 'visuel'}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="note-memo">
      <MemoInfographic ref={posterRef} memo={memo} />
      <button type="button" className="btn ghost btn-sm note-memo-download" onClick={() => void download()} disabled={busy}>
        <Download size={14} aria-hidden="true" />
        {busy ? 'Export…' : 'Télécharger en PNG'}
      </button>
      {error && <p className="notice error" role="alert">{error}</p>}
    </div>
  );
}
