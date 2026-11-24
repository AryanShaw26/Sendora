import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const CtaBand: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const handleGoogleAuth = () => {
    window.location.href = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/auth/google`;
  };

  return (
    <section className="py-20 bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white text-center">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col items-center">
        <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl tracking-tight mb-6">
          Ready to schedule your first campaign?
        </h2>
        <p className="text-red-100 text-base sm:text-lg mb-8 max-w-2xl leading-relaxed">
          Sign up with your Google account in seconds. Upload leads, set your limits, and let Sendora
          handle the rest.
        </p>

        {isAuthenticated ? (
          <Link to="/dashboard/scheduled">
            <button
              type="button"
              className="h-12 px-8 rounded-full bg-white text-red-700 font-semibold text-base shadow-float hover:bg-red-50 transition-colors"
            >
              Open dashboard
            </button>
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleGoogleAuth}
            className="h-12 px-8 rounded-full bg-white text-red-700 font-semibold text-base shadow-float hover:bg-red-50 transition-colors"
          >
            Get started with Google
          </button>
        )}
      </div>
    </section>
  );
};
