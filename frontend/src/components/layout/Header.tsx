import React from 'react';
import { Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';
import { IconButton } from '../ui/IconButton';
import { SearchBar } from './SearchBar';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  return (
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-line flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-3 shrink-0">
        <IconButton
          aria-label="Toggle navigation sidebar"
          size="md"
          onClick={onToggleSidebar}
        >
          <Menu className="w-5 h-5 text-ink-soft" />
        </IconButton>
        <Link to="/dashboard/scheduled" className="flex items-center">
          <Logo size="md" />
        </Link>
      </div>

      <div className="flex-1 max-w-2xl mx-4 hidden md:block">
        <SearchBar />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <UserMenu />
      </div>
    </header>
  );
};
