import React from 'react';

interface ButtonProps {
  variant?: 'primary' | 'ghost' | 'green';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  onClick,
  className = '',
  type = 'button',
}) => {
  const baseClasses = 'btn';
  const variantClasses = variant === 'ghost' ? 'ghost' : variant === 'green' ? 'green' : '';
  const sizeClasses = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';

  return (
    <button
      type={type}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
