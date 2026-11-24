import React from 'react';
import { Link } from 'react-router-dom';
import { ProductMockup } from '../ui/ProductMockup';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';

export const Hero: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const handleGoogleAuth = () => {
    window.location.href = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/auth/google`;
  };

  const scrollToHow = () => {
    const el = document.getElementById('how-it-works');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-32 bg-gradient-to-b from-red-50/60 via-white to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Heading & CTAs */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            {/* Badge pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-100 text-red-800 text-xs font-semibold mb-6">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              Reliable email scheduling at scale
            </div>

            {/* H1 Headline */}
            <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-ink tracking-tight leading-[1.12] mb-6">
              Schedule emails that arrive{' '}
              <span className="relative inline-block text-red-600 font-extrabold">
                exactly
                <svg
                  className="absolute -bottom-1.5 left-0 w-full h-2 text-red-300"
                  viewBox="0 0 100 8"
                  preserveAspectRatio="none"
                >
                  <path d="M0,5 Q50,0 100,5" stroke="currentColor" strokeWidth="3" fill="none" />
                </svg>
              </span>{' '}
              on time.
            </h1>

            {/* Subtext */}
            <p className="text-base sm:text-lg text-ink-soft leading-relaxed max-w-2xl mb-8">
              Upload your leads, set a start time, delay and hourly limit — Sendora handles queues,
              rate limits and restarts so nothing is lost or sent twice.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              {isAuthenticated ? (
                <Link to="/dashboard/scheduled">
                  <Button variant="primary" size="lg" pill>
                    Open dashboard
                  </Button>
                </Link>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  pill
                  onClick={handleGoogleAuth}
                  leftIcon={
                    <svg className="w-5 h-5 mr-1" viewBox="0 0 24 24">
                      <path
                        fill="#FFFFFF"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#FFFFFF"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FFFFFF"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#FFFFFF"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  }
                >
                  Get started with Google
                </Button>
              )}

              <Button variant="outline" size="lg" pill onClick={scrollToHow}>
                See how it works
              </Button>
            </div>

            <p className="text-xs text-ink-faint">
              Sign in with your Google account — no password to manage.
            </p>
          </div>

          {/* Right Column: Rotated UI Mockup */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="transform lg:-rotate-2 hover:rotate-0 transition-transform duration-300 w-full max-w-lg">
              <ProductMockup />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
