import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ElementType;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No records found',
  description = 'There is no recorded information available for this domain in the Employee 360 profile.',
  icon: Icon = Inbox,
  action
}) => {
  return (
    <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
      <div className="inline-flex p-3 rounded-full bg-slate-100 text-slate-400 mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
