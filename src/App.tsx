import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ToastContainer } from './components/ui/Toast';
import { useSync } from './hooks/useSync';
import { AuthGate } from './components/auth/AuthGate';
import { useProgressStore } from './stores/progressStore';
import { useSettingsStore } from './stores/settingsStore';

const StudyPage = lazy(() => import('./pages/StudyPage').then((module) => ({ default: module.StudyPage })));
const ProgrammePage = lazy(() => import('./pages/ProgrammePage').then((module) => ({ default: module.ProgrammePage })));
const LecturesPage = lazy(() => import('./pages/LecturesPage').then((module) => ({ default: module.LecturesPage })));
const DraftPreviewPage = lazy(() => import('./pages/DraftPreviewPage').then((module) => ({ default: module.DraftPreviewPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((module) => ({ default: module.ProgressPage })));
const LecturePage = lazy(() => import('./pages/LecturePage'));
const GlobalPracticePage = lazy(() => import('./pages/GlobalPracticePage').then((module) => ({ default: module.GlobalPracticePage })));
const NotesPage = lazy(() => import('./pages/NotesPage').then((module) => ({ default: module.NotesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const DesignPreviewPage = lazy(() => import('./pages/DesignPreviewPage').then((module) => ({ default: module.DesignPreviewPage })));

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
      <Route path="/" element={<Navigate to="/programme" replace />} />
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

export default function App() {
  useSync();
  useEffect(() => { document.title = 'Résidanat · Smart Learning'; }, []);
  if (import.meta.env.DEV && window.location.hash === '#/__design-preview') {
    return <Suspense fallback={<main className="auth-shell" role="status">Chargement de la page…</main>}><DesignPreviewPage /></Suspense>;
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
