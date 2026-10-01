import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  variant?: 'spinner' | 'skeleton' | 'compact';
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading Employee 360 data...',
  variant = 'spinner'
}) => {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
        <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
        <span>{message}</span>
      </div>
    );
  }

  if (variant === 'skeleton') {
    return (
      <div className="w-full space-y-4 animate-pulse p-4">
        <div className="h-6 bg-slate-200 rounded w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-24 bg-slate-100 rounded-lg border border-slate-200"></div>
          <div className="h-24 bg-slate-100 rounded-lg border border-slate-200"></div>
          <div className="h-24 bg-slate-100 rounded-lg border border-slate-200"></div>
        </div>
        <div className="h-32 bg-slate-100 rounded-lg border border-slate-200"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="p-3 bg-sky-50 rounded-full mb-3 text-sky-600">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
      <h3 className="text-base font-semibold text-slate-800">{message}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm">
        Retrieving verified canonical context and deterministic intelligence
      </p>
    </div>
  );
};

export default LoadingState;
