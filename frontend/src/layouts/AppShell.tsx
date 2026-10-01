import React, { useState } from 'react';
import { ZohoConnectionStatus } from '../types/employee360';
import {
  Users,
  Sparkles,
  FileText,
  Clock,
  ShieldCheck,
  MessageSquare,
  RefreshCw,
  ChevronDown,
  Shield,
  Info
} from 'lucide-react';

interface AppShellProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  connectionStatus: ZohoConnectionStatus | null;
  onRefreshAll: () => void;
  isRefreshing: boolean;
  selectedEmployeeName: string;
  selectedEmployeeId: string;
  onOpenEmployeeSelector: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onTabChange,
  connectionStatus,
  onRefreshAll,
  isRefreshing,
  selectedEmployeeName,
  selectedEmployeeId,
  onOpenEmployeeSelector,
  children
}) => {
  const [showSecurityNotice, setShowSecurityNotice] = useState(false);

  const navigationTabs = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'summary', label: 'Summary', icon: FileText },
    { id: 'insights', label: 'Insights', icon: Sparkles },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'evidence', label: 'Evidence', icon: ShieldCheck },
    { id: 'ask-ai', label: 'Ask AI', icon: MessageSquare }
  ];

  const connectionLabel = connectionStatus?.connected
    ? 'Backend Connected'
    : 'Backend Status';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Branding and Platform indicator */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-base tracking-tight">
                    AI Employee 360
                  </span>

                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                    Zoho People Web Tab
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 hidden sm:block">
                  Headless API Consumer • System of Record: Zoho People
                </p>
              </div>
            </div>

            {/* Center: Selected Employee Context */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  Subject Context
                </span>

                <span className="text-xs font-bold text-slate-900 truncate max-w-[140px] sm:max-w-[180px]">
                  {selectedEmployeeId
                    ? `${selectedEmployeeName} (${selectedEmployeeId})`
                    : 'No employee selected'}
                </span>
              </div>

              <button
                onClick={onOpenEmployeeSelector}
                className="ml-2 px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                Change
              </button>
            </div>

            {/* Right Tools: Backend Security Boundary & Refresh */}
            <div className="flex items-center gap-2.5">
              {/* Security Boundary Notice */}
              <div className="relative">
                <button
                  onClick={() =>
                    setShowSecurityNotice(!showSecurityNotice)
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors cursor-pointer border border-slate-200"
                  title="View security boundary architecture"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />

                  <span className="hidden md:inline font-medium">
                    Security:
                  </span>

                  <span className="font-semibold">
                    Backend
                  </span>

                  <Info className="w-3 h-3 text-slate-400" />
                </button>

                {showSecurityNotice && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900 border-b border-slate-100 pb-2">
                      <Shield className="w-4 h-4 text-emerald-600" />

                      <span>
                        Security & Access Boundary
                      </span>
                    </div>

                    <p className="text-slate-600 leading-relaxed">
                      The frontend is{' '}
                      <strong>NOT</strong> the security boundary.
                      Authoritative access control is enforced by
                      the Zoho Catalyst backend.
                    </p>

                    <div className="p-2 rounded bg-slate-50 border border-slate-200 font-mono text-[10px] text-slate-700">
                      User → Auth → Tenant → Role → Scope → Allowed Data
                    </div>

                    <p className="text-[11px] text-slate-400">
                      The frontend does not assign or grant roles.
                      Employee and field access decisions are
                      determined by the backend and reflected in the
                      data returned by the API.
                    </p>

                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={() =>
                          setShowSecurityNotice(false)
                        }
                        className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-medium"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Backend Connection Indicator */}
              <div
                className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium border ${
                  connectionStatus?.connected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
                title={
                  connectionStatus?.message ||
                  'Backend connection status'
                }
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    connectionStatus?.connected
                      ? 'bg-emerald-500'
                      : 'bg-slate-400'
                  }`}
                />

                <span>{connectionLabel}</span>
              </div>

              {/* Refresh Button */}
              <button
                onClick={onRefreshAll}
                disabled={isRefreshing || !selectedEmployeeId}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                title="Refresh Employee 360 data"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    isRefreshing ? 'animate-spin' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Subheader Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pt-1 border-t border-slate-100 scrollbar-none">
            {navigationTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'border-sky-600 text-sky-700 bg-sky-50/40 font-bold'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? 'text-sky-600'
                        : 'text-slate-400'
                    }`}
                  />

                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Page Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer Notice */}
      <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-center gap-2">
          <span>
            AI Employee 360 • Catalyst Advanced I/O Consumer
          </span>
        </div>
      </footer>
    </div>
  );
};

export default AppShell;