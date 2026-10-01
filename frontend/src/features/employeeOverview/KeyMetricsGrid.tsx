import React from 'react';
import { Employee360Data } from '../../types/employee360';
import { DataBadge } from '../../components/shared/DataBadge';
import { 
  Award, 
  CalendarDays, 
  Palmtree, 
  GraduationCap, 
  Clock,
  Sparkles
} from 'lucide-react';

interface KeyMetricsGridProps {
  data: Employee360Data;
  onCardClick?: (tab: string) => void;
}

export const KeyMetricsGrid: React.FC<KeyMetricsGridProps> = ({ data, onCardClick }) => {
  const { deterministicMetrics, leave, learning, performance, attendance } = data;

  // 1. Tenure (Deterministic Metric)
  const tenureValue = deterministicMetrics?.tenure?.formatted || 'Unknown';
  const tenureClass = deterministicMetrics?.tenure?.classification || 'Unknown';

  // 2. Attendance Rate (Deterministic Metric)
  const attendanceValue = deterministicMetrics?.attendancePercentage?.formatted || 'Unknown';
  const attendanceClass = deterministicMetrics?.attendancePercentage?.classification || 'Unknown';

  // 3. Leave Utilization (Deterministic Metric)
  const leaveValue = deterministicMetrics?.leaveUtilization?.formatted || 'Unknown';
  const leaveClass = deterministicMetrics?.leaveUtilization?.classification || 'Unknown';

  // 4. Performance Rating (Deterministic Metric / Fact)
  const perfRating = deterministicMetrics?.performanceRating?.value !== null && deterministicMetrics?.performanceRating?.value !== undefined
    ? String(deterministicMetrics.performanceRating.value)
    : (performance?.overallRating ? String(performance.overallRating) : 'Unknown');
  const perfClass = deterministicMetrics?.performanceRating?.classification || 'Unknown';

  // 5. Leave Days Taken (Raw Fact from Zoho People)
  const leaveDays = leave?.takenThisYear !== undefined ? `${leave.takenThisYear} days taken` : 'Unknown';

  // 6. Completed Learning Courses (Raw Fact from LMS)
  const coursesCount = Array.isArray(learning?.completedCourses)
    ? `${learning.completedCourses.length} courses`
    : 'Unknown';

  const cards = [
    {
      id: 'tenure',
      label: 'Calculated Tenure',
      value: tenureValue,
      sub: data.employment.dateOfJoining ? `Joined: ${data.employment.dateOfJoining}` : 'Date unrecorded',
      icon: Clock,
      classification: tenureClass,
      actionTab: 'overview'
    },
    {
      id: 'attendance',
      label: 'Attendance Rate',
      value: attendanceValue,
      sub: attendance?.totalWorkingDays ? `${attendance.presentDays}/${attendance.totalWorkingDays} working days` : 'No shift logs',
      icon: CalendarDays,
      classification: attendanceClass,
      actionTab: 'overview'
    },
    {
      id: 'leaveUtil',
      label: 'Leave Utilization',
      value: leaveValue,
      sub: leaveDays,
      icon: Palmtree,
      classification: leaveClass,
      actionTab: 'overview'
    },
    {
      id: 'performance',
      label: 'Appraisal Rating',
      value: perfRating,
      sub: performance?.currentReviewPeriod || 'Review cycle unrecorded',
      icon: Award,
      classification: perfClass,
      actionTab: 'overview'
    },
    {
      id: 'learning',
      label: 'Completed Learning',
      value: coursesCount,
      sub: `${learning?.enrolledCourses?.length || 0} currently enrolled`,
      icon: GraduationCap,
      classification: 'Fact',
      actionTab: 'overview'
    },
    {
      id: 'evidence',
      label: 'Grounded Evidence',
      value: `${data.evidence?.length || 0} Records`,
      sub: 'Verified source fields',
      icon: Sparkles,
      classification: 'Fact',
      actionTab: 'evidence'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            onClick={() => onCardClick?.(card.actionTab)}
            className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs hover:border-sky-300 transition-all cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider truncate">
                  {card.label}
                </span>
                <div className="p-1.5 rounded-lg bg-slate-50 text-slate-400">
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-base font-bold text-slate-900 tracking-tight">
                {card.value}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                {card.sub}
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
              <DataBadge type={card.classification as any} size="sm" />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default KeyMetricsGrid;
