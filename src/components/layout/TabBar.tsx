import React from 'react';
import { NavLink } from 'react-router-dom';

interface Tab {
  path: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
}

export const TabBar: React.FC<TabBarProps> = ({ tabs }) => {
  return (
    <nav className="nav" aria-label="Navigation principale">
      {tabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          end={tab.path === '/'}
          className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
};
