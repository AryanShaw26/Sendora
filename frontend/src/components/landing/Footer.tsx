import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-line py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col items-center md:items-start gap-1">
          <Logo size="sm" />
          <p className="text-xs text-ink-soft">Schedule emails that arrive exactly on time.</p>
        </div>

        <div className="flex items-center gap-6 text-xs text-ink-soft font-medium">
          <a href="#features" className="hover:text-red-700">
            Features
          </a>
          <a href="#how-it-works" className="hover:text-red-700">
            How it works
          </a>
          <a href="#reliability" className="hover:text-red-700">
            Reliability
          </a>
          <Link to="/login" className="hover:text-red-700">
            Sign in
          </Link>
        </div>

        <div className="text-center md:text-right text-xs text-ink-faint">
          <p>© {currentYear} Sendora. All rights reserved.</p>
          <p className="text-[11px] mt-0.5">Built as a demo project.</p>
        </div>
      </div>
    </footer>
  );
};
