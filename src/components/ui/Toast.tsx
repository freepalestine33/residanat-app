import React from 'react';
import { useToast } from '../../hooks/useToast';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '1.2rem',
        transform: 'translateX(-50%)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            background: 'var(--card2)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '0.55rem 0.9rem',
            fontSize: '0.85rem',
            boxShadow: 'var(--shadow)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <span>{toast.message}</span>
          <button type="button" className="toast-dismiss" aria-label="Fermer la notification" onClick={() => removeToast(toast.id)}>×</button>
        </div>
      ))}
    </div>
  );
};
