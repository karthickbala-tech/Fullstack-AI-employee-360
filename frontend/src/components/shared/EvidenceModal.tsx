import React from 'react';
import { X, ShieldCheck, Database, Calendar, FileText } from 'lucide-react';
import { EvidenceItem } from '../../types/employee360';

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  evidence: Array<EvidenceItem | string>;
  source?: string;
  date?: string;
  confidence?: string;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  isOpen,
  onClose,
  title,
  evidence,
  source,
  date,
  confidence
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Evidence & Source Trail</h3>
              <p className="text-xs text-slate-500">Why am I seeing this insight?</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-xs font-medium text-slate-500 block uppercase tracking-wider mb-1">
              Insight Subject
            </span>
            <p className="text-sm font-medium text-slate-900">{title}</p>
          </div>

          {/* Metadata badges */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {source && (
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <Database className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="truncate">
                  <span className="text-slate-400 block text-[10px]">Source Record</span>
                  <span className="font-medium text-slate-700">{source}</span>
                </div>
              </div>
            )}
            {confidence && (
              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">Confidence</span>
                  <span className="font-medium text-slate-700 capitalize">{confidence}</span>
                </div>
              </div>
            )}
          </div>

          {/* Evidence Items */}
          <div>
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider block mb-2">
              Verified Grounding Data
            </span>
            {evidence.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No specific source records linked to this statement.</p>
            ) : (
              <div className="space-y-2.5">
                {evidence.map((item, idx) => {
                  if (typeof item === 'string') {
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50/50 border border-emerald-100 text-xs text-slate-800"
                      >
                        <FileText className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                        <span className="leading-relaxed">{item}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-medium text-slate-900">
                        <span className="flex items-center gap-1.5 text-sky-700">
                          <Database className="w-3.5 h-3.5" />
                          {item.source}
                        </span>
                        {item.field && (
                          <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {item.field}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-slate-600">{item.description}</p>
                      )}
                      {item.value !== undefined && (
                        <div className="mt-1 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Value:</span>
                          <span className="font-semibold text-slate-800">{String(item.value)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close Grounding View
          </button>
        </div>
      </div>
    </div>
  );
};

export default EvidenceModal;
