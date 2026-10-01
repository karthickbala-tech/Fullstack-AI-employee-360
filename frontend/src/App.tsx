import React, { useState, useEffect } from 'react';
import { AppShell } from './layouts/AppShell';
import { EmployeeHeader } from './features/employeeOverview/EmployeeHeader';
import { KeyMetricsGrid } from './features/employeeOverview/KeyMetricsGrid';
import { Employee360Dashboard } from './features/employeeOverview/Employee360Dashboard';
import { SummaryPanel } from './features/employeeSummary/SummaryPanel';
import { InsightsPanel } from './features/employeeInsights/InsightsPanel';
import { TimelinePanel } from './features/employeeTimeline/TimelinePanel';
import { EvidencePanel } from './features/employeeEvidence/EvidencePanel';
import { AskAIPanel } from './features/askAI/AskAIPanel';
import { EmployeeSelectorModal } from './features/employeeDirectory/EmployeeSelectorModal';
import { LoadingState } from './components/shared/LoadingState';
import { ErrorState } from './components/shared/ErrorState';
import { employee360Service } from './services/employee360Service';
import { employeeService } from './services/employeeService';
import {
  Employee360Data,
  ZohoConnectionStatus
} from './types/employee360';

export const App: React.FC = () => {
  // Current active employee context.
  // No hardcoded employee ID is used.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // Navigation state
  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);

  // Canonical Employee 360 data from backend
  const [canonicalData, setCanonicalData] = useState<Employee360Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Backend Connection Status
  const [connectionStatus, setConnectionStatus] =
    useState<ZohoConnectionStatus | null>(null);

  // 1. Check backend status and resolve the initial employee
  // strictly through the backend directory endpoint.
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [status, directory] = await Promise.all([
          employeeService.getStatus(),
          employeeService.getEmployees()
        ]);

        setConnectionStatus(status);

        const employees = directory.employees || [];

        if (employees.length === 0) {
          setError(
            'No employee records were returned by the backend directory endpoint.'
          );
          setIsLoading(false);
          return;
        }

        // Use an employee returned by the backend.
        // No employee ID is invented or hardcoded in the frontend.
        setSelectedEmployeeId(employees[0].employeeId);
      } catch (err: any) {
        setConnectionStatus({
          connected: false,
          connectionName: 'zohopeople_employee360_v2',
          message:
            err?.message ||
            'Unable to retrieve backend connection or employee directory status.'
        });

        setError(
          err?.message ||
            'Unable to initialize AI Employee 360 from the backend.'
        );
        setIsLoading(false);
      }
    };

    initialize();
  }, []);

  // 2. Fetch Employee 360 data strictly from backend:
  // GET /v1/employees/{employeeId}/360
  const fetchEmployeeData = async (employeeId: string) => {
    if (!employeeId.trim()) {
      setCanonicalData(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const data = await employee360Service.getEmployee360(employeeId);
      setCanonicalData(data);
    } catch (err: any) {
      setCanonicalData(null);
      setError(
        err?.message ||
          'Failed to retrieve canonical Employee 360 profile from backend.'
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedEmployeeId) {
      fetchEmployeeData(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  const handleRefresh = () => {
    if (!selectedEmployeeId) {
      return;
    }

    setIsRefreshing(true);
    fetchEmployeeData(selectedEmployeeId);
  };

  const handleSelectEmployee = (newId: string) => {
    const normalizedId = newId.trim();

    if (!normalizedId) {
      return;
    }

    setSelectedEmployeeId(normalizedId);
    setCurrentTab('overview');
  };

  const currentEmployeeName =
    canonicalData?.employee?.fullName || selectedEmployeeId || 'No employee selected';

  return (
    <AppShell
      currentTab={currentTab}
      onTabChange={setCurrentTab}
      connectionStatus={connectionStatus}
      onRefreshAll={handleRefresh}
      isRefreshing={isRefreshing}
      selectedEmployeeName={currentEmployeeName}
      selectedEmployeeId={selectedEmployeeId}
      onOpenEmployeeSelector={() => setIsEmployeeModalOpen(true)}
    >
      {/* Main View Display */}

      {!selectedEmployeeId && isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-xs">
          <LoadingState message="Loading employee directory from backend..." />
        </div>
      ) : !selectedEmployeeId && error ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <ErrorState
            title="Employee Directory Unavailable"
            message={error}
            onRetry={() => window.location.reload()}
          />
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-xs">
          <LoadingState
            message={`Loading canonical Employee 360 data for ${selectedEmployeeId}...`}
          />
        </div>
      ) : error && !canonicalData ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <ErrorState
            title="Profile Error"
            message={error}
            onRetry={handleRefresh}
          />
        </div>
      ) : canonicalData ? (
        <div className="space-y-6">
          {/* Header Card */}
          <EmployeeHeader
            data={canonicalData}
            onRefresh={handleRefresh}
            onSelectEmployeeClick={() => setIsEmployeeModalOpen(true)}
            isRefreshing={isRefreshing}
          />

          {/* Tab 1: Overview */}
          {currentTab === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <KeyMetricsGrid
                data={canonicalData}
                onCardClick={tab => setCurrentTab(tab)}
              />

              <SummaryPanel
                employeeId={selectedEmployeeId}
                onOpenEvidence={() => setCurrentTab('evidence')}
              />

              <Employee360Dashboard
                data={canonicalData}
                activeTab="all"
              />
            </div>
          )}

          {/* Tab 2: Summary */}
          {currentTab === 'summary' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <SummaryPanel
                employeeId={selectedEmployeeId}
                onOpenEvidence={() => setCurrentTab('evidence')}
              />

              <KeyMetricsGrid
                data={canonicalData}
                onCardClick={tab => setCurrentTab(tab)}
              />
            </div>
          )}

          {/* Tab 3: Insights */}
          {currentTab === 'insights' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <InsightsPanel employeeId={selectedEmployeeId} />
            </div>
          )}

          {/* Tab 4: Timeline */}
          {currentTab === 'timeline' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <TimelinePanel employeeId={selectedEmployeeId} />
            </div>
          )}

          {/* Tab 5: Evidence */}
          {currentTab === 'evidence' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <EvidencePanel data={canonicalData} />
            </div>
          )}

          {/* Tab 6: Ask AI */}
          {currentTab === 'ask-ai' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <AskAIPanel employeeId={selectedEmployeeId} />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <ErrorState
            title="No Employee Selected"
            message="Select an employee returned by the backend directory."
            onRetry={() => setIsEmployeeModalOpen(true)}
          />
        </div>
      )}

      {/* Employee Selector Modal */}
      <EmployeeSelectorModal
        isOpen={isEmployeeModalOpen}
        onClose={() => setIsEmployeeModalOpen(false)}
        selectedEmployeeId={selectedEmployeeId}
        onSelectEmployee={handleSelectEmployee}
        connectionStatus={connectionStatus}
      />
    </AppShell>
  );
};

export default App;