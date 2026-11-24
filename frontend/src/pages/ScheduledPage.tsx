import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEmails } from '../api/client';
import { EmailsTable } from '../components/emails/EmailsTable';

export const ScheduledPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get('campaignId') || undefined;

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['emails', 'scheduled', page, limit, campaignId],
    queryFn: () => getEmails({ status: 'scheduled', page, limit, campaignId }),
    refetchInterval: 10000,
  });

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Page Title Header */}
      <div className="px-6 py-4 border-b border-line flex items-center justify-between">
        <div>
          <h1 className="font-display font-medium text-xl text-ink">Scheduled Emails</h1>
          <p className="text-xs text-ink-soft mt-0.5">
            {campaignId
              ? 'Showing emails filtered by selected campaign'
              : 'Emails currently queued and waiting for their scheduled send time'}
          </p>
        </div>
      </div>

      <EmailsTable
        variant="scheduled"
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
    </div>
  );
};
