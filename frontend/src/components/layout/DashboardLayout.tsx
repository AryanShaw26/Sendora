import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ComposeProvider } from '../compose/ComposeProvider';
import { ComposeWindow } from '../compose/ComposeWindow';

export const DashboardLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Handle Slack callback query params (?slack=connected | ?slack=error)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slackParam = params.get('slack');

    if (slackParam === 'connected') {
      toast.success('Slack connected successfully!', {
        position: 'bottom-left',
        style: { background: '#323232', color: '#FFFFFF', borderRadius: '8px' },
      });
      // Strip param cleanly
      params.delete('slack');
      const newSearch = params.toString();
      navigate(
        { pathname: location.pathname, search: newSearch ? `?${newSearch}` : '' },
        { replace: true }
      );
    } else if (slackParam === 'error') {
      toast.error('Failed to connect Slack integration', {
        position: 'bottom-left',
        style: { background: '#323232', color: '#FFFFFF', borderRadius: '8px' },
      });
      params.delete('slack');
      const newSearch = params.toString();
      navigate(
        { pathname: location.pathname, search: newSearch ? `?${newSearch}` : '' },
        { replace: true }
      );
    }
  }, [location, navigate]);

  return (
    <ComposeProvider>
      <div className="min-h-screen bg-surface flex flex-col text-ink">
        <Header onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />

        <div className="flex-1 flex overflow-hidden">
          <Sidebar collapsed={sidebarCollapsed} />

          {/* Main content: white card container per design.md §6.4 */}
          <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:pr-6 md:pb-6">
            <div className="min-h-[calc(100vh-100px)] bg-white rounded-2xl shadow-card border border-line flex flex-col overflow-hidden">
              <Outlet />
            </div>
          </main>
        </div>

        <ComposeWindow />
      </div>
    </ComposeProvider>
  );
};
