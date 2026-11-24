import React from 'react';
import { Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { EmailStatus } from '../../types';

interface StatusBadgeProps {
  status: EmailStatus;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const configs: Record<
    EmailStatus,
    {
      bg: string;
      text: string;
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      animate?: boolean;
    }
  > = {
    scheduled: {
      bg: 'bg-[#FEF7E0]',
      text: 'text-[#B06000]',
      icon: Clock,
      label: 'Scheduled',
    },
    processing: {
      bg: 'bg-[#FCE8E6]',
      text: 'text-[#A50E0E]',
      icon: Loader2,
      label: 'Sending',
      animate: true,
    },
    sent: {
      bg: 'bg-[#E6F4EA]',
      text: 'text-[#137333]',
      icon: CheckCircle2,
      label: 'Sent',
    },
    failed: {
      bg: 'bg-[#C5221F]',
      text: 'text-white',
      icon: AlertCircle,
      label: 'Failed',
    },
  };

  const config = configs[status] || configs.scheduled;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${config.bg} ${config.text} ${className}`}
    >
      <Icon className={`w-3.5 h-3.5 ${config.animate ? 'animate-spin' : ''}`} />
      <span>{config.label}</span>
    </span>
  );
};
