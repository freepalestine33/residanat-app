const routeImports: Record<string, () => Promise<unknown>> = {
  '/study': () => import('../pages/StudyPage'),
  '/programme': () => import('../pages/ProgrammePage'),
  '/lectures': () => import('../pages/LecturesPage'),
  '/draft': () => import('../pages/DraftPreviewPage'),
  '/progress': () => import('../pages/ProgressPage'),
  '/lecture': () => import('../pages/LecturePage'),
  '/quiz': () => import('../pages/GlobalPracticePage'),
  '/vf': () => import('../pages/GlobalPracticePage'),
  '/notes': () => import('../pages/NotesPage'),
  '/settings': () => import('../pages/SettingsPage'),
};

const pendingPreloads = new Map<string, Promise<void>>();

export function preloadRoute(path: string): Promise<void> {
  const route = path.split('/').slice(0, 2).join('/') || '/';
  const load = routeImports[route];
  if (!load) return Promise.resolve();

  const cached = pendingPreloads.get(route);
  if (cached) return cached;

  const pending = load().then(() => undefined).catch((error: unknown) => {
    pendingPreloads.delete(route);
    throw error;
  });
  pendingPreloads.set(route, pending);
  return pending;
}
