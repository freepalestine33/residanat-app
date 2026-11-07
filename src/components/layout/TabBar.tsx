import React from 'react';
import { NavLink } from 'react-router-dom';
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
        return (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/'}
            className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
          >
            {Icon && <Icon className="nav-icon" size={16} strokeWidth={1.8} aria-hidden="true" />}
            <span>{tab.label}</span>
          </NavLink>
        );
      })}
    </div>
  </nav>
);
