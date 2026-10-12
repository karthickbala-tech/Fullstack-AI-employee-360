import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from './api/apiClient';
import { AIChatView } from './components/AIChatView';
import { DashboardView } from './components/DashboardView';
import { TopNavBar } from './components/TopNavBar';
import { DEFAULT_DATA_SOURCE_MODE } from './config/apiConfig';
import {
  MOCK_EMPLOYEES_DIRECTORY,
  MOCK_EMPLOYEE_360_MAP,
  MOCK_INITIAL_CONVERSATIONS,
  MOCK_INSIGHTS_MAP,
  MOCK_SUMMARIES_MAP,
  MOCK_ZOHO_STATUS,
} from './mock/employee360MockData';
import {
  askEmployeeQuestion,
  fetchDirectoryAndStatus,
  fetchEmployee360Bundle,
  describeAccessFailure,
  fetchLiveAccess,
} from './services/employee360DataProvider';
import { initWebTabSdk } from './services/webTabIdentity';
import type {
  ActivePage,
  AskHistoryTurn,
  ChatMessage,
  ConversationThread,
  DataSourceMode,
  Employee360Data,
  EmployeeDirectoryEntry,
  EmployeeInsightsResponse,
  EmployeeSummaryResponse,
  EmployeeTimelineResponse,
  ZohoConnectionStatus,
} from './types/employee360';
import './App.css';

export function App() {
  // Primary product experience is AI ('ai' is default active page)
  const [activePage, setActivePage] = useState<ActivePage>('ai');
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>(
    DEFAULT_DATA_SOURCE_MODE
  );

  // Employee directory & connection state (demo data only when starting in Demo mode)
  const [employees, setEmployees] = useState<EmployeeDirectoryEntry[]>(
    DEFAULT_DATA_SOURCE_MODE === 'mock' ? MOCK_EMPLOYEES_DIRECTORY : []
  );
  const [connectionStatus, setConnectionStatus] =
    useState<ZohoConnectionStatus | null>(DEFAULT_DATA_SOURCE_MODE === 'mock' ? MOCK_ZOHO_STATUS : null);
  // Live mode starts with no employee until GET /v1/me says whom this user may see.
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    DEFAULT_DATA_SOURCE_MODE === 'mock' ? 'DEMO001' : ''
  );

  // Employee 360 canonical bundle state (pre-seeded with DEMO001 when in mock mode)
  const [canonical, setCanonical] = useState<Employee360Data | null>(
    DEFAULT_DATA_SOURCE_MODE === 'mock' ? MOCK_EMPLOYEE_360_MAP.DEMO001 : null
  );
  const [summary, setSummary] = useState<EmployeeSummaryResponse | null>(
    DEFAULT_DATA_SOURCE_MODE === 'mock' ? MOCK_SUMMARIES_MAP.DEMO001 : null
  );
  const [insights, setInsights] = useState<EmployeeInsightsResponse | null>(
    DEFAULT_DATA_SOURCE_MODE === 'mock' ? MOCK_INSIGHTS_MAP.DEMO001 : null
  );
  const [timeline, setTimeline] = useState<EmployeeTimelineResponse | null>(
    DEFAULT_DATA_SOURCE_MODE === 'mock'
      ? {
          employeeId: 'DEMO001',
          events: MOCK_EMPLOYEE_360_MAP.DEMO001.timeline || [],
          totalEvents: (MOCK_EMPLOYEE_360_MAP.DEMO001.timeline || []).length,
        }
      : null
  );
  const [isLoadingBundle, setIsLoadingBundle] = useState<boolean>(
    DEFAULT_DATA_SOURCE_MODE === 'live'
  );
  const [bundleError, setBundleError] = useState<string | null>(null);

  // Conversational AI state per employee. Each demo employee opens on a fresh empty chat
  // (so the welcome banner + prompts show first); the seeded example conversations stay in history.
  // No active thread is preselected, so each employee falls back to that first (empty) thread.
  const [threadsByEmployee, setThreadsByEmployee] = useState<
    Record<string, ConversationThread[]>
  >(() =>
    Object.fromEntries(
      Object.entries(MOCK_INITIAL_CONVERSATIONS).map(([empId, threads]) => [
        empId,
        [
          {
            id: `conv_${empId}_new`,
            employeeId: empId,
            title: 'New Chat',
            updatedAt: new Date().toISOString(),
            messages: [],
          },
          ...threads,
        ],
      ])
    )
  );
  const [activeThreadIdByEmployee, setActiveThreadIdByEmployee] = useState<
    Record<string, string>
  >({});
  const [isAsking, setIsAsking] = useState<boolean>(false);
  const [askError, setAskError] = useState<string | null>(null);
  // Synchronous in-flight guard: `isAsking` state only updates on the next render, and the
  // dashboard ask buttons do not check it, so this ensures one /ask POST at a time.
  const askInFlightRef = useRef<boolean>(false);

  // Every page switch (AI Chat ↔ Dashboard) starts at the top instead of inheriting the
  // previous page's window scroll position
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activePage]);

  // Initialize the Zoho People Widget SDK once on Web Tab startup (no-op outside Zoho People)
  useEffect(() => {
    void initWebTabSdk();
  }, []);

  // Synchronize directory & connection status asynchronously
  useEffect(() => {
    let cancelled = false;

    // Live mode: the backend's GET /v1/me decides which employees may be shown;
    // the Web Tab opens on the caller's own record when the backend identifies one.
    async function syncLiveAccess() {
      try {
        const { employees: allowed, defaultEmployeeId, status, notice } = await fetchLiveAccess();
        if (cancelled) return;
        setConnectionStatus(status ? { ...status, message: notice || status.message } : null);
        setEmployees(allowed);
        const nextId = allowed.some((e) => e.employeeId === defaultEmployeeId)
          ? (defaultEmployeeId as string)
          : allowed[0]?.employeeId || '';
        setSelectedEmployeeId((prevId) =>
          allowed.some((e) => e.employeeId.toUpperCase() === prevId.toUpperCase()) ? prevId : nextId
        );
        if (allowed.length === 0) {
          const message = notice || 'No Employee 360 records are available for your access.';
          setIsLoadingBundle(false);
          setBundleError(message);
          setAskError(message);
        }
      } catch (err) {
        if (cancelled) return;
        // No mock or directory fallback: the failure is shown as it is.
        const { message } = describeAccessFailure(err);
        setConnectionStatus({
          connected: false,
          connectionName: 'zohopeople_employee360_v2',
          dataCenter: 'in',
          portalId: '60076299713',
          organizationName: 'VSK HR Solution Private Limited',
          message,
        });
        setEmployees([]);
        setSelectedEmployeeId('');
        setIsLoadingBundle(false);
        setBundleError(message);
        setAskError(message);
      }
    }

    async function syncDirectory() {
      if (dataSourceMode === 'live') {
        await syncLiveAccess();
        return;
      }
      try {
        const { status, directory } = await fetchDirectoryAndStatus(dataSourceMode);
        if (cancelled) return;
        setConnectionStatus(status);
        if (directory.employees && directory.employees.length > 0) {
          setEmployees(directory.employees);
          setSelectedEmployeeId((prevId) => {
            const exists = directory.employees.some(
              (e) => e.employeeId.toUpperCase() === prevId.toUpperCase()
            );
            return exists ? prevId : directory.employees[0].employeeId;
          });
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to verify Zoho People directory connection.';
        setConnectionStatus({
          connected: false,
          connectionName: 'zohopeople_employee360_v2',
          dataCenter: 'in',
          portalId: '60076299713',
          organizationName: 'VSK HR Solution Private Limited',
          message,
        });
      }
    }

    void syncDirectory();
    return () => {
      cancelled = true;
    };
  }, [dataSourceMode]);

  // Synchronize Employee 360 bundle asynchronously
  useEffect(() => {
    let cancelled = false;

    async function syncBundle() {
      if (!selectedEmployeeId.trim()) return;
      try {
        const bundle = await fetchEmployee360Bundle(
          selectedEmployeeId,
          dataSourceMode
        );
        if (cancelled) return;
        setCanonical(bundle.canonical);
        setSummary(bundle.summary);
        setInsights(bundle.insights);
        setTimeline(bundle.timeline);
        setBundleError(null);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ApiClientError
            ? `[${err.code || err.kind.toUpperCase()}] ${err.message}`
            : 'Failed to retrieve Employee 360 data from the backend API.';
        setBundleError(msg);
        setCanonical(null);
        setSummary(null);
        setInsights(null);
        setTimeline(null);
      } finally {
        if (!cancelled) {
          setIsLoadingBundle(false);
        }
      }
    }

    void syncBundle();
    return () => {
      cancelled = true;
    };
  }, [selectedEmployeeId, dataSourceMode]);

  // Manual refresh handler triggered by user click
  const handleManualRefresh = useCallback(async () => {
    if (!selectedEmployeeId.trim()) return;
    setIsLoadingBundle(true);
    setBundleError(null);
    try {
      const bundle = await fetchEmployee360Bundle(
        selectedEmployeeId,
        dataSourceMode
      );
      setCanonical(bundle.canonical);
      setSummary(bundle.summary);
      setInsights(bundle.insights);
      setTimeline(bundle.timeline);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? `[${err.code || err.kind.toUpperCase()}] ${err.message}`
          : 'Failed to retrieve Employee 360 data from the backend API.';
      setBundleError(msg);
      setCanonical(null);
      setSummary(null);
      setInsights(null);
      setTimeline(null);
    } finally {
      setIsLoadingBundle(false);
    }
  }, [selectedEmployeeId, dataSourceMode]);

  // Ensure an initial thread shell exists for any newly selected employee
  const currentThreads: ConversationThread[] =
    threadsByEmployee[selectedEmployeeId] || [
      {
        id: `conv_${selectedEmployeeId}_default`,
        employeeId: selectedEmployeeId,
        title: `Employee 360 Chat — ${selectedEmployeeId}`,
        updatedAt: new Date().toISOString(),
        messages: [],
      },
    ];

  const activeThreadId =
    activeThreadIdByEmployee[selectedEmployeeId] || currentThreads[0].id;

  const handleSelectThread = (threadId: string) => {
    setActiveThreadIdByEmployee((prev) => ({
      ...prev,
      [selectedEmployeeId]: threadId,
    }));
  };

  const handleNewThread = () => {
    const newId = `conv_${selectedEmployeeId}_${Date.now()}`;
    const newThread: ConversationThread = {
      id: newId,
      employeeId: selectedEmployeeId,
      title: `New Analysis · ${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    setThreadsByEmployee((prev) => ({
      ...prev,
      [selectedEmployeeId]: [newThread, ...(prev[selectedEmployeeId] || [])],
    }));
    setActiveThreadIdByEmployee((prev) => ({
      ...prev,
      [selectedEmployeeId]: newId,
    }));
    setAskError(null);
  };

  const handleClearCurrentThread = () => {
    setThreadsByEmployee((prev) => {
      const existing = prev[selectedEmployeeId] || currentThreads;
      const updated = existing.map((t) =>
        t.id === activeThreadId ? { ...t, messages: [] } : t
      );
      return {
        ...prev,
        [selectedEmployeeId]: updated,
      };
    });
    setAskError(null);
  };

  const handleSendQuestion = useCallback(
    async (question: string) => {
      const cleanQuestion = question.trim();
      if (!cleanQuestion || askInFlightRef.current) return;
      if (!selectedEmployeeId.trim()) {
        setAskError('No employee is available for your access, so Ask AI cannot answer yet.');
        return;
      }

      askInFlightRef.current = true;
      setAskError(null);
      setIsAsking(true);

      // Recent turns of this thread let the backend resolve follow-ups
      // ("what about last month?"); the backend bounds and validates them.
      const priorTurns: AskHistoryTurn[] = (
        (threadsByEmployee[selectedEmployeeId] || []).find((thread) => thread.id === activeThreadId)
          ?.messages || []
      )
        .slice(-6)
        .map((message) => ({ role: message.role, content: message.content }));

      const userMsg: ChatMessage = {
        id: `msg_u_${Date.now()}`,
        role: 'user',
        timestamp: new Date().toISOString(),
        employeeId: selectedEmployeeId,
        content: cleanQuestion,
      };

      // Append user question immediately
      setThreadsByEmployee((prev) => {
        const list = prev[selectedEmployeeId] || [
          {
            id: activeThreadId,
            employeeId: selectedEmployeeId,
            title: cleanQuestion.slice(0, 42),
            updatedAt: new Date().toISOString(),
            messages: [],
          },
        ];

        const updatedList = list.map((thread) => {
          if (thread.id !== activeThreadId) return thread;
          const nextTitle =
            thread.messages.length === 0
              ? cleanQuestion.slice(0, 42)
              : thread.title;
          return {
            ...thread,
            title: nextTitle,
            updatedAt: new Date().toISOString(),
            messages: [...thread.messages, userMsg],
          };
        });

        return {
          ...prev,
          [selectedEmployeeId]: updatedList,
        };
      });

      try {
        const aiResult = await askEmployeeQuestion(
          selectedEmployeeId,
          cleanQuestion,
          dataSourceMode,
          priorTurns
        );

        const assistantMsg: ChatMessage = {
          id: `msg_a_${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          employeeId: selectedEmployeeId,
          content: aiResult.answer,
          responseMeta: {
            route: aiResult.route,
            type: aiResult.type,
            confidence: aiResult.confidence,
            evidence: aiResult.evidence || [],
            limitations: aiResult.limitations || [],
          },
        };

        setThreadsByEmployee((prev) => {
          const list = prev[selectedEmployeeId] || [];
          return {
            ...prev,
            [selectedEmployeeId]: list.map((thread) =>
              thread.id === activeThreadId
                ? {
                    ...thread,
                    updatedAt: new Date().toISOString(),
                    messages: [...thread.messages, assistantMsg],
                  }
                : thread
            ),
          };
        });
      } catch (err) {
        const message =
          err instanceof ApiClientError
            ? `[${err.code || err.kind.toUpperCase()}] ${err.message}`
            : 'Unable to complete Ask AI request against the backend.';
        setAskError(message);
      } finally {
        askInFlightRef.current = false;
        setIsAsking(false);
      }
    },
    [selectedEmployeeId, activeThreadId, dataSourceMode, threadsByEmployee]
  );

  const handleSelectEmployee = (empId: string) => {
    setIsLoadingBundle(true);
    setBundleError(null);
    setAskError(null);
    setSelectedEmployeeId(empId);
  };

  const handleToggleDataSourceMode = (nextMode: DataSourceMode) => {
    if (nextMode === dataSourceMode) return;
    setIsLoadingBundle(true);
    setDataSourceMode(nextMode);
    setAskError(null);
    setBundleError(null);
    if (nextMode === 'mock') {
      setEmployees(MOCK_EMPLOYEES_DIRECTORY);
      setSelectedEmployeeId('DEMO001');
    } else {
      // The live employee is chosen from GET /v1/me, never assumed.
      setEmployees([]);
      setSelectedEmployeeId('');
    }
  };

  const handleAskFromDashboard = (promptText: string) => {
    setActivePage('ai');
    void handleSendQuestion(promptText);
  };

  return (
    <div className="app-viewport-frame">
      <TopNavBar
        activePage={activePage}
        onSelectPage={setActivePage}
        employees={employees}
        selectedEmployeeId={selectedEmployeeId}
        onSelectEmployee={handleSelectEmployee}
        dataSourceMode={dataSourceMode}
        onToggleDataSourceMode={handleToggleDataSourceMode}
        connectionStatus={connectionStatus}
        isLoadingData={isLoadingBundle}
        onRefreshData={() => void handleManualRefresh()}
      />

      {activePage === 'ai' ? (
        <AIChatView
          employeeId={selectedEmployeeId}
          canonical={canonical}
          threads={currentThreads}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
          onClearCurrentThread={handleClearCurrentThread}
          onSendQuestion={handleSendQuestion}
          isAsking={isAsking}
          askError={askError}
          onClearAskError={() => setAskError(null)}
          onSwitchToDashboard={setActivePage}
          dataSourceMode={dataSourceMode}
        />
      ) : (
        <DashboardView
          employeeId={selectedEmployeeId}
          canonical={canonical}
          summary={summary}
          insights={insights}
          timeline={timeline}
          isLoading={isLoadingBundle}
          error={bundleError}
          onRetry={() => void handleManualRefresh()}
          onAskQuestionFromDashboard={handleAskFromDashboard}
          dataSourceMode={dataSourceMode}
        />
      )}
    </div>
  );
}

export default App;
