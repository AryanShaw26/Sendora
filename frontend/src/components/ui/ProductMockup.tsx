import React from 'react';
import { Mail, Clock, Send, CheckCircle2, Layers } from 'lucide-react';

export const ProductMockup: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`relative w-full max-w-lg bg-white rounded-2xl shadow-compose border border-line overflow-hidden text-xs select-none ${className}`}
    >
      {/* Fake browser topbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-line">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-300" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="h-5 px-6 rounded-full bg-white border border-line-strong text-[10px] text-ink-soft flex items-center">
          app.sendora.local/dashboard/scheduled
        </div>
        <div className="w-4" />
      </div>

      <div className="flex h-80">
        {/* Fake mini sidebar */}
        <div className="w-36 bg-surface p-2.5 border-r border-line flex flex-col gap-1">
          <div className="h-8 rounded-full bg-red-100 text-red-800 font-medium px-3 flex items-center gap-2 mb-2">
            <Mail className="w-3.5 h-3.5" />
            <span>Compose</span>
          </div>
          <div className="h-7 rounded-r-full bg-red-100/70 text-red-800 font-medium px-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-red-700" />
              Scheduled
            </span>
            <span className="text-[10px] bg-red-200 px-1.5 rounded-full">12</span>
          </div>
          <div className="h-7 px-2.5 flex items-center gap-1.5 text-ink-soft hover:bg-surface-hover rounded-r-full">
            <Send className="w-3 h-3" />
            <span>Sent</span>
          </div>
          <div className="h-7 px-2.5 flex items-center gap-1.5 text-ink-soft hover:bg-surface-hover rounded-r-full">
            <Layers className="w-3 h-3" />
            <span>Campaigns</span>
          </div>
        </div>

        {/* Fake main content list */}
        <div className="flex-1 bg-white p-3 flex flex-col">
          <div className="flex items-center justify-between border-b border-line pb-2 mb-2 font-medium text-ink-soft text-[11px]">
            <span>Scheduled Emails (12)</span>
            <span className="text-[10px] text-red-700">Auto-refresh 10s</span>
          </div>

          <div className="flex flex-col divide-y divide-line">
            <div className="py-2 flex items-center justify-between hover:bg-surface-hover px-1 rounded">
              <div className="flex flex-col">
                <span className="font-medium text-ink">sarah.c@techcorp.io</span>
                <span className="text-[10px] text-ink-soft">Exclusive Demo Invitation</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#FEF7E0] text-[#B06000] flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> 3:05 PM
              </span>
            </div>

            <div className="py-2 flex items-center justify-between hover:bg-surface-hover px-1 rounded">
              <div className="flex flex-col">
                <span className="font-medium text-ink">alexander@growthlab.co</span>
                <span className="text-[10px] text-ink-soft">Q4 Growth Strategy Sync</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#FCE8E6] text-[#A50E0E] flex items-center gap-1">
                Sending...
              </span>
            </div>

            <div className="py-2 flex items-center justify-between hover:bg-surface-hover px-1 rounded">
              <div className="flex flex-col">
                <span className="font-medium text-ink">emma.w@acme.org</span>
                <span className="text-[10px] text-ink-soft">Product Onboarding Sequence</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#E6F4EA] text-[#137333] flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> Sent
              </span>
            </div>
          </div>

          {/* Mini floating compose mockup docked at bottom right */}
          <div className="mt-auto ml-auto w-48 rounded-t-lg bg-white border border-line shadow-compose overflow-hidden">
            <div className="bg-red-700 text-white px-2 py-1 flex items-center justify-between text-[10px] font-medium">
              <span>New Email</span>
              <span>_ ✕</span>
            </div>
            <div className="p-2 space-y-1 text-[10px]">
              <div className="text-red-800 bg-red-50 p-1 rounded font-medium">
                1,250 leads uploaded
              </div>
              <div className="h-4 bg-surface rounded flex items-center px-1 text-ink-faint">
                Subject line...
              </div>
              <div className="flex justify-end pt-1">
                <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[9px] font-medium">
                  Schedule
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
