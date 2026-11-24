import React from 'react';
import { X } from 'lucide-react';

interface ChipProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onRemove?: () => void;
  className?: string;
  variant?: 'red' | 'amber' | 'neutral';
}

export const Chip: React.FC<ChipProps> = ({
  children,
  icon,
  onRemove,
  className = '',
  variant = 'red',
}) => {
  const variantStyles = {
    red: 'bg-red-100 text-red-800 border-red-200',
    amber: 'bg-[#FEF7E0] text-[#B06000] border-[#FCE8B2]',
    neutral: 'bg-surface text-ink-soft border-line',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${variantStyles[variant]} ${className}`}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-current"
          aria-label="Remove"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
};
