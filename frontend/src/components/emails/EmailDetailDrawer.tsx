import React from 'react';
import { ExternalLink, Clock, Send, AlertCircle } from 'lucide-react';
import { Email } from '../../types';
import { Drawer } from '../ui/Drawer';
import { StatusBadge } from '../ui/StatusBadge';
import { Chip } from '../ui/Chip';

interface EmailDetailDrawerProps {
  email: Email | null;
  onClose: () => void;
}

export const EmailDetailDrawer: React.FC<EmailDetailDrawerProps> = ({ email, onClose }) => {
  if (!email) return null;

  const formatDate = (isoString: string | null) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  };

  return (
    <Drawer isOpen={!!email} onClose={onClose} title="Email Details">
      <div className="space-y-6 text-sm">
        {/* Status header */}
        <div className="flex items-center justify-between">
          <StatusBadge status={email.status} />
          {email.deferredCount > 0 && (
            <Chip variant="amber">
              Rescheduled {email.deferredCount} time{email.deferredCount > 1 ? 's' : ''} (rate limit)
            </Chip>
          )}
        </div>

        {/* Recipient & Subject */}
        <div className="space-y-3 pb-4 border-b border-line">
          <div>
            <label className="text-xs font-medium text-ink-soft block">Recipient</label>
            <p className="font-semibold text-ink text-base">{email.recipient}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft block">Subject</label>
            <p className="text-ink font-medium">{email.subject}</p>
          </div>
        </div>

        {/* Sender & Server info */}
        <div className="grid grid-cols-1 gap-3 pb-4 border-b border-line">
          <div>
            <label className="text-xs font-medium text-ink-soft block">Sender</label>
            <p className="text-ink">{email.senderEmail}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-ink-soft block">Scheduled Send Time</label>
            <p className="text-ink flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-ink-soft" />
              {formatDate(email.scheduledAt)}
            </p>
          </div>

          {email.sentAt && (
            <div>
              <label className="text-xs font-medium text-ink-soft block">Delivered At</label>
              <p className="text-ink flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-600" />
                {formatDate(email.sentAt)}
              </p>
            </div>
          )}
        </div>

        {/* Error message if failed */}
        {email.errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-red-800 mb-1">
              <AlertCircle className="w-4 h-4 text-red-700" />
              <span>Delivery Error</span>
            </div>
            <p className="text-xs text-red-700 break-words">{email.errorMessage}</p>
          </div>
        )}

        {/* Ethereal preview link */}
        {email.previewUrl && (
          <div className="pt-2">
            <a
              href={email.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-800 font-medium text-sm transition-colors border border-red-200"
            >
              <span>View in Ethereal Mail</span>
              <ExternalLink className="w-4 h-4 text-red-700" />
            </a>
          </div>
        )}
      </div>
    </Drawer>
  );
};
