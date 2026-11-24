import React from 'react';
import { Upload, Sliders, CheckCircle } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      num: '1',
      title: 'Upload leads',
      desc: 'Drop your CSV or plain text file. Sendora extracts, validates, and dedupes all email addresses automatically.',
      icon: Upload,
    },
    {
      num: '2',
      title: 'Set timing & limits',
      desc: 'Pick your start time, delay between individual emails, and safe hourly sender limits.',
      icon: Sliders,
    },
    {
      num: '3',
      title: 'Relax while it sends',
      desc: 'BullMQ handles atomic queues, multi-sender round-robin, and rate-limit roll-forward automatically.',
      icon: CheckCircle,
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-surface border-t border-line">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-ink tracking-tight mb-4">
            How Sendora works
          </h2>
          <p className="text-base text-ink-soft">
            Three straightforward steps to launch your delayed email sequences.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Dashed connector line on desktop */}
          <div className="hidden md:block absolute top-1/4 left-1/6 right-1/6 h-0.5 border-t-2 border-dashed border-red-200 z-0" />

          {steps.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={idx}
                className="relative z-10 bg-white rounded-2xl border border-line p-8 shadow-sm flex flex-col items-center text-center"
              >
                <div className="w-12 h-12 rounded-full bg-red-600 text-white font-display font-bold text-lg flex items-center justify-center mb-6 shadow-sm">
                  {s.num}
                </div>
                <div className="w-8 h-8 rounded-lg bg-red-50 text-red-700 flex items-center justify-center mb-3">
                  <Icon className="w-4 h-4" />
                </div>
                <h3 className="font-display font-semibold text-lg text-ink mb-3">{s.title}</h3>
                <p className="text-sm text-ink-soft leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
