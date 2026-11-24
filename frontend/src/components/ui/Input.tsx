import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-ink-soft mb-1.5">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 flex items-center pointer-events-none text-ink-soft">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full h-10 px-3.5 ${leftIcon ? 'pl-9' : ''} ${rightIcon ? 'pr-9' : ''} bg-white text-ink text-sm rounded-lg border transition-colors duration-150 placeholder:text-ink-faint focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-200 disabled:bg-surface disabled:text-ink-faint ${
              error ? 'border-red-700' : 'border-line-strong hover:border-line'
            } ${className}`}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 flex items-center text-ink-soft">
              {rightIcon}
            </span>
          )}
        </div>
        {error ? (
          <p className="mt-1 text-xs text-red-700">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-ink-soft">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
