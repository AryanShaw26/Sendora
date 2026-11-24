import React from 'react';
import { NavLink } from 'react-router-dom';
import { Clock, Send, Layers, Settings, Plus, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getEmails, getSlackStatus } from '../../api/client';
import { useCompose } from '../compose/ComposeProvider';

interface SidebarProps {
  collapsed: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const { openCompose } = useCompose();

  // Get live counts for badge
  const { data: scheduledData } = useQuery({
    queryKey: ['emails', 'scheduled', 'count'],
    queryFn: () => getEmails({ status: 'scheduled', limit: 1 }),
    refetchInterval: 10000,
  });

  const { data: sentData } = useQuery({
    queryKey: ['emails', 'sent', 'count'],
    queryFn: () => getEmails({ status: 'sent', limit: 1 }),
    refetchInterval: 10000,
  });

  const { data: slackData } = useQuery({
    queryKey: ['slackStatus'],
    queryFn: getSlackStatus,
    staleTime: 30000,
  });

  const navItems = [
    {
      to: '/dashboard/scheduled',
      label: 'Scheduled',
      icon: Clock,
      count: scheduledData?.total,
    },
    {
      to: '/dashboard/sent',
      label: 'Sent',
      icon: Send,
      count: sentData?.total,
    },
    {
      to: '/dashboard/campaigns',
      label: 'Campaigns',
      icon: Layers,
    },
    {
      to: '/dashboard/settings',
      label: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <aside
      className={`h-[calc(100vh-64px)] bg-surface flex flex-col justify-between py-4 transition-all duration-200 select-none ${
        collapsed ? 'w-20 px-2' : 'w-64 pr-3'
      }`}
    >
      <div>
        {/* Prominent Gmail-style Compose button */}
        <div className="mb-4 px-2">
          <button
            type="button"
            onClick={openCompose}
            className={`flex items-center justify-center gap-3 bg-red-100 hover:bg-red-200 active:bg-red-300 text-red-800 font-semibold shadow-card hover:shadow-float rounded-full transition-all duration-150 ${
              collapsed ? 'w-14 h-14 mx-auto' : 'w-full h-14 px-6'
            }`}
          >
            <Plus className="w-6 h-6 text-red-700 shrink-0" strokeWidth={2.5} />
            {!collapsed && <span className="text-sm">Compose</span>}
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex flex-col space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between h-12 rounded-r-full text-sm transition-colors duration-150 ${
                    collapsed ? 'px-4 justify-center' : 'px-6'
                  } ${
                    isActive
                      ? 'bg-red-100 text-red-800 font-bold'
                      : 'text-ink-soft hover:bg-surface-hover hover:text-ink font-medium'
                  }`
                }
              >
                <div className="flex items-center gap-4">
                  <Icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </div>
                {!collapsed && item.count !== undefined && item.count > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-black/5">
                    {item.count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer Area */}
      <div className="px-4 pt-4 border-t border-line/60 flex flex-col gap-2">
        {!collapsed && (
          <>
            <a
              href={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/admin/queues`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between text-xs font-medium text-ink-soft hover:text-red-700 py-1 transition-colors"
            >
              <span>Queue dashboard</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <NavLink
              to="/dashboard/settings"
              className="flex items-center gap-2 text-xs text-ink-soft hover:text-ink py-1"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  slackData?.connected ? 'bg-emerald-500' : 'bg-ink-faint'
                }`}
              />
              <span>{slackData?.connected ? 'Slack connected' : 'Slack not connected'}</span>
            </NavLink>
          </>
        )}
      </div>
    </aside>
  );
};
