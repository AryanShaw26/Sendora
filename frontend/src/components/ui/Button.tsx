import React from 'react';
import { Spinner } from './Spinner';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'tonal' | 'outline' | 'ghost' | 'danger-text';
  size?: 'sm' | 'md' | 'lg';
  pill?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  pill,
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className = '',
  ...props
}) => {
  const isPill = pill !== undefined ? pill : size === 'lg';

  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-6 text-base gap-2.5',
  };

  const roundedClasses = isPill ? 'rounded-full' : 'rounded-lg';

  const variantClasses = {
    primary: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
    tonal: 'bg-red-100 hover:bg-red-200 active:bg-red-300 text-red-800',
    outline: 'bg-white hover:bg-surface-hover text-ink border border-line-strong shadow-sm',
    ghost: 'bg-transparent hover:bg-surface-hover text-ink-soft hover:text-ink',
    'danger-text': 'bg-transparent hover:bg-red-50 text-red-700 hover:text-red-800',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClasses} ${sizeClasses[size]} ${roundedClasses} ${variantClasses[variant]} ${widthClass} ${className}`}
      {...props}
    >
      {loading && <Spinner size="sm" className="mr-1.5" />}
      {!loading && leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
      <span>{children}</span>
      {!loading && rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
    </button>
  );
};
