import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Hash, ExternalLink, ShieldCheck, Mail, LogOut, CheckCircle2 } from 'lucide-react';
import {
  getSlackStatus,
  getSlackConnectUrl,
  disconnectSlack,
  sendTestSlackAlert,
  getSenders,
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);

  // 1. Slack status query
  const { data: slackStatus } = useQuery({
    queryKey: ['slackStatus'],
    queryFn: getSlackStatus,
  });

  // 2. Senders query
  const { data: sendersData } = useQuery({
    queryKey: ['senders'],
    queryFn: getSenders,
  });

  // Connect Slack mutation
  const connectSlackMutation = useMutation({
    mutationFn: getSlackConnectUrl,
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to start Slack OAuth authorization', {
        position: 'bottom-left',
        style: { background: '#323232', color: '#FFFFFF', borderRadius: '8px' },
      });
    },
  });

  // Test Slack message mutation
  const testSlackMutation = useMutation({
    mutationFn: sendTestSlackAlert,
    onSuccess: () => {
      toast.success('Test message sent to Slack channel!', {
        position: 'bottom-left',
        style: { background: '#323232', color: '#FFFFFF', borderRadius: '8px' },
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to send test message to Slack', {
        position: 'bottom-left',
        style: { background: '#323232', color: '#FFFFFF', borderRadius: '8px' },
      });
    },
  });

  // Disconnect Slack mutation
  const disconnectMutation = useMutation({
    mutationFn: disconnectSlack,
    onSuccess: () => {
      setConfirmDisconnectOpen(false);
      queryClient.invalidateQueries({ queryKey: ['slackStatus'] });
      toast.success('Slack disconnected successfully', {
        position: 'bottom-left',
        style: { background: '#323232', color: '#FFFFFF', borderRadius: '8px' },
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to disconnect Slack', {
        position: 'bottom-left',
        style: { background: '#323232', color: '#FFFFFF', borderRadius: '8px' },
      });
    },
  });

  const senders = sendersData?.items || [];

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6 overflow-y-auto">
      {/* Page Title */}
      <div className="pb-4 border-b border-line">
        <h1 className="font-display font-medium text-xl text-ink">Settings & Integrations</h1>
        <p className="text-xs text-ink-soft mt-0.5">
          Configure real-time notifications, SMTP sending pools, and queue diagnostics
        </p>
      </div>

      {/* Card 1: Slack Alerts */}
      <div className="bg-white rounded-2xl border border-line p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
              <Hash className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-base text-ink">Slack Alerts</h2>
              <p className="text-xs text-ink-soft">
                Get notified in Slack when any sender hits its hourly limit.
              </p>
            </div>
          </div>

          {slackStatus?.connected && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected
            </span>
          )}
        </div>

        {slackStatus?.connected ? (
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-surface rounded-xl border border-line text-xs flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-ink">
                  {slackStatus.teamName || 'Slack Workspace'}
                </span>
                {slackStatus.channelName && (
                  <span className="text-ink-soft ml-2">Channel: {slackStatus.channelName}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                loading={testSlackMutation.isPending}
                onClick={() => testSlackMutation.mutate()}
              >
                Send test message
              </Button>

              <button
                type="button"
                onClick={() => setConfirmDisconnectOpen(true)}
                className="text-xs text-red-700 hover:text-red-800 font-semibold underline ml-auto"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="pt-2">
            <Button
              variant="primary"
              size="md"
              loading={connectSlackMutation.isPending}
              onClick={() => connectSlackMutation.mutate()}
              leftIcon={<Hash className="w-4 h-4 stroke-[2.5]" />}
            >
              Connect Slack
            </Button>
          </div>
        )}
      </div>

      {/* Card 2: Active Senders Pool */}
      <div className="bg-white rounded-2xl border border-line p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display font-semibold text-base text-ink">Configured Senders Pool</h2>
            <p className="text-xs text-ink-soft">
              Active SMTP accounts used for round-robin sending with cluster-wide spacing
            </p>
          </div>
        </div>

        <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
          {senders.map((s) => (
            <div key={s.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-surface">
              <div className="flex items-center gap-3">
                <Avatar name={s.displayName} size="sm" />
                <div>
                  <p className="font-semibold text-ink">{s.email}</p>
                  <p className="text-[11px] text-ink-soft">
                    {s.displayName} · Host: {s.smtpHost || 'smtp.ethereal.email'}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Active
              </span>
            </div>
          ))}
          {senders.length === 0 && (
            <div className="p-4 text-center text-xs text-ink-soft">
              No active senders found. Run `npm run seed:senders` on the server.
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Queue Diagnostics */}
      <div className="bg-white rounded-2xl border border-line p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-base text-ink">BullMQ Queue Dashboard</h2>
              <p className="text-xs text-ink-soft">
                Live inspection of delayed, active, and completed jobs via Bull Board
              </p>
            </div>
          </div>

          <a
            href={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'}/admin/queues`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              size="sm"
              rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Open dashboard
            </Button>
          </a>
        </div>
      </div>

      {/* Card 4: Account Details */}
      {user && (
        <div className="bg-white rounded-2xl border border-line p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar src={user.avatarUrl} name={user.name} size="lg" />
              <div>
                <h3 className="font-display font-semibold text-base text-ink">{user.name}</h3>
                <p className="text-xs text-ink-soft">{user.email}</p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              leftIcon={<LogOut className="w-4 h-4 text-red-700" />}
            >
              Sign out
            </Button>
          </div>
        </div>
      )}

      {/* Disconnect Slack Confirmation Modal */}
      <Modal
        isOpen={confirmDisconnectOpen}
        onClose={() => setConfirmDisconnectOpen(false)}
        title="Disconnect Slack?"
      >
        <div className="space-y-4 text-sm text-ink-soft">
          <p>
            Disconnect Slack? You'll stop receiving real-time hourly rate limit alerts in your Slack
            workspace.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDisconnectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={disconnectMutation.isPending}
              onClick={() => disconnectMutation.mutate()}
            >
              Disconnect
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
