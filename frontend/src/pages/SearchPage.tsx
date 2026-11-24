import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { searchEmails } from '../api/client';
import { EmailsTable } from '../components/emails/EmailsTable';

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || undefined;

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['emails', 'search', q, statusFilter, page, limit],
    queryFn: () => searchEmails({ q, status: statusFilter, page, limit }),
    enabled: q.trim().length > 0,
    retry: false,
  });

  const handleStatusFilter = (st?: string) => {
    const next = new URLSearchParams(searchParams);
    if (st) {
      next.set('status', st);
    } else {
      next.delete('status');
    }
    setSearchParams(next);
    setPage(1);
  };

  const is503 = error?.message?.includes('temporarily unavailable');

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Search Header */}
      <div className="px-6 py-4 border-b border-line flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl text-ink">
            Results for “<span className="text-red-700">{q}</span>”
          </h1>
          <p className="text-xs text-ink-soft mt-0.5">
            Full-text search matching recipients, subjects, and email content via Elasticsearch
          </p>
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => handleStatusFilter(undefined)}
            className={`px-3 py-1 rounded-full transition-colors ${
              !statusFilter
                ? 'bg-red-100 text-red-800 font-semibold border border-red-200'
                : 'bg-surface hover:bg-surface-hover text-ink-soft'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => handleStatusFilter('scheduled')}
            className={`px-3 py-1 rounded-full transition-colors ${
              statusFilter === 'scheduled'
                ? 'bg-red-100 text-red-800 font-semibold border border-red-200'
                : 'bg-surface hover:bg-surface-hover text-ink-soft'
            }`}
          >
            Scheduled
          </button>
          <button
            type="button"
            onClick={() => handleStatusFilter('sent')}
            className={`px-3 py-1 rounded-full transition-colors ${
              statusFilter === 'sent'
                ? 'bg-red-100 text-red-800 font-semibold border border-red-200'
                : 'bg-surface hover:bg-surface-hover text-ink-soft'
            }`}
          >
            Sent
          </button>
          <button
            type="button"
            onClick={() => handleStatusFilter('failed')}
            className={`px-3 py-1 rounded-full transition-colors ${
              statusFilter === 'failed'
                ? 'bg-red-100 text-red-800 font-semibold border border-red-200'
                : 'bg-surface hover:bg-surface-hover text-ink-soft'
            }`}
          >
            Failed
          </button>
        </div>
      </div>

      {is503 ? (
        <div className="p-12 text-center max-w-md mx-auto">
          <div className="p-6 rounded-2xl bg-[#FEF7E0] border border-[#FCE8B2]">
            <AlertTriangle className="w-8 h-8 text-[#B06000] mx-auto mb-2" />
            <h3 className="font-display font-medium text-base text-ink mb-1">
              Search is temporarily unavailable
            </h3>
            <p className="text-xs text-ink-soft">
              Elasticsearch search service is currently offline or indexing. Standard table views
              remain available in Scheduled and Sent tabs.
            </p>
          </div>
        </div>
      ) : (
        <EmailsTable
          variant="search"
          data={data}
          isLoading={isLoading}
          isError={isError}
          error={error}
          page={page}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
          onRefresh={() => refetch()}
          isRefetching={isRefetching}
        />
      )}
    </div>
  );
};
