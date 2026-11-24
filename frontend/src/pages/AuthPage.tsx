import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, AlertCircle } from 'lucide-react';
import { Logo } from '../components/ui/Logo';
import { ProductMockup } from '../components/ui/ProductMockup';
import { Spinner } from '../components/ui/Spinner';

interface AuthPageProps {
  mode: 'login' | 'register';
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const errorParam = searchParams.get('error');

  const handleGoogleSignIn = () => {
    setLoading(true);
    window.location.href = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/auth/google`;
  };

  const isLogin = mode === 'login';

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-white">
      {/* Left Column: Auth Form */}
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-between p-6 sm:p-12 lg:p-16">
        <div>
          <Link to="/" className="inline-block">
            <Logo size="md" />
          </Link>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          <h1 className="font-display font-semibold text-2xl sm:text-3xl text-ink tracking-tight mb-2">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-ink-soft mb-8">
            {isLogin
              ? 'Sign in to manage your scheduled emails.'
              : 'Get started in seconds with your Google account.'}
          </p>

          {/* Error alert from OAuth callback failure */}
          {errorParam && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">Authentication failed</strong>
                Google sign-in could not be completed. Please try again or verify your account.
              </div>
            </div>
          )}

          {/* Register Benefits Checklist */}
          {!isLogin && (
            <div className="space-y-3 mb-8 bg-surface p-4 rounded-xl border border-line">
              <div className="flex items-center gap-2.5 text-xs text-ink font-medium">
                <span className="w-4 h-4 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Schedule thousands of emails with persistent queues</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-ink font-medium">
                <span className="w-4 h-4 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Never lose a send after a server restart</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-ink font-medium">
                <span className="w-4 h-4 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Slack alerts on rate limits and multi-sender distribution</span>
              </div>
            </div>
          )}

          {/* Google Sign-in Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full h-12 px-4 rounded-lg bg-white border border-line-strong hover:bg-surface-hover text-ink text-sm font-medium shadow-sm flex items-center justify-center gap-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300 disabled:opacity-50"
          >
            {loading ? (
              <Spinner size="sm" className="text-ink-soft" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          {/* Secure sign-in divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-3 text-ink-faint">Secure Google OAuth</span>
            </div>
          </div>

          {/* Mode switch */}
          <div className="text-center text-xs text-ink-soft">
            {isLogin ? (
              <p>
                New here?{' '}
                <Link to="/register" className="text-red-700 font-semibold hover:underline">
                  Create an account
                </Link>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <Link to="/login" className="text-red-700 font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            )}
          </div>
        </div>

        <div className="text-center lg:text-left text-[11px] text-ink-faint">
          By continuing you agree to Sendora's Terms of Service and Privacy Policy.
        </div>
      </div>

      {/* Right Column: Brand Banner with Product Mockup (Hidden on mobile) */}
      <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 bg-gradient-to-br from-red-600 via-red-700 to-red-800 p-12 xl:p-16 flex-col justify-between text-white relative overflow-hidden">
        {/* Subtle background envelope shapes */}
        <div className="absolute -right-20 -bottom-20 w-96 h-96 rounded-full bg-red-500/20 blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <span className="text-xs font-semibold uppercase tracking-widest text-red-200">
            Sendora Email Platform
          </span>
          <h2 className="font-display font-bold text-3xl xl:text-4xl tracking-tight mt-2 text-white">
            Schedule. Send. Relax.
          </h2>
          <p className="text-red-100 text-sm mt-2 max-w-md">
            Production-grade delayed queues backed by BullMQ and Redis.
          </p>
        </div>

        <div className="relative z-10 my-auto flex justify-center pt-8">
          <ProductMockup className="max-w-md xl:max-w-lg shadow-compose" />
        </div>

        <div className="relative z-10 text-xs text-red-200">
          SURVIVES RESTARTS · ATOMIC RATE LIMITS · MULTI-SENDER THROTTLING
        </div>
      </div>
    </div>
  );
};
