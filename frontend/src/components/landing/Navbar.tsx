import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';

export const Navbar: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -72;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-line h-16 transition-all duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <Logo size="md" />
        </Link>

        {/* Desktop Anchor links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-ink-soft">
          <button
            onClick={() => scrollToSection('features')}
            className="hover:text-red-700 transition-colors"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection('how-it-works')}
            className="hover:text-red-700 transition-colors"
          >
            How it works
          </button>
          <button
            onClick={() => scrollToSection('reliability')}
            className="hover:text-red-700 transition-colors"
          >
            Reliability
          </button>
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <Link to="/dashboard/scheduled">
              <Button variant="primary" size="md">
                Open dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="md">
                  Sign in
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="primary" size="md" pill>
                  Get started
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-ink-soft hover:text-ink rounded-lg"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-line px-6 py-4 flex flex-col gap-4 shadow-float animate-fadeIn">
          <button
            onClick={() => scrollToSection('features')}
            className="text-left py-2 font-medium text-ink-soft hover:text-red-700"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection('how-it-works')}
            className="text-left py-2 font-medium text-ink-soft hover:text-red-700"
          >
            How it works
          </button>
          <button
            onClick={() => scrollToSection('reliability')}
            className="text-left py-2 font-medium text-ink-soft hover:text-red-700"
          >
            Reliability
          </button>
          <div className="pt-2 border-t border-line flex flex-col gap-2">
            {isAuthenticated ? (
              <Link to="/dashboard/scheduled">
                <Button variant="primary" size="md" fullWidth>
                  Open dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="outline" size="md" fullWidth>
                    Sign in
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="primary" size="md" fullWidth pill>
                    Get started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};
