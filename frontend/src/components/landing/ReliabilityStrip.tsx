import React from 'react';
import { Database, ShieldCheck, Zap, Activity } from 'lucide-react';

export const ReliabilityStrip: React.FC = () => {
  const tiles = [
    {
      icon: Database,
      title: 'BullMQ + Redis persistent queue',
      desc: 'Redis AOF storage guarantees jobs survive unexpected container and process restarts.',
    },
    {
      icon: ShieldCheck,
      title: 'Idempotent sends — no duplicates',
      desc: 'Atomic PostgreSQL claim queries ensure no two workers ever send the same email.',
    },
    {
      icon: Zap,
      title: 'Redis-backed rate limits across workers',
      desc: 'Atomic Lua scripts track hourly quotas cluster-wide without race conditions.',
    },
    {
      icon: Activity,
      title: 'Live queue dashboard',
      desc: 'Inspect real-time delayed, active, and completed jobs via Bull Board.',
    },
  ];

  return (
    <section id="reliability" className="py-16 bg-red-50/70 border-t border-b border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiles.map((t, idx) => {
            const Icon = t.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl p-6 border border-red-200/60 shadow-sm flex flex-col"
              >
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h4 className="font-display font-semibold text-sm text-ink mb-2">{t.title}</h4>
                <p className="text-xs text-ink-soft leading-relaxed">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
