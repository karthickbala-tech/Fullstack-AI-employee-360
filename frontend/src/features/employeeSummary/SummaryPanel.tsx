import React, { useEffect, useState } from 'react';
import { summaryService } from '../../services/summaryService';
import { EmployeeSummaryResponse } from '../../types/employee360';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { 
  Sparkles, 
  ShieldCheck, 
  Bot, 
  Database,
  AlertCircle
} from 'lucide-react';

interface SummaryPanelProps {
  employeeId: string;
  onOpenEvidence?: () => void;
}

export const SummaryPanel: React.FC<SummaryPanelProps> = ({
  employeeId,
  onOpenEvidence
}) => {
  const [summaryData, setSummaryData] = useState<EmployeeSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await summaryService.getEmployeeSummary(employeeId);
      setSummaryData(res);
    } catch (err: any) {
      setError(err?.message || 'Unable to retrieve employee summary from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [employeeId]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <LoadingState message="Retrieving employee summary from backend API..." />
      </div>
    );
  }

  if (error && !summaryData) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <ErrorState
          title="Summary Unavailable"
          message={error}
          onRetry={fetchSummary}
        />
      </div>
    );
  }

  const paragraphs = summaryData?.summary ? summaryData.summary.split('\n\n') : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-sky-50/50 via-slate-50/30 to-white">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Employee 360 Summary</h3>
            <p className="text-xs text-slate-500">
              Source: Headless API (<code>/v1/employees/{employeeId}/summary</code>)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {summaryData?.isAiGenerated ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
              <Bot className="w-3.5 h-3.5" />
              <span>AI Synthesized ({summaryData.model || 'Gemini'})</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Deterministic Summary</span>
            </span>
          )}

          {summaryData && summaryData.evidenceCount > 0 && (
            <button
              onClick={onOpenEvidence}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
            >
              <Database className="w-3 h-3 text-slate-500" />
              <span>{summaryData.evidenceCount} Grounded Facts</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Narrative */}
      <div className="p-6">
        <div className="space-y-3.5 text-sm text-slate-700 leading-relaxed">
          {paragraphs.length > 0 ? (
            paragraphs.map((para, idx) => (
              <p key={idx} className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100">
                {para}
              </p>
            ))
          ) : (
            <p className="text-slate-400 italic text-xs">No summary text returned by backend.</p>
          )}
        </div>

        {/* Limitations Notice */}
        {summaryData?.limitations && summaryData.limitations.length > 0 && (
          <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
            <span className="font-semibold text-slate-700 block mb-1">System Limitations & Context:</span>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500">
              {summaryData.limitations.map((lim, i) => (
                <li key={i}>{lim}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryPanel;
