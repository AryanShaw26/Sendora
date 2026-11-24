import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCampaigns } from '../api/client';
import { CampaignCard } from '../components/campaigns/CampaignCard';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useCompose } from '../components/compose/ComposeProvider';

export const CampaignsPage: React.FC = () => {
  const { openCompose } = useCompose();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['campaigns'],
    queryFn: getCampaigns,
    refetchInterval: 10000,
  });

  const campaigns = data?.items || [];

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto">
      {/* Page Title */}
      <div className="flex items-center justify-between pb-6 border-b border-line mb-6">
        <div>
          <h1 className="font-display font-medium text-xl text-ink">Campaigns</h1>
          <p className="text-xs text-ink-soft mt-0.5">
            Monitor outbound sequence progress, timing, and per-sender delivery status
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={openCompose}>
          New Campaign
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-6 border border-line rounded-2xl bg-white space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="p-8 text-center max-w-md mx-auto">
          <p className="text-sm text-red-700 font-medium mb-3">
            {error?.message || 'Failed to load campaigns.'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}

      {!isLoading && !isError && campaigns.length === 0 && (
        <EmptyState
          illustration="plane"
          title="No campaigns yet"
          description="Schedule your first bulk email campaign with custom delays and rate limits."
          action={
            <Button variant="primary" onClick={openCompose}>
              Compose new email
            </Button>
          }
        />
      )}

      {!isLoading && campaigns.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {campaigns.map((camp) => (
            <CampaignCard key={camp.id} campaign={camp} />
          ))}
        </div>
      )}
    </div>
  );
};
