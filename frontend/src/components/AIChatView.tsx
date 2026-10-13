import React, { useCallback, useEffect, useRef, useState } from 'react';
import aiEmblem from '../assets/ai-emblem.gif';
import type {
  ActivePage,
  AskMentions,
  ChatMessage,
  ConversationThread,
  DataSourceMode,
  Employee360Data,
  EvidenceRecord,
  Mentionable,
} from '../types/employee360';
import { EMPTY_MENTIONS, mentionsFromSpeech, mentionsFromText, type MentionToken } from '../services/mentions';
import { orNotRecorded } from '../services/displayFormat';
import { synthesizeSpeech, transcribeSpeech } from '../services/employee360DataProvider';
import {
  MAX_RECORDING_MS,
  MAX_SPEAK_INPUT_CHARS,
  MIN_RECORDING_MS,
  VoicePlayer,
  VoiceRecorder,
  blobToBase64,
  describeMicrophoneDenial,
  microphoneDenialMessage,
  MICROPHONE_NOT_DELEGATED,
  RECORDER_WINDOW_BLOCKED,
  closeRecorderWindow,
  recordInWindow,
  type Recording,
  isVoiceInputSupported,
  microphoneErrorMessage,
  voicePlayer,
  type PlayerState,
} from '../services/voice';
import { friendlyApiError } from '../api/apiClient';
import { EmployeeAvatar } from './EmployeeAvatar';
import { MentionInput } from './MentionInput';
import { ConfidenceLabel, SemanticBadge } from './SemanticBadge';

/** The signed-in user, as shown in the chat sidebar. */
export interface ChatViewer {
  employeeId: string | null;
  name: string;
  detail: string;
}

interface AIChatViewProps {
  viewer: ChatViewer;
  /** The viewer's own Employee 360, when loaded (sidebar card and grounded-context drawer). */
  canonical: Employee360Data | null;
  /** People and departments the viewer may mention (@ / #). */
  mentionable: Mentionable | null;
  threads: ConversationThread[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onClearCurrentThread: () => void;
  onSendQuestion: (
    question: string,
    mentions: AskMentions,
    options?: { language?: string; viaVoice?: boolean }
  ) => Promise<void>;
  /** Assistant message to read aloud once (the answer to a spoken question). */
  autoSpeakMessageId?: string | null;
  onAutoSpeakHandled?: () => void;
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

/** Starter questions that fit what the viewer may ask about. */
function suggestedPrompts(allScope: Mentionable['allScope'] | undefined): string[] {
  if (allScope === 'organization') {
    return [
      'How many active employees are there?',
      'Headcount by department',
      'Who has the best attendance?',
      'Who has the most late days?',
      'Who joined most recently?',
      'What is my leave utilization?',
    ];
  }
  if (allScope === 'team') {
    return [
      'How many people are in my team?',
      'Who has the most late days in my team?',
      'Average attendance in my team',
      'What is my leave utilization?',
      'How long have I worked here?',
    ];
  }
  return [
    'What is my department?',
    'How long have I worked here?',
    'What is my attendance?',
    'What is my leave utilization?',
    'Who is my reporting manager?',
  ];
}

export const AIChatView: React.FC<AIChatViewProps> = ({
  viewer,
  canonical,
  mentionable,
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
  dataSourceMode,
  autoSpeakMessageId = null,
  onAutoSpeakHandled,
}) => {
  const [questionInput, setQuestionInput] = useState('');
  // Voice input: idle → requesting (browser asks for the mic) → recording → transcribing → (question sent) → idle
  const [voiceState, setVoiceState] = useState<'idle' | 'requesting' | 'recording' | 'transcribing'>('idle');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerState>({ key: null, loading: false });
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const voiceBusyRef = useRef(false);
  const voiceSupported = isVoiceInputSupported();
  // Set after the browser actually refused the microphone inside the Web Tab frame
  // (MICROPHONE_NOT_DELEGATED): later taps record in the voice recorder window
  const useWindowRef = useRef(false);
  const windowAttemptRef = useRef(0);
  const [recordingInWindow, setRecordingInWindow] = useState(false);
  const [voiceErrorAction, setVoiceErrorAction] = useState<'window' | null>(null);
  // Mentions picked from the @ / # lists for the question being typed
  const [pendingTokens, setPendingTokens] = useState<MentionToken[]>([]);
  // Manual "View / Hide Prompts" override, scoped to the thread + empty/non-empty state it was made in
  const [promptsOverride, setPromptsOverride] = useState<{ key: string; open: boolean } | null>(
    null
  );
  const [contextDrawerOpen, setContextDrawerOpen] = useState(false);
  const contextDrawerRef = useRef<HTMLElement | null>(null);
  // Subject context card is collapsed by default so conversation history keeps its space
  const [subjectCardOpen, setSubjectCardOpen] = useState(false);
  // Narrow frames (the Zoho People Web Tab) show the sidebar as an icon rail; this opens it as a drawer
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDemoState, setUiDemoState] = useState<'normal' | 'loading' | 'empty' | 'error'>(
    'normal'
  );
  // The UI state switcher is a Demo-mode tool; with live data the real state always shows
  const isLiveData = dataSourceMode === 'live';
  const uiDemoState = isLiveData ? 'normal' : selectedDemoState;
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // The conversation scrolls inside this element only. scrollIntoView would also scroll
  // the clipped page frame and the Zoho People page around the Web Tab, leaving a blank gap.
  const conversationScrollRef = useRef<HTMLDivElement | null>(null);
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

  const empName = viewer.name;
  const prompts = suggestedPrompts(mentionable?.allScope);
  const empRole = canonical ? orNotRecorded(canonical.employment?.jobTitle) : 'Loading…';
  const empDept = canonical ? orNotRecorded(canonical.organisation?.department) : 'Loading…';
  const empTenure = !canonical
    ? 'Loading…'
    : canonical.deterministicMetrics?.tenure?.formatted && canonical.deterministicMetrics.tenure.formatted !== 'Unknown'
      ? canonical.deterministicMetrics.tenure.formatted
      : 'Not recorded';
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
    const scroller = conversationScrollRef.current;
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [messages.length, isAsking, uiDemoState]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  // One shared player: reflect what is playing, and stop sound when the chat closes
  useEffect(() => voicePlayer.subscribe(setPlayer), []);
  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      closeRecorderWindow();
      voicePlayer.stop();
    },
    []
  );

  useEffect(() => {
    if (voiceState !== 'recording') return;
    const started = Date.now();
    const timer = window.setInterval(() => setRecordingSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [voiceState]);

  // Autoplay refused (no recent click) or the voice service failed: the text is already shown
  const reportPlaybackError = useCallback((error: unknown) => {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'NotAllowedError') {
      setVoiceError('Tap the speaker on the answer to hear it.');
    } else if (name !== 'AbortError') {
      setVoiceError(friendlyApiError(error, "Couldn't play the spoken answer. You can still read it above."));
    }
  }, []);

  /** Plays a message, or stops it if it is the one playing (toggle). */
  const toggleSpeech = useCallback(
    (message: ChatMessage) => {
      const text = message.content.slice(0, MAX_SPEAK_INPUT_CHARS);
      const language = message.language || 'en-IN';
      if (voicePlayer.isCurrent(text, language)) {
        voicePlayer.stop();
        return;
      }
      voicePlayer.play(text, language, synthesizeSpeech).catch(reportPlaybackError);
    },
    [reportPlaybackError]
  );

  // Read the answer to a spoken question aloud, once
  useEffect(() => {
    if (!autoSpeakMessageId) return;
    const message = messages.find((m) => m.id === autoSpeakMessageId);
    onAutoSpeakHandled?.();
    if (!message) return;
    voicePlayer
      .play(message.content.slice(0, MAX_SPEAK_INPUT_CHARS), message.language || 'en-IN', synthesizeSpeech)
      .catch(reportPlaybackError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpeakMessageId]);

  /** Transcribes one recording and sends it as the question. */
  const sendRecording = useCallback(
    async (recording: Recording | null) => {
      if (!recording || recording.durationMs < MIN_RECORDING_MS) {
        setVoiceState('idle');
        setVoiceError('That was too short. Tap the microphone, speak, then tap it again to send.');
        return;
      }
      try {
        setVoiceState('transcribing');
        const audio = await blobToBase64(recording.blob);
        const heard = await transcribeSpeech(audio, recording.mimeType);
        setVoiceState('idle');
        const transcript = heard.transcript.trim();
        if (!transcript) {
          setVoiceError("I couldn't hear any words. Please try again a little closer to the microphone.");
          return;
        }
        setUiDemoState('normal');
        setPromptsOverride(null);
        await onSendQuestion(transcript, mentionsFromSpeech(transcript, mentionable), {
          language: heard.languageCode,
          viaVoice: true,
        });
      } catch (error) {
        setVoiceState('idle');
        setVoiceError(
          friendlyApiError(error, "Couldn't turn your speech into text. Please try again.")
        );
      }
    },
    [onSendQuestion, mentionable]
  );

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || voiceBusyRef.current) return;
    voiceBusyRef.current = true;
    try {
      const recording = await recorder.stop();
      recorderRef.current = null;
      await sendRecording(recording);
    } finally {
      voiceBusyRef.current = false;
    }
  }, [sendRecording]);

  /**
   * Records in the voice recorder window (app/voice.html). Only used after the
   * browser refused the microphone inside the Web Tab; must run within a click.
   */
  const recordWithWindow = () => {
    const attempt = ++windowAttemptRef.current;
    setVoiceError(null);
    setVoiceErrorAction(null);
    setRecordingInWindow(true);
    setVoiceState('recording');
    recordInWindow()
      .then((recording) => {
        if (attempt !== windowAttemptRef.current) return;
        setRecordingInWindow(false);
        if (!recording) {
          setVoiceState('idle');
          return;
        }
        return sendRecording(recording);
      })
      .catch((error) => {
        if (attempt !== windowAttemptRef.current) return;
        setRecordingInWindow(false);
        setVoiceState('idle');
        const blocked = (error as { name?: string } | null)?.name === 'PopupBlockedError';
        setVoiceError(blocked ? RECORDER_WINDOW_BLOCKED : microphoneErrorMessage(error));
        if (blocked) setVoiceErrorAction('window');
      });
  };

  const handleMicClick = async () => {
    if (voiceState === 'recording') {
      if (!recordingInWindow) void finishRecording();
      return;
    }
    if (voiceState !== 'idle' || isAsking || voiceBusyRef.current) return;
    onClearAskError();
    setVoiceError(null);
    setVoiceErrorAction(null);
    if (useWindowRef.current) {
      voicePlayer.stop();
      voicePlayer.unlock();
      recordWithWindow();
      return;
    }
    // Inside this click, so the spoken answer may play automatically later
    voicePlayer.stop();
    voicePlayer.unlock();
    // Always ask the browser: whether an embedded page may use the microphone is
    // decided by getUserMedia itself, not guessed here. Registered before the
    // permission prompt so Escape or leaving the chat can cancel it.
    const recorder = new VoiceRecorder();
    recorderRef.current = recorder;
    voiceBusyRef.current = true;
    setVoiceState('requesting');
    try {
      await recorder.start(() => void finishRecording());
      if (recorderRef.current !== recorder) return;
      setRecordingSeconds(0);
      setVoiceState('recording');
    } catch (error) {
      recorder.cancel();
      if (recorderRef.current === recorder) recorderRef.current = null;
      setVoiceState('idle');
      // Cancelled by the user while the browser was asking: nothing to report
      if ((error as { name?: string } | null)?.name !== 'AbortError') {
        setVoiceError(microphoneErrorMessage(error));
        // Refine the message with why it was refused (frame policy vs site setting);
        // the facts are logged for support (no personal data in them)
        void describeMicrophoneDenial(error).then((facts) => {
          console.info('[Employee 360] microphone refused', facts);
          const message = microphoneDenialMessage(facts);
          setVoiceError(message);
          // The frame can't use the microphone: record in the voice recorder window
          // instead (still within this click, so the browser lets it open)
          if (message === MICROPHONE_NOT_DELEGATED) {
            useWindowRef.current = true;
            recordWithWindow();
          }
        });
      }
    } finally {
      voiceBusyRef.current = false;
    }
  };

  const cancelRecording = () => {
    windowAttemptRef.current += 1;
    closeRecorderWindow();
    setRecordingInWindow(false);
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setVoiceState('idle');
  };

  useEffect(() => {
    if (voiceState !== 'recording' && voiceState !== 'requesting') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRecording();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [voiceState]);

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const trimmed = questionInput.trim();
    if (!trimmed || isAsking) return;
    const mentions = mentionsFromText(trimmed, pendingTokens);
    voicePlayer.stop();
    setUiDemoState('normal');
    setQuestionInput('');
    setPendingTokens([]);
    setPromptsOverride(null);
    await onSendQuestion(trimmed, mentions);
  };

  const handleSuggestedPromptClick = async (promptText: string) => {
    if (isAsking) return;
    voicePlayer.stop();
    setUiDemoState('normal');
    setPromptsOverride(null);
    await onSendQuestion(promptText, EMPTY_MENTIONS);
  };

  const effectiveLoading = isAsking || uiDemoState === 'loading';
  const effectiveError =
    uiDemoState === 'error'
      ? 'Simulated Backend Error: Unable to complete POST /v1/ask. Upstream Zoho People or Gemini provider returned a transient timeout.'
      : askError;

  return (
    <div className={`ai-workspace-shell ${sidebarOpen ? 'is-sidebar-open' : ''}`}>
      {/* Icon rail: shown only in narrow frames, where the sidebar becomes a drawer */}
      <div className="ai-sidebar-rail">
        <button
          type="button"
          className="ai-rail-btn"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-expanded={sidebarOpen}
          aria-controls="ai-conversation-sidebar"
          aria-label={sidebarOpen ? 'Close conversations' : 'Open conversations'}
          title="Conversations"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="ai-rail-btn"
          onClick={() => {
            setUiDemoState('normal');
            setSidebarOpen(false);
            onNewThread();
          }}
          aria-label="Start a new AI conversation"
          title="New chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="ai-rail-btn"
          onClick={() => onSwitchToDashboard('dashboard')}
          aria-label="Open the Employee 360 dashboard"
          title="Employee 360 Overview"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
      </div>
      {sidebarOpen && (
        <button
          type="button"
          className="ai-sidebar-backdrop"
          aria-label="Close conversations"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Compact Left Conversation & Context Sidebar */}
      <aside
        id="ai-conversation-sidebar"
        className="ai-sidebar"
        aria-label="Conversation history and employee context"
      >
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
                setSidebarOpen(false);
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
          <div className="sidebar-section-caption">Conversations</div>
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
                      setSidebarOpen(false);
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
            <span className="subject-card-kicker">SIGNED IN AS</span>
            <span className="subject-card-main">
              <EmployeeAvatar
                employeeId={viewer.employeeId || 'VIEWER'}
                fullName={viewer.employeeId ? viewer.name : null}
                size="sm"
              />
              <span className="subject-card-info">
                <span className="subject-card-name">{empName}</span>
                <span className="subject-card-sub">{viewer.detail}</span>
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
          <dl className="subject-card-facts">
            {viewer.employeeId && (
              <div>
                <dt>Employee ID</dt>
                <dd className="mono-num">{viewer.employeeId}</dd>
              </div>
            )}
            <div>
              <dt>Access</dt>
              <dd>{viewer.detail}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{empRole}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{empDept}</dd>
            </div>
            <div>
              <dt>Tenure</dt>
              <dd className="mono-num">{empTenure}</dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd className="mono-num">
                {canonical ? `${canonical.evidence.length} verified record${canonical.evidence.length === 1 ? '' : 's'}` : 'Not loaded'}
              </dd>
            </div>
          </dl>
          <button
            type="button"
            className="subject-inspect-btn"
            aria-expanded={contextDrawerOpen}
            aria-controls="grounded-context-drawer"
            disabled={!canonical}
            title={canonical ? undefined : 'Your Employee 360 record is still loading'}
            onClick={() => {
              const opening = !contextDrawerOpen;
              setContextDrawerOpen(opening);
              if (opening) {
                // On narrow frames the sidebar is a drawer over the chat: close it so the panel shows
                setSidebarOpen(false);
                requestAnimationFrame(() => {
                  const scroller = conversationScrollRef.current;
                  const drawer = contextDrawerRef.current;
                  if (!scroller || !drawer) return;
                  const offset = drawer.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
                  scroller.scrollTo({ top: scroller.scrollTop + offset, behavior: 'smooth' });
                });
              }
            }}
          >
            {contextDrawerOpen ? 'Hide Grounded Context' : 'Inspect Grounded Context'}
          </button>
          </div>
          )}
        </div>

        {/* UI State Verification Switcher (Populated / Loading / Empty / Error): Demo mode only */}
        {!isLiveData && (
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
        )}
      </aside>

      {/* Dominant Central Conversational Canvas */}
      <main className="ai-main-stage" aria-label="AI Employee 360 Assistant">
        <div className="ai-conversation-scroll" ref={conversationScrollRef}>
          {/* Welcome Header & Suggested Prompts (intro only before the first question) */}
          {(!hasMessages || showPromptsPanel) && (
          <section className={`ai-hero-greeting ${hasMessages ? 'is-compact' : ''}`}>
            {!hasMessages && (
            <>
            <div className="ai-emblem-glow" aria-hidden="true">
              <img className="ai-emblem-mark" src={aiEmblem} alt="" width={96} height={96} />
            </div>

            <h1 className="ai-greeting-title">Employee 360 Intelligence</h1>
            <p className="ai-greeting-subtitle">
              Ask about anything you have access to, grounded in verified Zoho People records.
              {mentionable?.canMentionAll ? (
                <>
                  {' '}Type <kbd className="mention-kbd">@</kbd> for a person,{' '}
                  <kbd className="mention-kbd">#</kbd> for a department, or{' '}
                  <kbd className="mention-kbd">@all</kbd> for everyone.
                </>
              ) : (
                <> Questions are answered from your own record.</>
              )}
            </p>
            </>
            )}

            {/* Suggested Prompts Grid */}
            {showPromptsPanel && (
              <div className="suggested-prompts-cluster" aria-label="Suggested employee questions">
                {prompts.map((promptText) => (
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
              </div>
            )}
          </section>
          )}

          {/* Optional Grounded Context Drawer */}
          {contextDrawerOpen && canonical && (
            <section
              id="grounded-context-drawer"
              ref={contextDrawerRef}
              className="grounded-context-drawer"
              aria-label="Canonical Employee 360 Context"
            >
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
                <h3>Ask anything you have access to</h3>
                <p>
                  Pick a suggested question above or type your own below. Without a mention, a
                  question covers everyone you may see; answers keep strict Fact, Calculation,
                  Trend, AI Insight and Unknown semantics.
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
                        {msg.viaVoice && (
                          <span className="user-message-voice" title="Asked by voice">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                              <rect x="9" y="3" width="6" height="11" rx="3" />
                              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
                            </svg>
                            <span className="sr-only">Asked by voice</span>
                          </span>
                        )}
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
                        {meta?.scopeLabel && (
                          <span className="assistant-emp-ref">{meta.scopeLabel}</span>
                        )}
                      </div>

                      <div className="assistant-header-actions">
                        {showSemantics && (
                          <div className="assistant-semantics-bar">
                            <SemanticBadge classification={meta.type} size="md" />
                            <ConfidenceLabel confidence={meta.confidence} />
                          </div>
                        )}
                        {(() => {
                          const key = VoicePlayer.keyFor(msg.content.slice(0, MAX_SPEAK_INPUT_CHARS), msg.language || 'en-IN');
                          const active = player.key === key;
                          const loading = active && player.loading;
                          return (
                            <button
                              type="button"
                              className={`assistant-listen-btn ${active ? 'is-active' : ''}`}
                              onClick={() => {
                                setVoiceError(null);
                                toggleSpeech(msg);
                              }}
                              aria-label={active ? 'Stop reading this answer' : 'Read this answer aloud'}
                              title={active ? 'Stop' : 'Listen'}
                              aria-busy={loading}
                            >
                              {loading ? (
                                <span className="listen-spinner" aria-hidden="true" />
                              ) : active ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <rect x="6" y="6" width="12" height="12" rx="2" />
                                </svg>
                              ) : (
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                  <path d="M11 5L6 9H3v6h3l5 4V5z" strokeLinejoin="round" />
                                  <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
                                </svg>
                              )}
                            </button>
                          );
                        })()}
                      </div>
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
                        Thinking…
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
            <MentionInput
              className="ai-composer-textarea"
              placeholder={
                voiceState === 'requesting'
                  ? 'Waiting for microphone access…'
                  : voiceState === 'recording' && recordingInWindow
                  ? 'Speak in the voice recorder window, then tap its button to send…'
                  : voiceState === 'recording'
                  ? 'Listening… tap the microphone again to send, Esc to cancel'
                  : voiceState === 'transcribing'
                    ? 'Turning your speech into text…'
                    : mentionable?.canMentionAll
                      ? 'Ask or speak a question. Type @ for a person, # for a department, @all for everyone…'
                      : 'Ask or speak a question about your own Employee 360 record…'
              }
              value={questionInput}
              onChange={setQuestionInput}
              mentionable={mentionable}
              onToken={(token) => setPendingTokens((tokens) => [...tokens, token])}
              onSubmit={() => void handleSubmit()}
              disabled={effectiveLoading || voiceState !== 'idle'}
            />

            {(voiceState !== 'idle' || voiceError) && (
              <div className={`voice-status ${voiceError && voiceState === 'idle' ? 'is-error' : ''}`} role="status" aria-live="polite">
                {voiceState === 'recording' && recordingInWindow && (
                  <>
                    <span className="voice-rec-dot" aria-hidden="true" />
                    <span>
                      Voice input can't start inside this Web Tab, so the voice recorder window is open: speak there,
                      then tap its button to send.
                    </span>
                    <button type="button" className="voice-status-link" onClick={cancelRecording}>
                      Cancel
                    </button>
                  </>
                )}
                {voiceState === 'recording' && !recordingInWindow && (
                  <>
                    <span className="voice-rec-dot" aria-hidden="true" />
                    <span>
                      Listening · 0:{String(recordingSeconds).padStart(2, '0')} / 0:{MAX_RECORDING_MS / 1000}
                    </span>
                    <button type="button" className="voice-status-link" onClick={cancelRecording}>
                      Cancel
                    </button>
                  </>
                )}
                {voiceState === 'requesting' && (
                  <>
                    <span>Waiting for microphone access… allow it if your browser asks.</span>
                    <button type="button" className="voice-status-link" onClick={cancelRecording}>
                      Cancel
                    </button>
                  </>
                )}
                {voiceState === 'transcribing' && <span>Transcribing your question…</span>}
                {voiceState === 'idle' && voiceError && (
                  <>
                    <span>{voiceError}</span>
                    {voiceErrorAction === 'window' && (
                      <button type="button" className="voice-status-link" onClick={recordWithWindow}>
                        Open voice recorder
                      </button>
                    )}
                    <button
                      type="button"
                      className="voice-status-link"
                      onClick={() => {
                        setVoiceError(null);
                        setVoiceErrorAction(null);
                      }}
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            )}

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

                {voiceSupported && (
                  <button
                    type="button"
                    className={`composer-icon-btn composer-mic-btn is-${voiceState}`}
                    title={voiceState === 'recording' ? 'Stop and send' : 'Speak your question'}
                    aria-label={
                      voiceState === 'recording'
                        ? 'Stop recording and send'
                        : voiceState === 'transcribing'
                          ? 'Transcribing'
                          : voiceState === 'requesting'
                            ? 'Waiting for microphone access'
                            : 'Speak your question'
                    }
                    aria-pressed={voiceState === 'recording'}
                    disabled={voiceState === 'transcribing' || voiceState === 'requesting' || recordingInWindow || (voiceState === 'idle' && effectiveLoading)}
                    onClick={() => void handleMicClick()}
                  >
                    {voiceState === 'transcribing' ? (
                      <span className="listen-spinner" aria-hidden="true" />
                    ) : voiceState === 'recording' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <rect x="9" y="3" width="6" height="11" rx="3" />
                        <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                )}

                <button
                  type="submit"
                  className="composer-send-btn"
                  disabled={!questionInput.trim() || effectiveLoading || voiceState !== 'idle'}
                  title="Send question to POST /v1/ask"
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
