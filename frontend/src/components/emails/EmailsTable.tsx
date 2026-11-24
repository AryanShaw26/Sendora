import React, { useState } from 'react';
import { RotateCw, ChevronLeft, ChevronRight, AlertCircle, Clock } from 'lucide-react';
import { Email, PaginatedResponse } from '../../types';
import { Table, Column } from '../ui/Table';
import { StatusBadge } from '../ui/StatusBadge';
import { Chip } from '../ui/Chip';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { EmailDetailDrawer } from './EmailDetailDrawer';
import { useCompose } from '../compose/ComposeProvider';
import { Button } from '../ui/Button';

interface EmailsTableProps {
  variant: 'scheduled' | 'sent' | 'search';
  data?: PaginatedResponse<Email>;
  isLoading: boolean;
  isError: boolean;
  error?: Error | null;
  page: number;
  limit: number;
  onPageChange: (newPage: number) => void;
  onLimitChange: (newLimit: number) => void;
  onRefresh: () => void;
  isRefetching?: boolean;
}

export const EmailsTable: React.FC<EmailsTableProps> = ({
  variant,
  data,
  isLoading,
  isError,
  error,
  page,
  limit,
  onPageChange,
  onLimitChange,
  onRefresh,
  isRefetching = false,
}) => {
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const { openCompose } = useCompose();

  const formatDate = (isoString: string | null) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const columns: Column<Email>[] = [
    {
      key: 'recipient',
      header: 'Recipient',
      className: 'w-1/3',
      render: (item) => (
        <div className="flex flex-col">
          <span className="font-medium text-ink">{item.recipient}</span>
          <span className="text-xs text-ink-soft truncate hidden xl:inline">
            From: {item.senderEmail}
          </span>
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      className: 'w-1/3',
      render: (item) => <span className="text-ink truncate block max-w-xs">{item.subject}</span>,
    },
    {
      key: 'time',
      header: variant === 'sent' ? 'Sent time' : 'Scheduled time',
      className: 'w-1/6',
      render: (item) => (
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 text-ink-soft shrink-0" />
          <span title={new Date(item.sentAt || item.scheduledAt).toISOString()}>
            {formatDate(variant === 'sent' && item.sentAt ? item.sentAt : item.scheduledAt)}
          </span>
          {item.deferredCount > 0 && variant !== 'sent' && (
            <Chip variant="amber" className="text-[10px] py-0 px-1.5 hidden lg:inline-flex">
              Rescheduled
            </Chip>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      className: 'w-1/6 text-right',
      render: (item) => (
        <div className="flex justify-end">
          <StatusBadge status={item.status} />
        </div>
      ),
    },
  ];

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-8 w-24" />
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center justify-between py-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="p-12 text-center">
        <div className="max-w-md mx-auto p-6 rounded-2xl bg-red-50 border border-red-200">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-3" />
          <h3 className="font-display font-medium text-base text-ink mb-1">
            Failed to load emails
          </h3>
          <p className="text-xs text-ink-soft mb-4">
            {error?.message || 'A network error occurred while communicating with the server.'}
          </p>
          <Button variant="primary" size="sm" onClick={onRefresh}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const items = data?.items || [];
  const total = data?.total || 0;
  const startIdx = total === 0 ? 0 : (page - 1) * limit + 1;
  const endIdx = Math.min(total, page * limit);
  const totalPages = Math.ceil(total / limit) || 1;

  // Empty state
  if (items.length === 0) {
    if (variant === 'sent') {
      return (
        <EmptyState
          illustration="plane"
          title="No sent emails yet"
          description="Sent emails will appear here once your schedule starts running."
        />
      );
    }
    if (variant === 'scheduled') {
      return (
        <EmptyState
          illustration="envelope"
          title="No scheduled emails"
          description="Emails you schedule will show up here."
          action={
            <Button variant="primary" onClick={openCompose}>
              Compose new email
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        illustration="search"
        title="No emails found"
        description="Try adjusting your filters or search keywords."
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col justify-between">
      {/* Table toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-line bg-surface/50 text-xs text-ink-soft">
        <span className="font-medium text-ink">
          {total} total email{total === 1 ? '' : 's'}
        </span>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span>Rows:</span>
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="bg-white border border-line rounded px-2 py-1 text-xs text-ink focus:outline-none"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            className="p-1 rounded-full hover:bg-surface text-ink-soft hover:text-ink transition-colors"
            title="Refresh emails"
            aria-label="Refresh"
          >
            <RotateCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-red-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Desktop / Tablet Table */}
      <div className="flex-1 overflow-x-auto">
        <Table
          columns={columns}
          data={items}
          onRowClick={(item) => setSelectedEmail(item)}
          caption="Email lists"
        />
      </div>

      {/* Pagination Footer */}
      <div className="flex items-center justify-between px-6 py-3.5 border-t border-line bg-surface/30 text-xs text-ink-soft select-none">
        <span>
          {startIdx}–{endIdx} of {total}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="p-1.5 rounded-lg border border-line bg-white hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="p-1.5 rounded-lg border border-line bg-white hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detail slide-in drawer */}
      <EmailDetailDrawer email={selectedEmail} onClose={() => setSelectedEmail(null)} />
    </div>
  );
};
