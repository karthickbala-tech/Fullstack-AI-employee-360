import React from 'react';
import { AlertCircle, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  status?: number;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Unable to Load Data',
  message = 'An unexpected error occurred while communicating with the Employee 360 service.',
  code,
  status,
  onRetry
}) => {
  const isAuth = status === 401 || status === 403 || code === 'UNAUTHORIZED' || code === 'FORBIDDEN';
  const isNetwork = code === 'NETWORK_ERROR' || code === 'TIMEOUT';

  let Icon = AlertCircle;
  let bgClass = 'bg-rose-50 border-rose-200 text-rose-800';

  if (isAuth) {
    Icon = ShieldAlert;
    bgClass = 'bg-amber-50 border-amber-200 text-amber-800';
  } else if (isNetwork) {
    Icon = WifiOff;
    bgClass = 'bg-slate-50 border-slate-200 text-slate-800';
  }

  // Sanitize message: never display stack traces or paths
  const safeMessage = message.split('\n')[0].replace(/\/app[^\s]*/g, '[system]').slice(0, 300);

  return (
    <div className={`p-6 rounded-xl border ${bgClass} text-center max-w-lg mx-auto my-8 shadow-xs`}>
      <div className="inline-flex p-3 rounded-full bg-white shadow-xs mb-3">
        <Icon className="w-6 h-6 text-rose-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600 mt-2 mb-4 leading-relaxed">
        {safeMessage}
      </p>

      {code && (
        <div className="text-xs text-slate-400 font-mono mb-4">
          Error Code: {code} {status ? `(HTTP ${status})` : ''}
        </div>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
};

export default ErrorState;
