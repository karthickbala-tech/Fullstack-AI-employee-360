import React from 'react';
import { DataClassification } from '../../types/employee360';
import { ShieldCheck, Calculator, TrendingUp, Sparkles, HelpCircle, GitFork } from 'lucide-react';

interface DataBadgeProps {
  type: DataClassification;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export const DataBadge: React.FC<DataBadgeProps> = ({ type, showIcon = true, size = 'sm' }) => {
  const norm = String(type || 'Unknown').toLowerCase();

  let label = 'Unknown';
  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let Icon = HelpCircle;

  if (norm.includes('fact')) {
    label = 'Fact';
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    Icon = ShieldCheck;
  } else if (norm.includes('calc')) {
    label = 'Calculation';
    colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
    Icon = Calculator;
  } else if (norm.includes('trend')) {
    label = 'Trend';
    colorClasses = 'bg-violet-50 text-violet-700 border-violet-200';
    Icon = TrendingUp;
  } else if (norm.includes('corr')) {
    label = 'Correlation';
    colorClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    Icon = GitFork;
  } else if (norm.includes('insight') || norm.includes('ai')) {
    label = 'AI Insight';
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
    Icon = Sparkles;
  }

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full border ${colorClasses} ${sizeClass}`}
      title={`Data Classification: ${label}`}
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />}
      <span>{label}</span>
    </span>
  );
};

export default DataBadge;
