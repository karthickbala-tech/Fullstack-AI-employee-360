import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, friendlyApiError } from './api/apiClient';
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
  askChatQuestion,
  fetchDirectoryAndStatus,
  fetchEmployee360Bundle,
  describeAccessFailure,
  fetchLiveAccess,
  getEmployee360Provider,
} from './services/employee360DataProvider';
import { initWebTabSdk } from './services/webTabIdentity';
import { EMPTY_MENTIONS, buildMentionable } from './services/mentions';
import type { ChatViewer } from './components/AIChatView';
import type {
  ActivePage,
  AskMentions,
  Mentionable,
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

// One conversation list per signed-in user: the chat is not tied to the Dashboard employee.
const CHAT_KEY = 'chat';
const DEMO_VIEWER: ChatViewer = { employeeId: 'DEMO001', name: 'Sarah Anderson', detail: 'Demo organization' };
const LOADING_VIEWER: ChatViewer = { employeeId: null, name: 'Checking your access…', detail: 'Live Zoho People' };

const SCOPE_DETAIL: Record<Mentionable['allScope'], string> = {
  organization: 'Organization access',
  team: 'You and your team',
  self: 'Your own record',
};

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

  // The signed-in user (chat sidebar) and whom they may mention (@ / #) in the chat
  const [viewer, setViewer] = useState<ChatViewer>(
    DEFAULT_DATA_SOURCE_MODE === 'mock' ? DEMO_VIEWER : LOADING_VIEWER
  );
  const [mentionable, setMentionable] = useState<Mentionable | null>(
    DEFAULT_DATA_SOURCE_MODE === 'mock' ? buildMentionable(MOCK_EMPLOYEES_DIRECTORY, 'organization') : null
  );
  // The viewer's own Employee 360 for the chat's "Signed in as" card and grounded-context
  // panel, loaded on its own so it does not depend on whom the Dashboard is showing.
  const [viewerRecord, setViewerRecord] = useState<{ id: string; mode: DataSourceMode; data: Employee360Data } | null>(null);

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

  // Conversations: one list for the signed-in user. It opens on a fresh empty chat (so the
  // welcome banner and prompts show first); the seeded demo conversations stay in history.
  const [threadsByEmployee, setThreadsByEmployee] = useState<
    Record<string, ConversationThread[]>
  >(() => ({
    [CHAT_KEY]: [
      {
        id: `conv_${CHAT_KEY}_new`,
        employeeId: CHAT_KEY,
        title: 'New Chat',
        updatedAt: new Date().toISOString(),
        messages: [],
      },
      ...(MOCK_INITIAL_CONVERSATIONS.DEMO001 || []),
    ],
  }));
  const [activeThreadIdByEmployee, setActiveThreadIdByEmployee] = useState<
    Record<string, string>
  >({});
  const [isAsking, setIsAsking] = useState<boolean>(false);
  const [askError, setAskError] = useState<string | null>(null);
  // Synchronous in-flight guard: `isAsking` state only updates on the next render, and the
  // dashboard ask buttons do not check it, so this ensures one /ask POST at a time.
  const askInFlightRef = useRef<boolean>(false);
  // The answer to a spoken question is read aloud once; the chat clears this after playing it
  const [autoSpeakMessageId, setAutoSpeakMessageId] = useState<string | null>(null);

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
        const { access, state, employees: allowed, defaultEmployeeId, status, notice } = await fetchLiveAccess();
        if (cancelled) return;
        // Whom the chat may mention: the backend's list when signed in; in Development
        // without sign-in, everyone (every route is unrestricted there too).
        const allScope: Mentionable['allScope'] =
          state === 'development' || access.scope === 'all'
            ? 'organization'
            : access.canAnalyzeTeam
              ? 'team'
              : 'self';
        setMentionable(access.mentionable || buildMentionable(allowed, allScope));
        if (state === 'development') {
          setViewer({ employeeId: null, name: 'Development', detail: 'Sign-in not verified · all employees' });
        } else {
          setViewer({
            employeeId: access.employeeId,
            name: access.displayName || access.email || 'Signed-in user',
            detail: access.employeeId ? SCOPE_DETAIL[allScope] : 'No matching employee record',
          });
        }
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
        setViewer({ employeeId: null, name: 'Not signed in', detail: 'Identity could not be verified' });
        setMentionable(null);
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

  // Load the viewer's own record when the Dashboard is showing someone else (one /360
  // call: no summary or insights, so no AI cost).
  useEffect(() => {
    const id = viewer.employeeId;
    if (!id || id === selectedEmployeeId) return;
    if (viewerRecord && viewerRecord.id === id && viewerRecord.mode === dataSourceMode) return;
    let cancelled = false;
    getEmployee360Provider(dataSourceMode)
      .getEmployee360(id)
      .then((data) => {
        if (!cancelled) setViewerRecord({ id, mode: dataSourceMode, data });
      })
      .catch(() => {
        // The card shows "Not loaded"; the chat itself does not depend on this record.
      });
    return () => {
      cancelled = true;
    };
  }, [viewer.employeeId, selectedEmployeeId, dataSourceMode, viewerRecord]);

  const viewerCanonical: Employee360Data | null =
    viewer.employeeId && viewer.employeeId === selectedEmployeeId
      ? canonical
      : viewerRecord && viewerRecord.id === viewer.employeeId && viewerRecord.mode === dataSourceMode
        ? viewerRecord.data
        : null;

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

  // The chat thread list (one per signed-in user)
  const currentThreads: ConversationThread[] =
    threadsByEmployee[CHAT_KEY] || [
      {
        id: `conv_${CHAT_KEY}_default`,
        employeeId: CHAT_KEY,
        title: 'New Chat',
        updatedAt: new Date().toISOString(),
        messages: [],
      },
    ];

  const activeThreadId =
    activeThreadIdByEmployee[CHAT_KEY] || currentThreads[0].id;

  const handleSelectThread = (threadId: string) => {
    setActiveThreadIdByEmployee((prev) => ({
      ...prev,
      [CHAT_KEY]: threadId,
    }));
  };

  const handleNewThread = () => {
    const newId = `conv_${CHAT_KEY}_${Date.now()}`;
    const newThread: ConversationThread = {
      id: newId,
      employeeId: CHAT_KEY,
      title: `New Analysis · ${new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
      updatedAt: new Date().toISOString(),
      messages: [],
    };

    setThreadsByEmployee((prev) => ({
      ...prev,
      [CHAT_KEY]: [newThread, ...(prev[CHAT_KEY] || [])],
    }));
    setActiveThreadIdByEmployee((prev) => ({
      ...prev,
      [CHAT_KEY]: newId,
    }));
    setAskError(null);
  };

  const handleClearCurrentThread = () => {
    setThreadsByEmployee((prev) => {
      const existing = prev[CHAT_KEY] || currentThreads;
      const updated = existing.map((t) =>
        t.id === activeThreadId ? { ...t, messages: [] } : t
      );
      return {
        ...prev,
        [CHAT_KEY]: updated,
      };
    });
    setAskError(null);
  };

  const handleSendQuestion = useCallback(
    async (
      question: string,
      mentions: AskMentions = EMPTY_MENTIONS,
      options: { language?: string; viaVoice?: boolean } = {}
    ) => {
      const cleanQuestion = question.trim();
      if (!cleanQuestion || askInFlightRef.current) return;

      askInFlightRef.current = true;
      setAskError(null);
      setIsAsking(true);

      // Recent turns of this thread let the backend resolve follow-ups
      // ("what about last month?"); the backend bounds and validates them.
      const priorTurns: AskHistoryTurn[] = (
        (threadsByEmployee[CHAT_KEY] || []).find((thread) => thread.id === activeThreadId)
          ?.messages || []
      )
        .slice(-6)
        .map((message) => ({ role: message.role, content: message.content }));

      const userMsg: ChatMessage = {
        id: `msg_u_${Date.now()}`,
        role: 'user',
        timestamp: new Date().toISOString(),
        employeeId: CHAT_KEY,
        content: cleanQuestion,
        ...(options.language ? { language: options.language } : {}),
        ...(options.viaVoice ? { viaVoice: true } : {}),
      };

      // Append user question immediately
      setThreadsByEmployee((prev) => {
        const list = prev[CHAT_KEY] || [
          {
            id: activeThreadId,
            employeeId: CHAT_KEY,
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
          [CHAT_KEY]: updatedList,
        };
      });

      try {
        const aiResult = await askChatQuestion(
          cleanQuestion,
          dataSourceMode,
          priorTurns,
          mentions,
          options.language
        );

        const assistantMsg: ChatMessage = {
          id: `msg_a_${Date.now()}`,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          employeeId: CHAT_KEY,
          content: aiResult.answer,
          ...(aiResult.language ? { language: aiResult.language } : {}),
          responseMeta: {
            route: aiResult.route,
            scopeLabel: aiResult.scope?.label,
            type: aiResult.type,
            confidence: aiResult.confidence,
            evidence: aiResult.evidence || [],
            limitations: aiResult.limitations || [],
          },
        };

        setThreadsByEmployee((prev) => {
          const list = prev[CHAT_KEY] || [];
          return {
            ...prev,
            [CHAT_KEY]: list.map((thread) =>
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
        if (options.viaVoice) setAutoSpeakMessageId(assistantMsg.id);
      } catch (err) {
        setAskError(friendlyApiError(err, "Sorry, I couldn't get an answer just now. Please try again."));
      } finally {
        askInFlightRef.current = false;
        setIsAsking(false);
      }
    },
    [activeThreadId, dataSourceMode, threadsByEmployee]
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
      setViewer(DEMO_VIEWER);
      setMentionable(buildMentionable(MOCK_EMPLOYEES_DIRECTORY, 'organization'));
    } else {
      // The live employee, viewer and mention lists come from GET /v1/me, never assumed.
      setEmployees([]);
      setSelectedEmployeeId('');
      setViewer(LOADING_VIEWER);
      setMentionable(null);
    }
  };

  // Dashboard questions are about the employee shown there: an @mention unless it is the viewer.
  const handleAskFromDashboard = (promptText: string) => {
    setActivePage('ai');
    const shown = employees.find((e) => e.employeeId === selectedEmployeeId);
    if (!selectedEmployeeId || selectedEmployeeId === viewer.employeeId || !shown) {
      void handleSendQuestion(promptText);
      return;
    }
    void handleSendQuestion(`@${shown.fullName || shown.employeeId} ${promptText}`, {
      ...EMPTY_MENTIONS,
      employeeIds: [selectedEmployeeId],
    });
  };

  return (
    <div className={`app-viewport-frame ${activePage === 'ai' ? 'is-ai-page' : 'is-dashboard-page'}`}>
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
        viewer={viewer}
      />

      {activePage === 'ai' ? (
        <AIChatView
          viewer={viewer}
          canonical={viewerCanonical}
          mentionable={mentionable}
          threads={currentThreads}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
          onClearCurrentThread={handleClearCurrentThread}
          onSendQuestion={handleSendQuestion}
          autoSpeakMessageId={autoSpeakMessageId}
          onAutoSpeakHandled={() => setAutoSpeakMessageId(null)}
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
