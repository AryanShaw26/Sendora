import React from 'react';
import { Clock, RefreshCw, Gauge, Users, Bell, Search } from 'lucide-react';

export const FeaturesGrid: React.FC = () => {
  const features = [
    {
      icon: Clock,
      title: 'Precise scheduling',
      desc: 'Every email is a persistent delayed job that fires at its exact scheduled time.',
    },
    {
      icon: RefreshCw,
      title: 'Survives restarts',
      desc: 'Stop the server and start it again — future emails still send once, on time.',
    },
    {
      icon: Gauge,
      title: 'Smart rate limiting',
      desc: 'Hourly caps per sender. Over the limit? Emails roll into the next window — never dropped.',
    },
    {
      icon: Users,
      title: 'Multiple senders',
      desc: 'Spread sends across senders with a minimum delay between messages to mimic real provider throttling.',
    },
    {
      icon: Bell,
      title: 'Slack alerts',
      desc: 'Get a live Slack message the moment a sender hits its hourly limit.',
    },
    {
      icon: Search,
      title: 'Searchable history',
      desc: 'Find any scheduled or sent email instantly with full-text search.',
    },
  ];

  return (
    <section id="features" className="py-20 md:py-28 bg-white border-t border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink tracking-tight mb-4">
            Engineered for bulletproof reliability
          </h2>
          <p className="text-base text-ink-soft">
            Everything you need to orchestrate mass outbound email campaigns without worrying about
            dropped jobs, provider rate limit bans, or duplicates.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="bg-white rounded-2xl border border-line p-8 shadow-sm hover:border-red-200 hover:shadow-card hover:-translate-y-1 transition-all duration-200 flex flex-col items-start"
              >
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-700 mb-5">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-display font-semibold text-lg text-ink mb-2">{f.title}</h3>
                <p className="text-sm text-ink-soft leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
