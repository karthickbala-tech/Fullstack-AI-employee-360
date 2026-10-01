import React from 'react';
import { Employee360Data, EvidenceItem } from '../../types/employee360';
import { ShieldCheck, Database, Calendar, FileText, CheckCircle2, Lock } from 'lucide-react';

interface EvidencePanelProps {
  data: Employee360Data;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ data }) => {
  const { evidence, employee, metadata, deterministicMetrics } = data;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Evidence Layer & Source Provenance</h3>
            <p className="text-xs text-slate-500">
              Immutable audit trail linking every Employee 360 assertion back to source systems
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Zero Hallucination Protocol Active</span>
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Core Principles reminder banner */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <strong className="text-slate-900 block mb-1">1. Grounded in Fact</strong>
            <p className="text-slate-500 leading-relaxed">
              Every metric originates directly from Zoho People forms, attendance logs, or LMS records.
            </p>
          </div>
          <div>
            <strong className="text-slate-900 block mb-1">2. Deterministic Integrity</strong>
            <p className="text-slate-500 leading-relaxed">
              Calculations (such as tenure and goal completion) are performed in strict deterministic code, never by LLM hallucination.
            </p>
          </div>
          <div>
            <strong className="text-slate-900 block mb-1">3. Non-Inference Policy</strong>
            <p className="text-slate-500 leading-relaxed">
              Missing evidence remains strictly categorized as "Unknown". The system never fabricates unevidenced causes.
            </p>
          </div>
        </div>

        {/* Evidence Table */}
        <div>
          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">
            Recorded Grounding Trail ({evidence?.length || 0} Verified Items)
          </h4>

          {(!evidence || evidence.length === 0) ? (
            <div className="py-12 text-center text-slate-400 text-xs italic border-2 border-dashed border-slate-200 rounded-xl">
              No explicit evidence records attached to this profile snapshot. Missing source fields are preserved without fabrication.
            </div>
          ) : (
            <div className="space-y-3">
              {evidence.map((item, idx) => (
                <div
                  key={item.id || item.field || idx}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-emerald-300 transition-all shadow-2xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {item.source}
                      </span>
                      {item.field && (
                        <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {item.field}
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      Target: {employee.employeeId}
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-800 font-medium leading-relaxed">
                      {item.description}
                    </p>
                  )}

                  {item.value !== undefined && (
                    <div className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-100 text-xs flex items-center justify-between">
                      <span className="text-slate-500">Source Raw Value:</span>
                      <code className="text-slate-900 font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200">
                        {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)}
                      </code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EvidencePanel;
