import React from 'react';
import { Employee360Data } from '../../types/employee360';
import { UnknownValue } from '../../components/shared/UnknownValue';
import { DataBadge } from '../../components/shared/DataBadge';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  Award, 
  Clock, 
  Palmtree, 
  CheckCircle2, 
  Briefcase, 
  GraduationCap, 
  Zap, 
  Inbox
} from 'lucide-react';

interface Employee360DashboardProps {
  data: Employee360Data;
  activeTab: string;
}

export const Employee360Dashboard: React.FC<Employee360DashboardProps> = ({ data, activeTab }) => {
  const { 
    employee, 
    employment, 
    organisation, 
    attendance, 
    leave, 
    performance, 
    goals, 
    skills, 
    learning, 
    career, 
    lifecycle 
  } = data;

  return (
    <div className="space-y-6">
      {/* 1. Employment & Organisation */}
      {(activeTab === 'all' || activeTab === 'employment') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">Employment Details</h3>
              </div>
              <DataBadge type="Fact" size="sm" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Designation</span>
                <span className="font-semibold text-slate-800">
                  <UnknownValue value={employment.jobTitle} />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Employment Type</span>
                <span className="font-medium text-slate-800">
                  <UnknownValue value={employment.employeeType} />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Work Location</span>
                <span className="font-medium text-slate-800">
                  <UnknownValue value={employment.workLocation} />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Work Shift</span>
                <span className="font-medium text-slate-800">
                  <UnknownValue value={employment.workShift} fallback="Standard" />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Date of Joining</span>
                <span className="font-medium text-slate-800">
                  <UnknownValue value={employment.dateOfJoining} />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Probation Status</span>
                <span className="font-medium text-slate-800">
                  <UnknownValue value={employment.probationStatus} />
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Organisation Structure</h3>
              </div>
              <DataBadge type="Fact" size="sm" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Department</span>
                <span className="font-semibold text-slate-800">
                  <UnknownValue value={organisation.department} />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Division</span>
                <span className="font-medium text-slate-800">
                  <UnknownValue value={organisation.division} fallback="General" />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Reporting Manager</span>
                <span className="font-semibold text-slate-800">
                  <UnknownValue value={organisation.reportingManagerName} />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Manager Email</span>
                <span className="font-medium text-slate-800 font-mono text-[11px]">
                  <UnknownValue value={organisation.reportingManagerEmail} />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Skip-Level / Secondary</span>
                <span className="font-medium text-slate-800">
                  <UnknownValue value={organisation.secondaryManagerName} fallback="None recorded" />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Tenant Portal ID</span>
                <span className="font-medium text-slate-800 font-mono text-[11px]">
                  60076299713 (Zoho People IN)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Performance & Goals */}
      {(activeTab === 'all' || activeTab === 'performance') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Performance Assessment</h3>
              </div>
              <DataBadge type="Fact" size="sm" />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-purple-50/50 border border-purple-100">
                <div>
                  <span className="text-xs text-purple-900 font-semibold block">
                    Current Review Rating ({performance.currentReviewPeriod || 'Current'})
                  </span>
                  <span className="text-sm font-bold text-purple-950 mt-0.5 block">
                    <UnknownValue value={performance.overallRating} fallback="Review rating unrecorded" />
                  </span>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-purple-200 text-purple-800">
                  {performance.reviewStatus || 'Recorded'}
                </span>
              </div>

              {performance.strengths && performance.strengths.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
                    Evidenced Strengths
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {performance.strengths.map((str, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 text-slate-800 font-medium">
                        {str}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {performance.developmentAreas && performance.developmentAreas.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
                    Development Priorities
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {performance.developmentAreas.map((dev, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg text-xs bg-amber-50 text-amber-900 border border-amber-200 font-medium">
                        {dev}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Goals */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Goals & OKRs</h3>
              </div>
              <DataBadge type="Fact" size="sm" />
            </div>

            {goals.items && goals.items.length > 0 ? (
              <div className="space-y-3">
                {goals.items.map(goal => (
                  <div key={goal.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{goal.title}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">
                        {goal.status || 'Active'}
                      </span>
                    </div>
                    {goal.progress !== undefined && (
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-sky-600 h-1.5 rounded-full"
                          style={{ width: `${goal.progress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400 text-xs italic">
                No active OKRs or goals recorded in Zoho People.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Attendance & Leave */}
      {(activeTab === 'all' || activeTab === 'attendance') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-sky-600" />
                <h3 className="text-sm font-bold text-slate-900">Attendance Intelligence</h3>
              </div>
              <DataBadge type="Calculation" size="sm" />
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Evaluation Window</span>
                <span className="font-semibold text-slate-800">
                  <UnknownValue value={attendance.summaryPeriod} fallback="Recent Cycle" />
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Attendance Rate</span>
                <span className="font-bold text-slate-900 text-sm">
                  {attendance.attendancePercentage > 0 ? `${attendance.attendancePercentage}%` : 'Unknown'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Present Days</span>
                <span className="font-medium text-slate-800">{attendance.presentDays}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Absent Days</span>
                <span className="font-medium text-slate-800">{attendance.absentDays}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Late Arrivals</span>
                <span className="font-medium text-slate-800">{attendance.lateDays}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Total Shift Days</span>
                <span className="font-medium text-slate-800">{attendance.totalWorkingDays}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Palmtree className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">Leave Entitlement & Usage</h3>
              </div>
              <DataBadge type="Fact" size="sm" />
            </div>

            <div className="space-y-3">
              {leave.balance && leave.balance.length > 0 ? (
                leave.balance.map((b, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 text-xs">
                    <span className="font-medium text-slate-800">{b.type || b.Leave_Type || b.name || 'Leave'}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">Taken: <strong className="text-slate-700">{b.taken || b.Taken_Count || 0}</strong></span>
                      <span className="px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800">
                        {b.balance || b.Balance_Count || 0} remaining
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic py-4">No active leave balances synced.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Skills & Learning */}
      {(activeTab === 'all' || activeTab === 'skills' || activeTab === 'learning') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-900">Documented Skills</h3>
              </div>
              <DataBadge type="Fact" size="sm" />
            </div>

            {skills.technical && skills.technical.length > 0 ? (
              <div className="space-y-2">
                {skills.technical.map((sk, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 text-xs">
                    <span className="font-medium text-slate-800">{sk.name}</span>
                    <span className="font-mono text-slate-500">{sk.proficiency ? `${sk.proficiency}/5` : 'Recorded'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic py-4">No skills recorded in Zoho People profile.</div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Learning & Training</h3>
              </div>
              <DataBadge type="Fact" size="sm" />
            </div>

            {learning.completedCourses && learning.completedCourses.length > 0 ? (
              <div className="space-y-2 text-xs">
                {learning.completedCourses.map(c => (
                  <div key={c.id} className="p-2 rounded-lg bg-slate-50 flex items-center justify-between">
                    <span className="font-medium text-slate-800">{c.title}</span>
                    <span className="text-slate-400 text-[11px]">{c.completedDate || 'Completed'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic py-4">No completed training courses recorded.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Employee360Dashboard;
