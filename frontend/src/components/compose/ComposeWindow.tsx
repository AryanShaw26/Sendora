import React from 'react';
import { Minus, Maximize2, Minimize2, X, Clock, Trash2, AlertTriangle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast, { Toast } from 'react-hot-toast';
import { useCompose } from './ComposeProvider';
import { LeadUploader } from './LeadUploader';
import { Button } from '../ui/Button';
import { scheduleEmails } from '../../api/client';

export const ComposeWindow: React.FC = () => {
  const {
    isOpen,
    isMinimized,
    isMaximized,
    draft,
    closeCompose,
    minimizeCompose,
    maximizeCompose,
    updateDraft,
  } = useCompose();

  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const scheduleMutation = useMutation({
    mutationFn: scheduleEmails,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      closeCompose(true);

      const pendingRecovery = data.queueStatus === 'pending_reconciliation';
      const notification = (
        (t: Toast) => (
          <div className="flex items-center justify-between gap-3 w-full">
            <span>
              {pendingRecovery
                ? `Saved ${data.total} emails; queue recovery is pending`
                : `Scheduled ${data.total} emails successfully`}
            </span>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                navigate('/dashboard/scheduled');
              }}
              className="font-semibold text-red-300 hover:text-white underline text-xs ml-2"
            >
              View
            </button>
          </div>
        )
      );

      (pendingRecovery ? toast.error : toast.success)(
        notification,
        {
          duration: 5000,
          position: 'bottom-left',
          style: {
            background: '#323232',
            color: '#FFFFFF',
            borderRadius: '8px',
          },
        }
      );
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to schedule campaign', {
        position: 'bottom-left',
        style: {
          background: '#323232',
          color: '#FFFFFF',
          borderRadius: '8px',
        },
      });
    },
  });

  if (!isOpen) return null;

  // Minimized state: docks at bottom right as a mini titlebar
  if (isMinimized) {
    return (
      <div className="fixed bottom-0 right-6 z-50 w-72 bg-red-700 text-white rounded-t-xl shadow-compose flex items-center justify-between px-4 py-2.5 cursor-pointer">
        <span className="text-xs font-semibold truncate">
          {draft.subject || 'New Email (Draft)'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={minimizeCompose}
            className="p-1 hover:bg-white/20 rounded"
            aria-label="Expand compose window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => closeCompose(false)}
            className="p-1 hover:bg-white/20 rounded"
            aria-label="Close compose window"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Calculate delivery timeline
  const count = draft.emails.length;
  const startTs = new Date(draft.startTime).getTime();
  const validStart = !isNaN(startTs) ? startTs : Date.now();
  const lastTs = validStart + Math.max(0, count - 1) * draft.delaySeconds * 1000;

  const formatShortTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const spansMultipleHours = count > draft.hourlyLimit;

  const isValid =
    draft.subject.trim().length > 0 &&
    draft.body.trim().length > 0 &&
    draft.emails.length > 0 &&
    draft.delaySeconds >= 0 &&
    draft.hourlyLimit > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    // Convert local datetime-local string to ISO UTC format
    const isoStartTime = new Date(draft.startTime).toISOString();

    scheduleMutation.mutate({
      subject: draft.subject.trim(),
      body: draft.body.trim(),
      emails: draft.emails,
      startTime: isoStartTime,
      delaySeconds: Number(draft.delaySeconds),
      hourlyLimit: Number(draft.hourlyLimit),
    });
  };

  const containerClasses = isMaximized
    ? 'fixed inset-6 md:inset-12 z-50 bg-white rounded-2xl shadow-compose flex flex-col'
    : 'fixed bottom-0 right-0 md:right-6 z-50 w-full md:w-[560px] h-full md:h-auto md:max-h-[85vh] bg-white rounded-none md:rounded-t-2xl shadow-compose flex flex-col animate-slideUp';

  return (
    <div className={containerClasses}>
      {/* Header bar */}
      <div className="h-10 bg-red-700 text-white px-4 rounded-t-2xl flex items-center justify-between select-none shrink-0">
        <span className="text-xs font-semibold tracking-wide">New Email</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={minimizeCompose}
            className="p-1 hover:bg-white/20 rounded focus:outline-none"
            aria-label="Minimize compose window"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={maximizeCompose}
            className="p-1 hover:bg-white/20 rounded focus:outline-none hidden md:block"
            aria-label="Maximize compose window"
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => closeCompose(false)}
            className="p-1 hover:bg-white/20 rounded focus:outline-none"
            aria-label="Close compose window"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-y-auto">
        {/* Recipients / Leads Dropzone */}
        <div className="p-3 border-b border-line">
          <LeadUploader />
        </div>

        {/* Subject row */}
        <div className="px-4 py-2 border-b border-line">
          <input
            type="text"
            value={draft.subject}
            onChange={(e) => updateDraft({ subject: e.target.value })}
            placeholder="Subject"
            maxLength={200}
            disabled={scheduleMutation.isPending}
            className="w-full text-sm font-medium text-ink placeholder:text-ink-faint focus:outline-none bg-transparent"
          />
        </div>

        {/* Body textarea */}
        <div className="flex-1 p-4 min-h-[160px]">
          <textarea
            value={draft.body}
            onChange={(e) => updateDraft({ body: e.target.value })}
            placeholder="Write your message..."
            rows={8}
            disabled={scheduleMutation.isPending}
            className="w-full h-full text-sm text-ink placeholder:text-ink-faint resize-none focus:outline-none bg-transparent font-sans leading-relaxed"
          />
        </div>

        {/* Schedule settings strip */}
        <div className="bg-red-50/70 border-t border-line p-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                Start time
              </label>
              <input
                type="datetime-local"
                value={draft.startTime}
                onChange={(e) => updateDraft({ startTime: e.target.value })}
                disabled={scheduleMutation.isPending}
                className="w-full h-8 px-2 bg-white rounded border border-line text-ink text-xs focus:outline-none focus:border-red-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                Delay (seconds)
              </label>
              <input
                type="number"
                min="0"
                max="3600"
                value={draft.delaySeconds}
                onChange={(e) => updateDraft({ delaySeconds: parseInt(e.target.value, 10) || 0 })}
                disabled={scheduleMutation.isPending}
                className="w-full h-8 px-2 bg-white rounded border border-line text-ink text-xs focus:outline-none focus:border-red-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-soft mb-1">
                Hourly limit
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={draft.hourlyLimit}
                onChange={(e) => updateDraft({ hourlyLimit: parseInt(e.target.value, 10) || 1 })}
                disabled={scheduleMutation.isPending}
                className="w-full h-8 px-2 bg-white rounded border border-line text-ink text-xs focus:outline-none focus:border-red-600"
              />
            </div>
          </div>

          {/* Helper calculation info */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between text-[11px] text-ink-soft">
            <span>
              First email at <strong className="text-ink">{formatShortTime(validStart)}</strong> ·
              last at ≈ <strong className="text-ink">{formatShortTime(lastTs)}</strong>
            </span>

            {spansMultipleHours && (
              <span className="inline-flex items-center gap-1 text-[#B06000] font-medium bg-[#FEF7E0] px-2 py-0.5 rounded-full mt-1 sm:mt-0">
                <AlertTriangle className="w-3 h-3" />
                Spans multiple hours (rate limit applies)
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 px-4 bg-white border-t border-line flex items-center justify-between shrink-0">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={scheduleMutation.isPending}
            disabled={!isValid || scheduleMutation.isPending}
            leftIcon={<Clock className="w-4 h-4" />}
          >
            Schedule
          </Button>

          <button
            type="button"
            onClick={() => closeCompose(false)}
            className="p-2 text-ink-soft hover:text-red-700 rounded-full hover:bg-surface transition-colors"
            aria-label="Discard draft"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
