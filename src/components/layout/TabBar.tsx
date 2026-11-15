import React from 'react';
import { NavLink } from 'react-router-dom';
import { preloadRoute } from '../../lib/preloadRoute';
import {
  BookOpenCheck,
  BookText,
  CheckSquare,
  ClipboardList,
  FileText,
  Gauge,
  Home,
  Library,
  Settings,
} from 'lucide-react';

interface Tab {
  path: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
}

const tabIcons = {
  '/': Home,
  '/study': BookOpenCheck,
  '/quiz': CheckSquare,
  '/vf': ClipboardList,
  '/programme': BookText,
  '/lectures': Library,
  '/notes': FileText,
  '/progress': Gauge,
  '/settings': Settings,
} as const;

export const TabBar: React.FC<TabBarProps> = ({ tabs }) => (
  <nav className="nav" aria-label="Navigation principale">
    <div className="nav-inner">
      {tabs.map((tab) => {
        const Icon = tabIcons[tab.path as keyof typeof tabIcons];
        const preload = () => {
          void preloadRoute(tab.path).catch((error: unknown) => console.error('Could not preload page.', error));
        };
        return (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/'}
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            onPointerEnter={preload}
            onPointerDown={preload}
            onFocus={preload}
          >
            {Icon && <Icon className="nav-icon" size={16} strokeWidth={1.8} aria-hidden="true" />}
            <span>{tab.label}</span>
          </NavLink>
        );
      })}
    </div>
  </nav>
);
