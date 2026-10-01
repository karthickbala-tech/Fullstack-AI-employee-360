import React, { useEffect, useState } from 'react';
import { timelineService } from '../../services/timelineService';
import { TimelineEvent } from '../../types/employee360';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { 
  Calendar, 
  Award, 
  Briefcase, 
  GraduationCap, 
  AlertCircle, 
  CheckCircle2,
  Inbox
} from 'lucide-react';

interface TimelinePanelProps {
  employeeId: string;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({ employeeId }) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await timelineService.getEmployeeTimeline(employeeId);
      setEvents(res.events || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load timeline events from backend.');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [employeeId]);

  const getEventIcon = (type: string) => {
    const t = (type || '').toUpperCase();
    if (t.includes('JOIN') || t.includes('LIFECYCLE') || t.includes('CONFIRM')) {
      return { icon: CheckCircle2, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    }
    if (t.includes('PROMO') || t.includes('CAREER') || t.includes('ROLE')) {
      return { icon: Briefcase, color: 'bg-sky-100 text-sky-700 border-sky-200' };
    }
    if (t.includes('REVIEW') || t.includes('PERF')) {
      return { icon: Award, color: 'bg-purple-100 text-purple-700 border-purple-200' };
    }
    if (t.includes('COURSE') || t.includes('LEARNING')) {
      return { icon: GraduationCap, color: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
    }
    return { icon: Calendar, color: 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <LoadingState message="Retrieving verified chronological timeline events..." />
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <ErrorState
          title="Timeline Unavailable"
          message={error}
          onRetry={fetchTimeline}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Verified Employee Lifecycle Timeline</h3>
          <p className="text-xs text-slate-500">
            Source: Headless API (<code>/v1/employees/{employeeId}/timeline</code>)
          </p>
        </div>

        <span className="text-xs text-slate-500 font-medium">
          Total Events: <strong className="text-slate-800">{events.length}</strong>
        </span>
      </div>

      {/* Timeline Stream */}
      <div className="p-6">
        {events.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs italic flex flex-col items-center">
            <Inbox className="w-8 h-8 text-slate-300 mb-2" />
            <span>No timeline events recorded by backend. Missing dates in source records are omitted rather than fabricated.</span>
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {events.map((evt, idx) => {
              const { icon: EventIcon, color } = getEventIcon(evt.type);

              return (
                <div key={evt.id || idx} className="relative group">
                  <div
                    className={`absolute -left-6 top-1 w-6 h-6 rounded-full border flex items-center justify-center shadow-2xs ${color}`}
                  >
                    <EventIcon className="w-3.5 h-3.5" />
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-sky-300 transition-all shadow-2xs ml-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{evt.title}</span>
                        {evt.type && (
                          <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {evt.type}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{evt.date}</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {evt.description}
                    </p>

                    {evt.source && (
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Source: <strong className="text-slate-600 font-medium">{evt.source}</strong></span>
                        <span className="font-mono text-[10px]">ID: {evt.id}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimelinePanel;
