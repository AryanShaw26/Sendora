import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  'aria-label': ariaLabel,
  size = 'md',
  active = false,
  className = '',
  children,
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
  };

  const activeClasses = active
    ? 'bg-red-100 text-red-800'
    : 'text-ink-soft hover:text-ink hover:bg-surface-hover';

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${activeClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
