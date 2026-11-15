// src/components/MemoInfographic.tsx — draws a memo as a poster. Text is real HTML: always spelled right.
import { forwardRef } from 'react';
import type { Memo } from '../lib/mnemonicApi';
import { FALLBACK_ICON, MEMO_ICONS } from '../lib/memoIcons';
import './mnemonic.css';

const COLORS = ['#c62828', '#1565c0', '#6a1b9a', '#6b6b0a', '#2e7d32', '#d84315', '#455a64'];

function Icon({ name }: { name: string }) {
  const html = Object.prototype.hasOwnProperty.call(MEMO_ICONS, name) ? MEMO_ICONS[name] : MEMO_ICONS[FALLBACK_ICON];
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

type Props = { memo: Memo; artUrl?: string };

const MemoInfographic = forwardRef<HTMLElement, Props>(function MemoInfographic({ memo, artUrl }, ref) {
  return (
    <figure className="memo-poster" ref={ref} aria-label={memo.title}>
      <header className="memo-head">
        <div className="memo-head-text">
          <h2 className="memo-title">{memo.title}</h2>
          {memo.subtitle && <p className="memo-sub">{memo.subtitle}</p>}
        </div>
        {artUrl && <img className="memo-art" src={artUrl} crossOrigin="anonymous" alt="" width={160} height={160} />}
      </header>

      <ol className="memo-steps" data-n={memo.steps.length} style={{ ['--n' as string]: memo.steps.length }}>
        {memo.steps.map((s, i) => (
          <li className="memo-step" key={i} style={{ ['--c' as string]: COLORS[i % COLORS.length] }}>
            <span className="memo-num">{i + 1}</span>
            <span className="memo-icon"><Icon name={s.icon} /></span>
            {s.tag && <span className="memo-tag">{s.tag}</span>}
            <h3 className="memo-h">{s.heading}</h3>
            <p className="memo-cap">{s.caption}</p>
          </li>
        ))}
      </ol>

      {memo.legend && (
        <ul className="memo-legend">
          {memo.legend.map((l, i) => (
            <li key={i} style={{ ['--c' as string]: COLORS[i % COLORS.length] }}><b>{l.term}</b><span>= {l.meaning}</span></li>
          ))}
        </ul>
      )}
      <figcaption className="memo-credit">EasyMed · mémo généré par IA, à vérifier avec le cours</figcaption>
    </figure>
  );
});
export default MemoInfographic;
