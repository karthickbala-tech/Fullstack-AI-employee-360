import React from 'react';

interface UnknownValueProps {
  value: any;
  fallback?: string;
  className?: string;
  asBadge?: boolean;
}

export const UnknownValue: React.FC<UnknownValueProps> = ({
  value,
  fallback = 'Not recorded',
  className = '',
  asBadge = false
}) => {
  const isPresent = value !== null && value !== undefined && value !== '';

  if (isPresent) {
    return <span className={className}>{value}</span>;
  }

  if (asBadge) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
        {fallback}
      </span>
    );
  }

  return (
    <span className={`text-slate-400 italic text-sm ${className}`}>
      {fallback}
    </span>
  );
};

export default UnknownValue;
