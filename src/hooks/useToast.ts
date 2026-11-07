import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  showToast: (message: string, type?: Toast['type'], duration?: number) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message, type = 'info', duration = 3000) => {
    const id = Date.now().toString();
    const toast: Toast = { id, message, type, duration };

    set((state) => ({ toasts: [...state.toasts, toast] }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
      }, duration);
    }

    return id;
  },

  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  clearToasts: () => set({ toasts: [] }),

}));
