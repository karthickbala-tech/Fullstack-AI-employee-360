import React, { useEffect, useRef, useState } from 'react';
import aiEmblem from '../assets/ai-emblem.gif';
import { SUGGESTED_AI_PROMPTS } from '../config/apiConfig';
import type {
  ActivePage,
  ChatMessage,
  ConversationThread,
  DataSourceMode,
  Employee360Data,
  EvidenceRecord,
} from '../types/employee360';
import { EmployeeAvatar } from './EmployeeAvatar';
import { ConfidenceLabel, SemanticBadge } from './SemanticBadge';

interface AIChatViewProps {
  employeeId: string;
  canonical: Employee360Data | null;
  threads: ConversationThread[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onClearCurrentThread: () => void;
  onSendQuestion: (question: string) => Promise<void>;
  isAsking: boolean;
  askError: string | null;
  onClearAskError: () => void;
  onSwitchToDashboard: (page: ActivePage) => void;
  dataSourceMode: DataSourceMode;
}

/**
 * Formats structured AI markdown/prose into clean semantic blocks without external dependencies.
 */
function renderFormattedContent(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];

  const formatInline = (line: string): React.ReactNode[] => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="inline-code mono-num">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={idx}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  const flushList = (keyPrefix: string) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-ul`} className="ai-prose-list">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((rawLine, index) => {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      flushList(`line-${index}`);
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList(`line-${index}`);
      elements.push(
        <h4 key={`h4-${index}`} className="ai-prose-h4">
          {formatInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList(`line-${index}`);
      elements.push(
        <h3 key={`h3-${index}`} className="ai-prose-h3">
          {formatInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }

    // "- item", "• item" and Markdown "*   item" (any spacing); "**bold**" is not a bullet.
    const bullet = trimmed.match(/^[-•*]\s+(.*)$/);
    if (bullet) {
      listItems.push(
        <li key={`li-${index}`} className="ai-prose-li">
          {formatInline(bullet[1])}
        </li>
      );
      return;
    }

    flushList(`line-${index}`);
    elements.push(
      <p key={`p-${index}`} className="ai-prose-p">
        {formatInline(trimmed)}
      </p>
    );
  });

  flushList('final');
  return elements;
}

export const AIChatView: React.FC<AIChatViewProps> = ({
  employeeId,
  canonical,
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onClearCurrentThread,
  onSendQuestion,
  isAsking,
  askError,
  onClearAskError,
  onSwitchToDashboard,
}) => {
  const [questionInput, setQuestionInput] = useState('');
  // Manual "View / Hide Prompts" override, scoped to the thread + empty/non-empty state it was made in
  const [promptsOverride, setPromptsOverride] = useState<{ key: string; open: boolean } | null>(
    null
  );
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
  // Subject context card is collapsed by default so conversation history keeps its space
  const [subjectCardOpen, setSubjectCardOpen] = useState(false);
  const [uiDemoState, setUiDemoState] = useState<'normal' | 'loading' | 'empty' | 'error'>(
    'normal'
  );
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Conversation state at mount; auto-scroll is skipped until it changes (see effect below)
  const mountScrollKeyRef = useRef<string | null | undefined>(undefined);

  const activeThread = threads.find((t) => t.id === activeThreadId) || threads[0] || null;
  const messages: ChatMessage[] =
    uiDemoState === 'empty' ? [] : activeThread?.messages || [];
  // Real (not demo-forced) message state of the selected thread, for the UI state chips
  const activeThreadHasMessages = (activeThread?.messages.length ?? 0) > 0;

  // Intro banner + prompts show for an empty conversation and collapse once a question is asked
  const hasMessages = messages.length > 0;
  const promptsKey = `${activeThread?.id ?? 'none'}:${hasMessages}`;
  const showPromptsPanel =
    promptsOverride?.key === promptsKey ? promptsOverride.open : !hasMessages;

  const empName = canonical?.employee?.fullName || `Employee ${employeeId}`;
  const empRole = canonical?.employment?.jobTitle || 'Role Unknown';
  const empDept = canonical?.organisation?.department || 'Department Unknown';
  const empStatus = canonical?.employment?.employmentStatus || 'Unknown';
  const evidenceMap = new Map<string, EvidenceRecord>();
  (canonical?.evidence || []).forEach((ev) => {
    evidenceMap.set(`${ev.domain}.${ev.field}`, ev);
  });

  useEffect(() => {
    // Opening the AI page starts at the top (App resets scroll on navigation); only follow
    // the conversation once it changes after mount
    const scrollKey = `${messages.length}|${isAsking}|${uiDemoState}`;
    if (mountScrollKeyRef.current === undefined) {
      mountScrollKeyRef.current = scrollKey;
      return;
    }
    if (mountScrollKeyRef.current === scrollKey) return;
    mountScrollKeyRef.current = null;
    // Nothing to follow in an empty chat: keep the welcome banner in view
    if (messages.length === 0 && !isAsking && uiDemoState !== 'loading') return;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [messages.length, isAsking, uiDemoState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = questionInput.trim();
    if (!trimmed || isAsking) return;
    setUiDemoState('normal');
    setQuestionInput('');
    setPromptsOverride(null);
    await onSendQuestion(trimmed);
  };

  const handleSuggestedPromptClick = async (promptText: string) => {
    if (isAsking) return;
    setUiDemoState('normal');
    setPromptsOverride(null);
    await onSendQuestion(promptText);
  };

  const effectiveLoading = isAsking || uiDemoState === 'loading';
  const effectiveError =
    uiDemoState === 'error'
      ? 'Simulated Backend Error: Unable to complete POST /v1/employees/' +
        employeeId +
        '/ask. Upstream Zoho People or Gemini provider returned a transient timeout.'
      : askError;

  return (
    <div className="ai-workspace-shell">
      {/* Compact Left Conversation & Context Sidebar */}
      <aside className="ai-sidebar" aria-label="Conversation history and employee context">
        <div className="ai-sidebar-top">
          <button
            type="button"
            className="sidebar-overview-link"
            onClick={() => onSwitchToDashboard('dashboard')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span>Employee 360 Overview</span>
          </button>

          <div className="new-chat-row">
            <span className="new-chat-label">New Chat</span>
            <button
              type="button"
              className="new-chat-plus-btn"
              onClick={() => {
                setUiDemoState('normal');
                onNewThread();
              }}
              title="Start a new AI conversation for this employee"
              aria-label="Start a new AI conversation"
            >
              +
            </button>
          </div>
        </div>

        <div className="ai-sidebar-threads">
          <div className="sidebar-section-caption">Conversations ({empName})</div>
          <ul className="thread-list">
            {threads.map((thread) => {
              const isCurrent = thread.id === activeThread?.id && uiDemoState !== 'empty';
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    className={`thread-item-btn ${isCurrent ? 'active' : ''}`}
                    onClick={() => {
                      setUiDemoState('normal');
                      onSelectThread(thread.id);
                    }}
                  >
                    <span className="thread-item-title">{thread.title}</span>
                    <span className="thread-item-count mono-num">
                      {thread.messages.length} msgs
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Unobtrusive Subject Context Card (collapsed to one row; details on click) */}
        <div className={`sidebar-subject-card ${subjectCardOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className="subject-card-toggle"
            aria-expanded={subjectCardOpen}
            aria-controls="subject-card-details"
            onClick={() => setSubjectCardOpen((prev) => !prev)}
          >
            <span className="subject-card-kicker">SUBJECT CONTEXT</span>
            <span className="subject-card-main">
              <EmployeeAvatar
                employeeId={employeeId}
                fullName={canonical?.employee?.fullName || null}
                size="sm"
              />
              <span className="subject-card-info">
                <span className="subject-card-name">{empName}</span>
                <span className="subject-card-sub">
                  <span className="mono-num">{employeeId}</span>
                  <span aria-hidden="true">·</span>
                  <span>{empStatus}</span>
                </span>
              </span>
              <svg
                className="subject-card-chevron"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          {subjectCardOpen && (
          <div id="subject-card-details" className="subject-card-details">
          <div className="subject-card-facts">
            <div>
              <span>Role:</span> <strong>{empRole}</strong>
            </div>
            <div>
              <span>Dept:</span> <strong>{empDept}</strong>
            </div>
            <div>
              <span>Tenure:</span>{' '}
              <strong className="mono-num">
                {canonical?.deterministicMetrics?.tenure?.formatted || 'Unknown'}
              </strong>
            </div>
            <div>
              <span>Grounded Evidence:</span>{' '}
              <strong className="mono-num">{canonical?.evidence?.length ?? 0} records</strong>
            </div>
          </div>
          <button
            type="button"
            className="subject-inspect-btn"
            aria-expanded={contextDrawerOpen}
            onClick={() => setContextDrawerOpen((prev) => !prev)}
          >
            {contextDrawerOpen ? 'Hide Grounded Context' : 'Inspect Grounded Context'}
          </button>
          </div>
          )}
        </div>

        {/* UI State Verification Switcher (Populated / Loading / Empty / Error) */}
        <div className="sidebar-state-switcher">
          <div className="sidebar-section-caption">UI State Verification</div>
          <div className="state-btn-grid">
            <button
              type="button"
              className={`state-chip-btn ${
                uiDemoState === 'normal' && activeThreadHasMessages ? 'active' : ''
              }`}
              onClick={() => {
                setUiDemoState('normal');
                // From an empty chat, "Conversation" opens the first thread that has messages
                if (!activeThreadHasMessages) {
                  const populated = threads.find((t) => t.messages.length > 0);
                  if (populated) onSelectThread(populated.id);
                }
              }}
            >
              Conversation
            </button>
            <button
              type="button"
              className={`state-chip-btn ${
                uiDemoState === 'empty' || (uiDemoState === 'normal' && !activeThreadHasMessages)
                  ? 'active'
                  : ''
              }`}
              onClick={() => setUiDemoState('empty')}
            >
              Empty State
            </button>
            <button
              type="button"
              className={`state-chip-btn ${uiDemoState === 'loading' ? 'active' : ''}`}
              onClick={() => setUiDemoState('loading')}
            >
              Loading
            </button>
            <button
              type="button"
              className={`state-chip-btn ${uiDemoState === 'error' ? 'active' : ''}`}
              onClick={() => setUiDemoState('error')}
            >
              API Error
            </button>
          </div>
        </div>
      </aside>

      {/* Dominant Central Conversational Canvas */}
      <main className="ai-main-stage" aria-label="AI Employee 360 Assistant">
        <div className="ai-conversation-scroll">
          {/* Welcome Header & Suggested Prompts (intro only before the first question) */}
          {(!hasMessages || showPromptsPanel) && (
          <section className={`ai-hero-greeting ${hasMessages ? 'is-compact' : ''}`}>
            {!hasMessages && (
            <>
            <div className="ai-emblem-glow" aria-hidden="true">
              <img className="ai-emblem-mark" src={aiEmblem} alt="" width={96} height={96} />
            </div>

            <h1 className="ai-greeting-title">
              Employee 360 Intelligence · {empName}
            </h1>
            <p className="ai-greeting-subtitle">
              Ask natural-language questions grounded strictly in verified Zoho People records,
              deterministic calculations, and extracted evidence for{' '}
              <span className="mono-num">{employeeId}</span>.
            </p>
            </>
            )}

            {/* Suggested Prompts Grid */}
            {showPromptsPanel && (
              <div className="suggested-prompts-cluster" aria-label="Suggested employee questions">
                {SUGGESTED_AI_PROMPTS.map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    className="suggested-prompt-btn"
                    disabled={effectiveLoading}
                    onClick={() => handleSuggestedPromptClick(promptText)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>{promptText}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="suggested-prompt-btn"
                  disabled={effectiveLoading}
                  onClick={() =>
                    handleSuggestedPromptClick(
                      'What is the attendance and leave utilization status?'
                    )
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  <span>Attendance &amp; leave utilization status</span>
                </button>
                <button
                  type="button"
                  className="suggested-prompt-btn"
                  disabled={effectiveLoading}
                  onClick={() =>
                    handleSuggestedPromptClick(
                      'Which employee attributes are currently Unknown or unrecorded?'
                    )
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
                  </svg>
                  <span>Check Unknown / unrecorded fields</span>
                </button>
              </div>
            )}
          </section>
          )}

          {/* Optional Grounded Context Drawer */}
          {contextDrawerOpen && canonical && (
            <section className="grounded-context-drawer" aria-label="Canonical Employee 360 Context">
              <div className="context-drawer-header">
                <div>
                  <h3>Canonical Employee 360 Context Sent to AI Engine</h3>
                  <p>
                    The AI Engine receives only authorized canonical fields, deterministic metrics,
                    and verified `domain.field` evidence references.
                  </p>
                </div>
                <button
                  type="button"
                  className="context-drawer-close"
                  onClick={() => setContextDrawerOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="context-drawer-grid">
                <div className="context-drawer-col">
                  <h4>Deterministic Metrics</h4>
                  <ul>
                    <li>
                      Tenure:{' '}
                      <strong className="mono-num">
                        {canonical.deterministicMetrics.tenure?.formatted || 'Unknown'}
                      </strong>{' '}
                      ({canonical.deterministicMetrics.tenure?.classification || 'Unknown'})
                    </li>
                    <li>
                      Attendance:{' '}
                      <strong className="mono-num">
                        {canonical.deterministicMetrics.attendancePercentage?.formatted || 'Unknown'}
                      </strong>{' '}
                      (
                      {canonical.deterministicMetrics.attendancePercentage?.classification ||
                        'Unknown'}
                      )
                    </li>
                    <li>
                      Leave Utilization:{' '}
                      <strong className="mono-num">
                        {canonical.deterministicMetrics.leaveUtilization?.formatted || 'Unknown'}
                      </strong>{' '}
                      (
                      {canonical.deterministicMetrics.leaveUtilization?.classification || 'Unknown'}
                      )
                    </li>
                    <li>
                      Appraisal Rating:{' '}
                      <strong className="mono-num">
                        {canonical.deterministicMetrics.performanceRating?.value ?? 'Unknown'}
                      </strong>{' '}
                      (
                      {canonical.deterministicMetrics.performanceRating?.classification ||
                        'Unknown'}
                      )
                    </li>
                  </ul>
                </div>
                <div className="context-drawer-col">
                  <h4>Allowed Evidence References ({canonical.evidence.length})</h4>
                  <ul>
                    {canonical.evidence.map((ev) => (
                      <li key={`${ev.domain}.${ev.field}`}>
                        <code className="inline-code mono-num">
                          {ev.domain}.{ev.field}
                        </code>{' '}
                        — {ev.source}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Error Banner */}
          {effectiveError && (
            <div className="ai-error-banner" role="alert">
              <div className="ai-error-content">
                <strong>Ask AI Request Error</strong>
                <p>{effectiveError}</p>
              </div>
              <button
                type="button"
                className="ai-error-dismiss"
                onClick={() => {
                  setUiDemoState('normal');
                  onClearAskError();
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Empty State */}
          {messages.length === 0 && !effectiveLoading && (
            <div className="ai-empty-state">
              <div className="ai-empty-card">
                <h3>Ready to analyze {empName}</h3>
                <p>
                  Select any suggested prompt above or type a natural-language question below to
                  query <code className="inline-code mono-num">POST /v1/employees/{employeeId}/ask</code>.
                  All responses preserve strict Fact, Calculation, Trend, AI Insight, and Unknown
                  semantics.
                </p>
              </div>
            </div>
          )}

          {/* Conversation Messages Stream */}
          <div className="ai-messages-stream">
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <article key={msg.id} className="chat-turn chat-turn-user">
                    <div className="user-message-bubble">
                      <div className="user-message-meta">
                        <span>You</span>
                        <span aria-hidden="true">·</span>
                        <span>Subject: {empName}</span>
                      </div>
                      <p className="user-message-text">{msg.content}</p>
                    </div>
                  </article>
                );
              }

              const meta = msg.responseMeta;
              // Small talk, scope replies and claim-free organization replies make no
              // Employee 360 claim, so they carry no classification or evidence footer.
              const showSemantics =
                !!meta &&
                meta.route !== 'conversation' &&
                meta.route !== 'general' &&
                !(meta.route === 'organization' && meta.evidence.length === 0);

              return (
                <article key={msg.id} className="chat-turn chat-turn-assistant">
                  <div className="assistant-card">
                    {/* Assistant Header with Semantic Classification & Confidence */}
                    <div className="assistant-card-header">
                      <div className="assistant-identity">
                        <span className="assistant-badge-icon" aria-hidden="true">
                          ✦
                        </span>
                        <span className="assistant-name">Employee 360 AI</span>
                        <span className="assistant-sep" aria-hidden="true">
                          ·
                        </span>
                        <span className="assistant-emp-ref mono-num">{msg.employeeId}</span>
                      </div>

                      {showSemantics && (
                        <div className="assistant-semantics-bar">
                          <SemanticBadge classification={meta.type} size="md" />
                          <ConfidenceLabel confidence={meta.confidence} />
                        </div>
                      )}
                    </div>

                    {/* Main Readable Long-Form Answer */}
                    <div className="assistant-prose-body">{renderFormattedContent(msg.content)}</div>

                    {/* Structured Known Facts vs Unknown Attributes Breakdown (when present) */}
                    {meta &&
                      ((meta.knownFactsSummary && meta.knownFactsSummary.length > 0) ||
                        (meta.unknownAttributes && meta.unknownAttributes.length > 0)) && (
                        <div className="assistant-structured-split">
                          {meta.knownFactsSummary && meta.knownFactsSummary.length > 0 && (
                            <div className="split-box split-known">
                              <div className="split-box-title">
                                Verified Facts &amp; Calculations
                              </div>
                              <ul className="split-fact-list">
                                {meta.knownFactsSummary.map((item, idx) => (
                                  <li key={idx}>
                                    <div className="split-fact-top">
                                      <span className="split-fact-label">{item.label}</span>
                                      <SemanticBadge classification={item.classification} />
                                    </div>
                                    <div className="split-fact-val">{item.value}</div>
                                    <div className="split-fact-src">Source: {item.source}</div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {meta.unknownAttributes && meta.unknownAttributes.length > 0 && (
                            <div className="split-box split-unknown">
                              <div className="split-box-title">
                                Explicitly Unknown Attributes (Not Fabricated)
                              </div>
                              <ul className="split-unknown-list">
                                {meta.unknownAttributes.map((attr, idx) => (
                                  <li key={idx}>
                                    <SemanticBadge classification="Unknown" />
                                    <span className="mono-num">{attr}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                    {/* Grounded Evidence References Footer */}
                    {showSemantics && (
                      <div className="assistant-evidence-footer">
                        <div className="evidence-footer-group">
                          <span className="evidence-footer-label">
                            Grounded Evidence ({meta.evidence.length}):
                          </span>
                          {meta.evidence.length > 0 ? (
                            <div className="evidence-ref-list">
                              {meta.evidence.map((ref) => {
                                const detail = evidenceMap.get(ref);
                                return (
                                  <span
                                    key={ref}
                                    className="evidence-ref-item mono-num"
                                    title={
                                      detail
                                        ? `${detail.source}: ${detail.notes || ''}`
                                        : `Verified field reference: ${ref}`
                                    }
                                  >
                                    {ref}
                                    {detail?.source ? ` (${detail.source})` : ''}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="unknown-inline">
                              No source evidence references returned
                            </span>
                          )}
                        </div>

                        {meta.limitations && meta.limitations.length > 0 && (
                          <div className="limitations-footer-note">
                            <strong>Source Limitations:</strong>{' '}
                            <span>{meta.limitations.join(' · ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}

            {/* Streaming / Loading Response State */}
            {effectiveLoading && (
              <article className="chat-turn chat-turn-assistant" aria-live="polite" aria-busy="true">
                <div className="assistant-card assistant-loading-card">
                  <div className="assistant-card-header">
                    <div className="assistant-identity">
                      <span className="assistant-badge-icon pulse-anim" aria-hidden="true">
                        ✦
                      </span>
                      <span className="assistant-name">
                        Synthesizing grounded response for {empName} ({employeeId})...
                      </span>
                    </div>
                  </div>
                  <div className="skeleton-lines">
                    <div className="skeleton-line w-85" />
                    <div className="skeleton-line w-92" />
                    <div className="skeleton-line w-65" />
                  </div>
                </div>
              </article>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Prominent Message Composer (Inspired by Reference Image 1 & Claude) */}
        <div className="ai-composer-shell">
          <form onSubmit={handleSubmit} className="ai-composer-box">
            <textarea
              className="ai-composer-textarea"
              rows={2}
              placeholder={`Employee 360 AI is here to assist. Enter your question about ${empName} (${employeeId})...`}
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit(e);
                }
              }}
              disabled={effectiveLoading}
            />

            <div className="ai-composer-toolbar">
              <div className="composer-left-actions">
                <button
                  type="button"
                  className="composer-tool-btn"
                  aria-expanded={showPromptsPanel}
                  onClick={() => setPromptsOverride({ key: promptsKey, open: !showPromptsPanel })}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M7 8h10M7 12h10M7 16h6" strokeLinecap="round" />
                  </svg>
                  <span>{showPromptsPanel ? 'Hide Prompts' : 'View Prompts'}</span>
                </button>

                <button
                  type="button"
                  className="composer-tool-btn"
                  onClick={() => {
                    setQuestionInput('');
                    setUiDemoState('normal');
                    onClearCurrentThread();
                  }}
                >
                  <span>Clear</span>
                </button>
              </div>

              <div className="composer-right-actions">
                {/* AI disclaimer: compact icon, full message on hover / keyboard focus */}
                <span className="ai-disclaimer-hint">
                  <button
                    type="button"
                    className="composer-icon-btn ai-disclaimer-trigger"
                    aria-label="About AI-generated content"
                    aria-describedby="ai-disclaimer-tooltip"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
                    </svg>
                  </button>
                  <span id="ai-disclaimer-tooltip" role="tooltip" className="ai-disclaimer-tooltip">
                    AI-generated content may be inaccurate. Responses are restricted to verified
                    Employee 360 evidence; unrecorded attributes remain Unknown. Please verify
                    important information.
                  </span>
                </span>

                <button
                  type="button"
                  className="composer-icon-btn"
                  title="Inspect Employee 360 Grounded Context"
                  aria-label="Inspect Employee 360 Grounded Context"
                  onClick={() => setContextDrawerOpen((prev) => !prev)}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <button
                  type="submit"
                  className="composer-send-btn"
                  disabled={!questionInput.trim() || effectiveLoading}
                  title="Send question to POST /v1/employees/{employeeId}/ask"
                  aria-label="Send question"
                >
                  <span>Ask AI</span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};
