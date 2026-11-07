import React from 'react';
import * as LucideIcons from 'lucide-react';

interface IconProps {
  name: keyof typeof LucideIcons;
  size?: number;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, className = '' }) => {
  const LucideIcon = LucideIcons[name] as React.ComponentType<{ size?: number; className?: string }>;

  if (!LucideIcon) {
    console.warn(`Icon "${name}" not found in lucide-react`);
    return null;
  }

  return <LucideIcon size={size} className={className} />;
};
