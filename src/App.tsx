import { useEffect, Component, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ToastContainer } from './components/ui/Toast';
import { useSync } from './hooks/useSync';
import { AuthGate } from './components/auth/AuthGate';
import { useProgressStore } from './stores/progressStore';
import { useSettingsStore } from './stores/settingsStore';

const StudyPage = lazy(() => import('./pages/StudyPage').then((module) => ({ default: module.StudyPage })));
const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const ProgrammePage = lazy(() => import('./pages/ProgrammePage').then((module) => ({ default: module.ProgrammePage })));
const LecturesPage = lazy(() => import('./pages/LecturesPage').then((module) => ({ default: module.LecturesPage })));
const DraftPreviewPage = lazy(() => import('./pages/DraftPreviewPage').then((module) => ({ default: module.DraftPreviewPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((module) => ({ default: module.ProgressPage })));
const LecturePage = lazy(() => import('./pages/LecturePage'));
const GlobalPracticePage = lazy(() => import('./pages/GlobalPracticePage').then((module) => ({ default: module.GlobalPracticePage })));
const NotesPage = lazy(() => import('./pages/NotesPage').then((module) => ({ default: module.NotesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const DesignPreviewPage = lazy(() => import('./pages/DesignPreviewPage').then((module) => ({ default: module.DesignPreviewPage })));
const SeedPage = import.meta.env.DEV
  ? lazy(() => import('./pages/SeedPage').then((module) => ({ default: module.SeedPage })))
  : null;

function SignedInApp() {
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const loadStats = useProgressStore((state) => state.loadStats);
  const theme = useSettingsStore((state) => state.theme);
  useEffect(() => {
    loadSettings();
    void loadStats();
  }, [loadSettings, loadStats]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <Suspense fallback={<main className="auth-shell" role="status">Chargement de la page…</main>}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/study" element={<StudyPage />} />
      <Route path="/programme" element={<ProgrammePage />} />
      <Route path="/lectures" element={<LecturesPage />} />
      <Route path="/draft/:id" element={<DraftPreviewPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/lecture/:id" element={<LecturePage />} />
      <Route path="/quiz" element={<GlobalPracticePage kind="quiz" />} />
      <Route path="/vf" element={<GlobalPracticePage kind="vf" />} />
      <Route path="/notes" element={<NotesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

class DevErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return <main className="auth-shell"><pre style={{ whiteSpace: 'pre-wrap', color: 'red' }}>{this.state.error.stack ?? String(this.state.error)}</pre></main>;
    }
    return this.props.children;
  }
}

export default function App() {
  useSync();
  useEffect(() => { document.title = 'EasyMed'; }, []);
  if (import.meta.env.DEV && window.location.hash === '#/__design-preview') {
    return <Suspense fallback={<main className="auth-shell" role="status">Chargement de la page…</main>}><DesignPreviewPage /></Suspense>;
  }
  if (import.meta.env.DEV && SeedPage && window.location.hash === '#/__seed') {
    return <Suspense fallback={<main className="auth-shell" role="status">Chargement de la page…</main>}><SeedPage /></Suspense>;
  }
  if (import.meta.env.DEV && window.location.hash === '#/__notes') {
    return <HashRouter><Suspense fallback={<main className="auth-shell" role="status">Chargement de la page…</main>}><DevErrorBoundary><NotesPage /></DevErrorBoundary></Suspense></HashRouter>;
  }
  return (
    <HashRouter>
      <div style={{ minHeight: '100vh' }}>
        <AuthGate><SignedInApp /></AuthGate>
        <ToastContainer />
      </div>
    </HashRouter>
  );
}
