import { ArrowDownRight, BookOpenCheck, BrainCircuit, RotateCcw } from 'lucide-react';

export function AuthBrandPanel() {
  return (
    <aside className="auth-brand-panel" aria-label="La méthode Résidanat">
      <div className="auth-brand-lockup">
        <span className="auth-brand-mark"><BookOpenCheck size={21} strokeWidth={1.8} /></span>
        <span><strong>Résidanat</strong><small>Smart Learning</small></span>
      </div>
      <div className="auth-brand-copy">
        <p className="auth-brand-kicker">La régularité fait la différence</p>
        <h2>Comprendre.<br />Consolider.<br /><em>Se souvenir.</em></h2>
        <p>Un espace de travail conçu pour accompagner vos révisions, séance après séance.</p>
      </div>
      <div className="auth-method" aria-label="La méthode de révision en trois étapes">
        <div className="auth-method-step"><span>01</span><BrainCircuit size={16} /><strong>Apprendre</strong></div>
        <span className="auth-method-connector" aria-hidden="true" />
        <div className="auth-method-step"><span>02</span><RotateCcw size={16} /><strong>Revoir</strong></div>
        <span className="auth-method-connector" aria-hidden="true" />
        <div className="auth-method-step"><span>03</span><BookOpenCheck size={16} /><strong>Ancrer</strong></div>
      </div>
      <div className="auth-brand-foot"><span>Votre espace d’étude, partout avec vous.</span><ArrowDownRight size={17} aria-hidden="true" /></div>
    </aside>
  );
}
