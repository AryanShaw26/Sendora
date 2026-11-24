import React, { useState } from 'react';
import { LogOut, ExternalLink, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { Dropdown } from '../ui/Dropdown';

export const UserMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-1.5 rounded-full hover:bg-surface transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
        aria-label="User account menu"
      >
        {/* Name & email stacked to left on lg screens */}
        <div className="hidden lg:flex flex-col text-right">
          <span className="text-sm font-medium text-ink leading-tight">{user.name}</span>
          <span className="text-xs text-ink-soft leading-tight">{user.email}</span>
        </div>
        <Avatar src={user.avatarUrl} name={user.name} size="md" />
      </button>

      <Dropdown isOpen={isOpen} onClose={() => setIsOpen(false)} align="right" className="w-72 p-3">
        <div className="flex flex-col items-center text-center p-3">
          <Avatar src={user.avatarUrl} name={user.name} size="xl" className="mb-2" />
          <h4 className="font-display font-semibold text-base text-ink">{user.name}</h4>
          <p className="text-xs text-ink-soft">{user.email}</p>
        </div>

        <div className="border-t border-line my-2" />

        <div className="space-y-1">
          <a
            href={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/admin/queues`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-ink-soft hover:text-ink hover:bg-surface rounded-lg transition-colors"
          >
            <Shield className="w-4 h-4 text-red-600" />
            <span>BullMQ Queue Dashboard</span>
            <ExternalLink className="w-3.5 h-3.5 ml-auto text-ink-faint" />
          </a>

          <button
            type="button"
            onClick={async () => {
              setIsOpen(false);
              await logout();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg transition-colors text-left"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </Dropdown>
    </div>
  );
};
