import React, { forwardRef } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-medium text-ink-soft mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`w-full p-3 bg-white text-ink text-sm rounded-lg border transition-colors duration-150 placeholder:text-ink-faint focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-200 disabled:bg-surface disabled:text-ink-faint ${
            error ? 'border-red-700' : 'border-line-strong hover:border-line'
          } ${className}`}
          {...props}
        />
        {error ? (
          <p className="mt-1 text-xs text-red-700">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-ink-soft">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
