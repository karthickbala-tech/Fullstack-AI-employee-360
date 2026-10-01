import React from 'react';
import { Employee360Data } from '../../types/employee360';
import { UnknownValue } from '../../components/shared/UnknownValue';
import {
  Building2,
  MapPin,
  Calendar,
  Clock,
  UserCheck,
  RefreshCw,
  ChevronDown,
  AlertCircle
} from 'lucide-react';

interface EmployeeHeaderProps {
  data: Employee360Data;
  onRefresh: () => void;
  onSelectEmployeeClick: () => void;
  isRefreshing?: boolean;
}

export const EmployeeHeader: React.FC<EmployeeHeaderProps> = ({
  data,
  onRefresh,
  onSelectEmployeeClick,
  isRefreshing = false
}) => {
  const {
    employee,
    employment,
    organisation,
    deterministicMetrics,
    isLiveZohoData,
    liveSyncStatus
  } = data;

  const initials = (employee.fullName || employee.employeeId || 'EM')
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tenureText = deterministicMetrics?.tenure?.formatted || 'Unknown';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Top Banner with Zoho People Integration Context */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xs">
          <span className="flex h-2.5 w-2.5 relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                isLiveZohoData ? 'bg-emerald-400' : 'bg-amber-400'
              } opacity-75`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isLiveZohoData ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          </span>

          <span className="font-semibold uppercase tracking-wider text-slate-300">
            Zoho People Web Tab
          </span>

          <span className="text-slate-500">|</span>

          <span className="text-slate-300">
            Sync Status:{' '}
            <strong className="text-white font-mono">
              {liveSyncStatus ||
                (isLiveZohoData ? 'SYNCED' : 'UNSYNCED')}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={onSelectEmployeeClick}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer border border-white/15"
          >
            <span>
              Select Employee ({employee.employeeId})
            </span>

            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh canonical Employee 360 data from backend"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isRefreshing ? 'animate-spin' : ''
              }`}
            />

            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Main Header Profile */}
      <div className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {employee.avatarUrl ? (
              <img
                src={employee.avatarUrl}
                alt={employee.fullName || 'Employee'}
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-sky-100 shadow-xs"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xl ring-2 ring-sky-100 shadow-xs">
                {initials}
              </div>
            )}

            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  <UnknownValue
                    value={employee.fullName}
                    fallback={employee.employeeId}
                  />
                </h1>

                <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  {employee.employeeId}
                </span>

                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    employment.employmentStatus === 'Active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <UnknownValue
                    value={employment.employmentStatus}
                    fallback="Status Unknown"
                  />
                </span>
              </div>

              <div className="text-sm font-medium text-slate-600 mt-1">
                <UnknownValue
                  value={employment.jobTitle}
                  fallback="Designation unassigned in Zoho People"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />

                  <span>
                    <UnknownValue
                      value={organisation.department}
                      fallback="Department unassigned"
                    />
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />

                  <span>
                    <UnknownValue
                      value={employment.workLocation}
                      fallback="Work location unassigned"
                    />
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-slate-400" />

                  <span>
                    Manager:{' '}
                    <strong className="text-slate-700 font-medium">
                      <UnknownValue
                        value={organisation.reportingManagerName}
                        fallback="Not assigned"
                      />
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics from Backend */}
          <div className="flex flex-wrap md:flex-nowrap items-center gap-4 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 min-w-[130px]">
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                <Clock className="w-3 h-3 text-sky-600" />
                <span>Tenure</span>
              </div>

              <div className="text-sm font-semibold text-slate-800 mt-1">
                <UnknownValue
                  value={tenureText}
                  fallback="Unknown"
                />
              </div>

              <span className="text-[10px] text-slate-400 block mt-0.5">
                Deterministic Code
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 min-w-[130px]">
              <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                <Calendar className="w-3 h-3 text-sky-600" />
                <span>Date Joined</span>
              </div>

              <div className="text-sm font-semibold text-slate-800 mt-1">
                <UnknownValue
                  value={employment.dateOfJoining}
                  fallback="Not in source record"
                />
              </div>

              <span className="text-[10px] text-slate-400 block mt-0.5">
                Zoho System of Record
              </span>
            </div>
          </div>
        </div>

        {/* Backend Limitations notice if present */}
        {data.limitations && data.limitations.length > 0 && (
          <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />

            <div className="space-y-0.5">
              <span className="font-semibold block">
                Backend Data Notice:
              </span>

              <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                {data.limitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeHeader;