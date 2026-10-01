import React, { useEffect, useState } from 'react';
import { insightsService } from '../../services/insightsService';
import { InsightItem } from '../../types/employee360';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { DataBadge } from '../../components/shared/DataBadge';
import { EvidenceModal } from '../../components/shared/EvidenceModal';
import { 
  Sparkles, 
  HelpCircle, 
  Award, 
  Clock, 
  Zap, 
  FolderCheck, 
  Compass,
  Inbox
} from 'lucide-react';

interface InsightsPanelProps {
  employeeId: string;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ employeeId }) => {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  
  // Modal state for "Why am I seeing this?"
  const [modalInsight, setModalInsight] = useState<InsightItem | null>(null);

  const fetchInsights = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await insightsService.getEmployeeInsights(employeeId);
      setInsights(res.insights || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch employee insights from backend.');
      setInsights([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [employeeId]);

  const categories = [
    { id: 'all', label: 'All Domains', icon: Sparkles },
    { id: 'employment', label: 'Employment', icon: Compass },
    { id: 'performance', label: 'Performance', icon: Award },
    { id: 'attendance', label: 'Attendance', icon: Clock },
    { id: 'development', label: 'Development', icon: Zap },
    { id: 'compliance', label: 'Compliance', icon: FolderCheck }
  ];

  const filteredInsights = activeCategory === 'all'
    ? insights
    : insights.filter(item => (item.domain || '').toLowerCase().includes(activeCategory.toLowerCase()));

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <LoadingState message="Fetching insights from backend intelligence engine..." />
      </div>
    );
  }

  if (error && insights.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <ErrorState
          title="Insights Unavailable"
          message={error}
          onRetry={fetchInsights}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header and Domain Filter Tabs */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Employee 360 Insights</h3>
          <p className="text-xs text-slate-500">
            Source: Headless API (<code>/v1/employees/{employeeId}/insights</code>)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map(cat => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Insights List */}
      <div className="p-6">
        {filteredInsights.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs italic flex flex-col items-center">
            <Inbox className="w-8 h-8 text-slate-300 mb-2" />
            <span>No insights returned by the backend for this category. Missing data is never fabricated.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredInsights.map((insight, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col justify-between hover:border-sky-300 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                      {insight.domain}
                    </span>
                    <DataBadge type={insight.type} size="sm" />
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 leading-snug">
                    {insight.headline}
                  </h4>

                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {insight.description}
                  </p>

                  {insight.recommendedAction && (
                    <div className="mt-3 p-2.5 rounded-lg bg-sky-50/60 border border-sky-100 text-[11px] text-sky-900">
                      <strong className="font-semibold block mb-0.5 text-sky-800">Suggested Action:</strong>
                      <span>{insight.recommendedAction}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    Confidence: <strong className="text-slate-600 font-medium capitalize">{insight.confidence || 'Recorded'}</strong>
                  </span>

                  {insight.evidence && insight.evidence.length > 0 && (
                    <button
                      onClick={() => setModalInsight(insight)}
                      className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 font-medium text-xs py-1 px-2 rounded-md hover:bg-sky-50 transition-colors cursor-pointer"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Why? Grounding</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for "Why am I seeing this?" */}
      <EvidenceModal
        isOpen={Boolean(modalInsight)}
        onClose={() => setModalInsight(null)}
        title={modalInsight?.headline || ''}
        evidence={modalInsight?.evidence || []}
        source={modalInsight?.source}
        confidence={modalInsight?.confidence}
      />
    </div>
  );
};

export default InsightsPanel;
