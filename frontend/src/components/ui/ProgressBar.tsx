import React from 'react';

interface ProgressBarProps {
  sent: number;
  total: number;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ sent, total, className = '' }) => {
  const percentage = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  return (
    <div className={`w-full ${className}`}>
      <div className="w-full h-2 rounded-full bg-red-100 overflow-hidden">
        <div
          className="h-full bg-red-500 transition-all duration-300 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
