import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { StudyPage } from './pages/StudyPage';
import { ProgrammePage } from './pages/ProgrammePage';
import { LecturesPage } from './pages/LecturesPage';
import { ProgressPage } from './pages/ProgressPage';
import LecturePage from './pages/LecturePage';
import { GlobalPracticePage } from './pages/GlobalPracticePage';
import { NotesPage } from './pages/NotesPage';
import { SettingsPage } from './pages/SettingsPage';
import { DesignPreviewPage } from './pages/DesignPreviewPage';
import { ToastContainer } from './components/ui/Toast';
import { useSync } from './hooks/useSync';
import { AuthGate } from './components/auth/AuthGate';
import { useProgressStore, useSettingsStore } from './stores';

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
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/study" element={<StudyPage />} />
      <Route path="/programme" element={<ProgrammePage />} />
      <Route path="/lectures" element={<LecturesPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/lecture/:id" element={<LecturePage />} />
      <Route path="/quiz" element={<GlobalPracticePage kind="quiz" />} />
      <Route path="/vf" element={<GlobalPracticePage kind="vf" />} />
      <Route path="/notes" element={<NotesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  useSync();
  useEffect(() => { document.title = 'Résidanat · Smart Learning'; }, []);
  if (import.meta.env.DEV && window.location.hash === '#/__design-preview') {
    return <DesignPreviewPage />;
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
