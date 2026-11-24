import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

export const NotFoundPage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 select-none">
        <span className="font-display font-extrabold text-8xl md:text-9xl text-red-100 tracking-tighter">
          404
        </span>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-16 h-16 text-red-600" viewBox="0 0 36 36" fill="none">
            <rect x="3" y="7" width="30" height="22" rx="4" fill="#FFFFFF" stroke="#D93025" strokeWidth="2.5" />
            <path d="M3 8 L18 20 L33 8" stroke="#D93025" strokeWidth="2.5" />
          </svg>
        </div>
      </div>

      <h1 className="font-display font-bold text-2xl md:text-3xl text-ink mb-2">
        Page not found
      </h1>
      <p className="text-sm text-ink-soft max-w-sm mb-8 leading-relaxed">
        The link you followed may be broken or the page may have been moved.
      </p>

      <Link to={isAuthenticated ? '/dashboard/scheduled' : '/'}>
        <Button variant="primary" size="lg" pill>
          {isAuthenticated ? 'Go to dashboard' : 'Go home'}
        </Button>
      </Link>
    </div>
  );
};
