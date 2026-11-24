import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Send, AlertCircle, ArrowUpRight } from 'lucide-react';
import { Campaign } from '../../types';
import { ProgressBar } from '../ui/ProgressBar';

interface CampaignCardProps {
  campaign: Campaign;
}

export const CampaignCard: React.FC<CampaignCardProps> = ({ campaign }) => {
  const navigate = useNavigate();

  const formattedDate = new Date(campaign.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const { scheduled, processing, sent, failed } = campaign.counts;

  return (
    <div className="bg-white rounded-2xl border border-line p-5 shadow-sm hover:border-red-200 hover:shadow-card transition-all duration-150">
      {/* Title & Subject */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 className="font-display font-medium text-base text-ink line-clamp-1">
          {campaign.subject}
        </h3>
        <span className="shrink-0 text-xs text-ink-soft bg-surface px-2.5 py-1 rounded-full border border-line">
          {campaign.totalEmails} recipient{campaign.totalEmails === 1 ? '' : 's'}
        </span>
      </div>

      {/* Meta specifications */}
      <p className="text-xs text-ink-soft mb-4">
        Created {formattedDate} · {campaign.delaySeconds}s delay · {campaign.hourlyLimit}/hr cap
      </p>

      {/* Progress Bar */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-ink">Progress ({sent}/{campaign.totalEmails} sent)</span>
          <span className="text-ink-soft">
            {Math.round((sent / Math.max(1, campaign.totalEmails)) * 100)}%
          </span>
        </div>
        <ProgressBar sent={sent} total={campaign.totalEmails} />
      </div>

      {/* Status Legend Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-5 text-[11px]">
        {scheduled > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FEF7E0] text-[#B06000] font-medium">
            <Clock className="w-3 h-3" /> {scheduled} Scheduled
          </span>
        )}
        {processing > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FCE8E6] text-[#A50E0E] font-medium animate-pulse">
            {processing} Sending
          </span>
        )}
        {sent > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#E6F4EA] text-[#137333] font-medium">
            <Send className="w-3 h-3" /> {sent} Sent
          </span>
        )}
        {failed > 0 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#C5221F] text-white font-medium">
            <AlertCircle className="w-3 h-3" /> {failed} Failed
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-3 border-t border-line text-xs font-medium">
        <button
          type="button"
          onClick={() => navigate(`/dashboard/scheduled?campaignId=${campaign.id}`)}
          className="text-red-700 hover:text-red-800 flex items-center gap-1 hover:underline"
        >
          <span>View scheduled</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => navigate(`/dashboard/sent?campaignId=${campaign.id}`)}
          className="text-ink-soft hover:text-ink flex items-center gap-1 hover:underline ml-auto"
        >
          <span>View sent history</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
