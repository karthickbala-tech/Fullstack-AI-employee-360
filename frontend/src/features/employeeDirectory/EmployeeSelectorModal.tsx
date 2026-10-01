import React, { useState, useEffect } from 'react';
import { employeeService } from '../../services/employeeService';
import {
  ZohoDirectoryEmployee,
  ZohoConnectionStatus
} from '../../types/employee360';
import {
  X,
  Search,
  Check,
  RefreshCw,
  Database,
  AlertCircle
} from 'lucide-react';

interface EmployeeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedEmployeeId: string;
  onSelectEmployee: (employeeId: string) => void;
  connectionStatus?: ZohoConnectionStatus | null;
}

export const EmployeeSelectorModal: React.FC<
  EmployeeSelectorModalProps
> = ({
  isOpen,
  onClose,
  selectedEmployeeId,
  onSelectEmployee,
  connectionStatus
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [customId, setCustomId] = useState('');
  const [liveEmployees, setLiveEmployees] = useState<
    ZohoDirectoryEmployee[]
  >([]);
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const fetchLiveEmployees = async () => {
    setIsLoadingLive(true);
    setLiveError(null);

    try {
      const res = await employeeService.getEmployees();
      setLiveEmployees(res.employees || []);
    } catch (err: any) {
      setLiveError(
        err?.message ||
          'Unable to retrieve employee directory from backend.'
      );
    } finally {
      setIsLoadingLive(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLiveEmployees();
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredLive = liveEmployees.filter(employee => {
    if (!normalizedSearch) {
      return true;
    }

    return (
      (employee.fullName || '')
        .toLowerCase()
        .includes(normalizedSearch) ||
      (employee.employeeId || '')
        .toLowerCase()
        .includes(normalizedSearch) ||
      (employee.jobTitle || '')
        .toLowerCase()
        .includes(normalizedSearch)
    );
  });

  const handleDirectLoad = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const employeeId = customId.trim();

    if (!employeeId) {
      return;
    }

    onSelectEmployee(employeeId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Select Employee Subject
            </h3>

            <p className="text-xs text-slate-500">
              Query canonical Employee 360 data via backend API
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close employee selector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Direct ID Form */}
        <div className="p-4 border-b border-slate-100 bg-white">
          <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
            Load by Employee ID
          </label>

          <form
            onSubmit={handleDirectLoad}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Enter Employee ID"
              value={customId}
              onChange={e => setCustomId(e.target.value)}
              className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-sky-500 uppercase"
            />

            <button
              type="submit"
              disabled={!customId.trim()}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer"
            >
              Load 360
            </button>
          </form>

          <p className="mt-2 text-[11px] text-slate-400">
            Access is validated by the backend. The frontend does not
            grant employee access.
          </p>
        </div>

        {/* Live Directory Header */}
        <div className="px-6 py-2.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <Database className="w-3.5 h-3.5 text-sky-600" />

            <span>
              Live Directory (<code>/v1/zoho/employees</code>)
            </span>
          </div>

          <button
            onClick={fetchLiveEmployees}
            disabled={isLoadingLive}
            className="text-[11px] text-sky-700 hover:text-sky-900 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3 h-3 ${
                isLoadingLive ? 'animate-spin' : ''
              }`}
            />

            <span>Refresh</span>
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />

            <input
              type="text"
              placeholder="Search live employees..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoadingLive ? (
            <div className="py-8 text-center text-xs text-slate-500">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-600 mx-auto mb-2" />

              <span>
                Querying backend directory endpoint...
              </span>
            </div>
          ) : liveError ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600" />

                <span>Backend Directory Notice</span>
              </div>

              <p className="text-amber-800">{liveError}</p>

              <p className="text-slate-500 text-[11px]">
                You can enter a specific employee ID above. The
                backend remains authoritative for access.
              </p>
            </div>
          ) : filteredLive.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              {liveEmployees.length === 0
                ? 'No employee records returned by directory endpoint.'
                : 'No employees match the current search.'}
            </div>
          ) : (
            filteredLive.map(employee => {
              const isSelected =
                selectedEmployeeId === employee.employeeId;

              return (
                <div
                  key={employee.employeeId}
                  onClick={() => {
                    onSelectEmployee(employee.employeeId);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'border-sky-500 bg-sky-50/60 shadow-2xs'
                      : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-xs">
                        {employee.fullName || 'Unknown employee'}
                      </span>

                      <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {employee.employeeId}
                      </span>
                    </div>

                    <span className="text-[11px] text-slate-500">
                      {employee.jobTitle || 'Role unrecorded'} •{' '}
                      {employee.department || 'General'}
                    </span>
                  </div>

                  {isSelected && (
                    <div className="p-1 rounded-full bg-sky-600 text-white shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
          <span>
            Active Subject:{' '}
            <strong className="text-slate-900 font-mono">
              {selectedEmployeeId || 'None'}
            </strong>
          </span>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeSelectorModal;