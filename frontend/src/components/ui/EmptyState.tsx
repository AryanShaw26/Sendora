import React from 'react';

interface EmptyStateProps {
  illustration?: 'envelope' | 'plane' | 'search' | 'not-found';
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  illustration = 'envelope',
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto">
      <div className="w-24 h-24 mb-5 rounded-full bg-red-50 flex items-center justify-center">
        {illustration === 'envelope' && (
          <svg className="w-12 h-12 text-red-500" viewBox="0 0 48 48" fill="none">
            <rect x="6" y="12" width="36" height="26" rx="4" fill="#FCE8E6" stroke="#D93025" strokeWidth="2.5" />
            <path d="M6 16 L24 28 L42 16" stroke="#D93025" strokeWidth="2.5" strokeLinejoin="round" />
            <circle cx="36" cy="34" r="8" fill="#FEF7E0" stroke="#B06000" strokeWidth="2" />
            <path d="M36 30 V34 H39" stroke="#B06000" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {illustration === 'plane' && (
          <svg className="w-12 h-12 text-red-600" viewBox="0 0 48 48" fill="none">
            <path
              d="M8 24 L40 10 L26 40 L22 28 L8 24 Z"
              fill="#FCE8E6"
              stroke="#D93025"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <path d="M40 10 L22 28" stroke="#D93025" strokeWidth="2.5" />
          </svg>
        )}
        {illustration === 'search' && (
          <svg className="w-12 h-12 text-red-500" viewBox="0 0 48 48" fill="none">
            <circle cx="21" cy="21" r="13" stroke="#D93025" strokeWidth="2.5" fill="#FCE8E6" />
            <path d="M30 30 L40 40" stroke="#D93025" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {illustration === 'not-found' && (
          <svg className="w-12 h-12 text-red-500" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="18" fill="#FCE8E6" stroke="#D93025" strokeWidth="2.5" />
            <path d="M16 18 H20 M28 18 H32" stroke="#D93025" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M18 32 C21 28 27 28 30 32" stroke="#D93025" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
      </div>

      <h3 className="font-display font-medium text-lg text-ink mb-1.5">{title}</h3>
      <p className="text-sm text-ink-soft mb-6 max-w-sm">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
