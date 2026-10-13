/**
 * Voice chat in the browser: record one question, play spoken answers.
 *
 * Built to keep Sarvam usage (free tier) low:
 * - one recording = one transcription call, auto-stopped at 30 s, low bitrate;
 * - a spoken answer is fetched once per text and language, then replayed
 *   from memory; a second click while it loads waits for the same request.
 */

/** Hard stop for a recording (the backend accepts clips under 30 s). */
export const MAX_RECORDING_MS = 30_000;
/** Shorter clips are almost always accidental taps; they are not sent. */
export const MIN_RECORDING_MS = 700;
/** Longest answer text sent for reading; the backend reads at most ~500 characters of it. */
export const MAX_SPEAK_INPUT_CHARS = 2000;

const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];
const MAX_CACHED_CLIPS = 20;

/** The first recording format this browser supports, or null (no MediaRecorder support). */
export function pickRecordingMimeType(isSupported: (type: string) => boolean): string | null {
  for (const type of RECORDING_TYPES) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // Some browsers throw for unknown types; try the next one
    }
  }
  return null;
}

/**
 * Recording formats the backend transcription route accepts (see
 * POST /v1/voice/transcribe), without codec parameters.
 */
export const UPLOAD_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'];

/** The upload type for a recorder MIME type ("audio/webm;codecs=opus" → "audio/webm"), or null if not accepted. */
export function uploadMimeType(recorderMimeType: string | null | undefined): string | null {
  const base = String(recorderMimeType || '').split(';')[0].trim().toLowerCase();
  return UPLOAD_AUDIO_TYPES.includes(base) ? base : null;
}

/**
 * A plain-language message for a real microphone or recorder failure, by the
 * DOMException name getUserMedia / MediaRecorder actually raised.
 */
export function microphoneErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name || '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Microphone permission was denied. Allow microphone access for this site in your browser (the icon at the left of the address bar), then tap the mic again. You can also type your question.';
    case 'SecurityError':
      return 'The browser blocked microphone access on this page. You can type your question instead.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect a microphone and tap the mic again, or type your question.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The microphone is in use by another app or could not be started. Close that app and try again.';
    case 'NotSupportedError':
      return "This browser can't record audio here. Please type your question.";
    case 'AbortError':
      return 'Recording was interrupted. Tap the mic to try again.';
    default:
      return "Couldn't start the microphone. Tap the mic to try again, or type your question.";
  }
}

/**
 * Shown when the browser refused the microphone although the user allowed it for
 * the site: the page embedding the Web Tab did not delegate the microphone to
 * this frame (no allow="microphone" on the Web Tab frame).
 */
export const MICROPHONE_NOT_DELEGATED =
  "Your browser allows the microphone, but the Zoho People page doesn't pass microphone access to this Web Tab, so voice input can't start here. Please type your question; you can still tap the speaker on any answer to hear it.";

/** Shown while the recorder window is open (after the refusal above). */
export const RECORDING_IN_WINDOW =
  'Opened the voice recorder window: speak there, then tap its button to send.';

/** When the browser blocked the recorder window. */
export const RECORDER_WINDOW_BLOCKED =
  'The voice recorder window was blocked. Allow pop-ups for Zoho People, then tap the mic again.';

export interface MicrophoneDenialFacts {
  errorName: string;
  inFrame: boolean;
  /** document.permissionsPolicy / featurePolicy answer for "microphone"; null when the browser can't tell. */
  framePolicyAllows: boolean | null;
  /** navigator.permissions state for the site: granted / denied / prompt, or null when unavailable. */
  sitePermission: string | null;
}

/**
 * Collects the facts behind a refusal that already happened (getUserMedia is
 * always tried first; nothing here is used to block an attempt).
 */
export async function describeMicrophoneDenial(
  error: unknown,
  env: {
    win?: Window;
    doc?: Document;
    permissions?: { query: (descriptor: { name: string }) => Promise<{ state: string }> } | null;
  } = {}
): Promise<MicrophoneDenialFacts> {
  const win = env.win ?? window;
  const doc = (env.doc ?? document) as Document & {
    permissionsPolicy?: { allowsFeature(feature: string): boolean };
    featurePolicy?: { allowsFeature(feature: string): boolean };
  };
  let inFrame = true;
  try {
    inFrame = win.self !== win.top;
  } catch {
    // A cross-origin parent can throw on access: that is a frame
  }
  let framePolicyAllows: boolean | null = null;
  try {
    const policy = doc.permissionsPolicy || doc.featurePolicy;
    framePolicyAllows = policy ? policy.allowsFeature('microphone') : null;
  } catch {
    // Unknown policy
  }
  let sitePermission: string | null = null;
  try {
    const permissions = env.permissions === undefined ? (navigator as Navigator).permissions : env.permissions;
    sitePermission = permissions ? (await permissions.query({ name: 'microphone' })).state : null;
  } catch {
    // Permissions API without "microphone" (e.g. Firefox)
  }
  return { errorName: (error as { name?: string } | null)?.name || 'Error', inFrame, framePolicyAllows, sitePermission };
}

/** The message for a refusal, from what actually happened. */
export function microphoneDenialMessage(facts: MicrophoneDenialFacts): string {
  const refused = facts.errorName === 'NotAllowedError' || facts.errorName === 'SecurityError';
  if (refused && facts.inFrame && (facts.framePolicyAllows === false || facts.sitePermission === 'granted')) {
    return MICROPHONE_NOT_DELEGATED;
  }
  return microphoneErrorMessage({ name: facts.errorName });
}

/** The recorder window's URL, next to the widget page (Zoho) or under app/ (local dev). */
export function recorderWindowUrl(location: { href: string; pathname: string }): string {
  const page = /\/app\/[^/]*$/.test(location.pathname) ? 'voice.html' : 'app/voice.html';
  return new URL(page, location.href).toString();
}

/**
 * Records in a separate window (app/voice.html), used only after the browser
 * refused the microphone inside the Web Tab frame. Call it inside a click: browsers
 * block other pop-ups. Resolves with the recording, or null when the user
 * cancels or closes the window; rejects with PopupBlockedError if it can't open.
 */
let activeRecorderWindow: Window | null = null;

/** Closes the recorder window (cancel from the chat); its page then frees the microphone. */
export function closeRecorderWindow(): void {
  try {
    activeRecorderWindow?.close();
  } catch {
    // already closed
  }
  activeRecorderWindow = null;
}

export function recordInWindow(): Promise<Recording | null> {
  const width = 380;
  const height = 340;
  const left = Math.max(0, Math.round((window.screen?.availWidth ?? width) / 2 - width / 2));
  const top = Math.max(0, Math.round((window.screen?.availHeight ?? height) / 2 - height / 2));
  const popup = window.open(
    recorderWindowUrl(window.location),
    'e360-voice-recorder',
    `popup=yes,width=${width},height=${height},left=${left},top=${top}`
  );
  if (!popup) {
    return Promise.reject(Object.assign(new Error('Pop-up blocked'), { name: 'PopupBlockedError' }));
  }
  activeRecorderWindow = popup;
  popup.focus();
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: Recording | null) => {
      if (done) return;
      done = true;
      if (activeRecorderWindow === popup) activeRecorderWindow = null;
      window.removeEventListener('message', onMessage);
      window.clearInterval(closedCheck);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      // Only our own recorder window, from this origin
      if (event.source !== popup || event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; type?: string; blob?: Blob; mimeType?: string; durationMs?: number };
      if (!data || data.source !== 'e360-voice') return;
      const mimeType = uploadMimeType(data.mimeType);
      if (data.type === 'recording' && data.blob instanceof Blob && mimeType) {
        finish({ blob: data.blob, mimeType, durationMs: Number(data.durationMs) || 0 });
      } else if (data.type === 'cancel') {
        finish(null);
      }
    };
    window.addEventListener('message', onMessage);
    // Closing the window without sending counts as cancel
    const closedCheck = window.setInterval(() => {
      if (popup.closed) window.setTimeout(() => finish(null), 300);
    }, 500);
  });
}

/** Whether the browser has the APIs voice input needs. Being embedded in a frame is not a reason to refuse. */
export function isVoiceInputSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** Base64 (no data: prefix) of a recording. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read the recording'));
    reader.readAsDataURL(blob);
  });
}

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/** Browser APIs the recorder uses; tests pass stand-ins. */
export interface RecorderDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorder: {
    new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
    isTypeSupported?: (type: string) => boolean;
  };
  setTimeout: (handler: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
}

function browserDeps(): RecorderDeps {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    MediaRecorder: window.MediaRecorder,
    setTimeout: (handler, ms) => window.setTimeout(handler, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    now: () => Date.now(),
  };
}

function namedError(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

/**
 * One recording at a time. getUserMedia is always attempted (the browser and
 * the embedding page decide); every path that obtained the microphone stops its
 * tracks again: stop, cancel, the 30 s limit, or a recorder that fails to start.
 */
export class VoiceRecorder {
  private readonly deps: RecorderDeps;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private limitTimer: number | null = null;
  private stopping: Promise<Recording | null> | null = null;
  private starting = false;
  private cancelled = false;

  constructor(deps: Partial<RecorderDeps> = {}) {
    this.deps = { ...browserDeps(), ...deps };
  }

  get isRecording(): boolean {
    return this.recorder !== null;
  }

  /**
   * Asks for the microphone and starts recording; `onLimit` fires when the
   * 30 s limit is reached. Rejects with the browser's own error (NotAllowedError,
   * NotFoundError, …), or AbortError if cancel() was called while the browser
   * was still asking for permission.
   */
  async start(onLimit: () => void): Promise<void> {
    if (this.recorder || this.starting) return;
    this.starting = true;
    this.cancelled = false;
    let stream: MediaStream | null = null;
    try {
      stream = await this.deps.getUserMedia({ audio: true });
      if (this.cancelled) throw namedError('AbortError', 'Recording cancelled before it started');

      const recorder = this.createRecorder(stream);
      this.chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) this.chunks.push(event.data);
      };
      this.stream = stream;
      this.recorder = recorder;
      this.startedAt = this.deps.now();
      recorder.start();
      this.limitTimer = this.deps.setTimeout(onLimit, MAX_RECORDING_MS);
    } catch (error) {
      // Whatever failed after the microphone was granted, give it back
      stream?.getTracks().forEach((track) => track.stop());
      this.release();
      throw error;
    } finally {
      this.starting = false;
    }
  }

  /** A recorder in a format the backend accepts: preferred types first, then the browser default. */
  private createRecorder(stream: MediaStream): MediaRecorder {
    const Recorder = this.deps.MediaRecorder;
    const isSupported = (type: string) => (typeof Recorder.isTypeSupported === 'function' ? Recorder.isTypeSupported(type) : false);
    const preferred = pickRecordingMimeType(isSupported);
    const attempts: MediaRecorderOptions[] = preferred
      ? [{ mimeType: preferred, audioBitsPerSecond: 32_000 }, { mimeType: preferred }]
      : [{}];
    let lastError: unknown = null;
    for (const options of attempts) {
      try {
        const recorder = new Recorder(stream, options);
        if (!preferred && !uploadMimeType(recorder.mimeType)) {
          throw namedError('NotSupportedError', 'Recording format not accepted for transcription');
        }
        return recorder;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : namedError('NotSupportedError', 'No supported recording format');
  }

  /** Stops and returns the clip (null if nothing was recorded). Safe to call twice. */
  stop(): Promise<Recording | null> {
    if (this.stopping) return this.stopping;
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve(null);
    this.stopping = new Promise<Recording | null>((resolve) => {
      recorder.onstop = () => {
        const mimeType = uploadMimeType(recorder.mimeType) || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationMs = this.deps.now() - this.startedAt;
        this.release();
        resolve(blob.size > 0 ? { blob, mimeType, durationMs } : null);
      };
      try {
        recorder.stop();
      } catch {
        this.release();
        resolve(null);
      }
    }).finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }

  /** Discards the recording and frees the microphone; also aborts a start still waiting for permission. */
  cancel(): void {
    this.cancelled = true;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      try {
        if (this.recorder.state !== 'inactive') this.recorder.stop();
      } catch {
        // already stopped
      }
    }
    this.release();
  }

  private release(): void {
    if (this.limitTimer !== null) this.deps.clearTimeout(this.limitTimer);
    this.limitTimer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}

/** A tiny silent WAV, played inside a click so later answers may auto-play. */
function silentWavUrl(): string {
  const samples = 800;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, 'data');
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i += 1) view.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export type SpeechFetcher = (text: string, languageCode: string) => Promise<{ audio: string; mimeType: string }>;

export interface PlayerState {
  /** Key of the clip playing now, or loading if `loading` is true. */
  key: string | null;
  loading: boolean;
}

/** Plays answers through one shared audio element; caches clips by text and language. */
export class VoicePlayer {
  private audio: HTMLAudioElement | null = null;
  private clips = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private listeners = new Set<(state: PlayerState) => void>();
  private state: PlayerState = { key: null, loading: false };
  private request = 0;

  static keyFor(text: string, languageCode: string): string {
    return `${languageCode}|${text}`;
  }

  /** Whether this text is the one playing or loading now (a second click stops it). */
  isCurrent(text: string, languageCode: string): boolean {
    return this.state.key === VoicePlayer.keyFor(text, languageCode);
  }

  subscribe(listener: (state: PlayerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: PlayerState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
  }

  private element(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'auto';
      this.audio.onended = () => this.setState({ key: null, loading: false });
      this.audio.onerror = () => this.setState({ key: null, loading: false });
    }
    return this.audio;
  }

  /**
   * Call inside a click: browsers only allow sound that follows a user gesture,
   * and the answer arrives seconds later.
   */
  unlock(): void {
    const audio = this.element();
    if (audio.dataset.unlocked) return;
    const url = silentWavUrl();
    audio.src = url;
    audio.play()
      .then(() => {
        audio.dataset.unlocked = 'true';
      })
      .catch(() => undefined)
      .finally(() => URL.revokeObjectURL(url));
  }

  private async clipUrl(text: string, languageCode: string, fetcher: SpeechFetcher): Promise<string> {
    const key = VoicePlayer.keyFor(text, languageCode);
    const cached = this.clips.get(key);
    if (cached) return cached;
    let work = this.pending.get(key);
    if (!work) {
      work = fetcher(text, languageCode)
        .then(({ audio, mimeType }) => {
          const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'audio/mpeg' }));
          this.clips.set(key, url);
          if (this.clips.size > MAX_CACHED_CLIPS) {
            const [oldestKey, oldestUrl] = this.clips.entries().next().value as [string, string];
            this.clips.delete(oldestKey);
            URL.revokeObjectURL(oldestUrl);
          }
          return url;
        })
        .finally(() => this.pending.delete(key));
      this.pending.set(key, work);
    }
    return work;
  }

  /** Plays the text (fetching it once). A newer play or stop() wins over an older one. */
  async play(text: string, languageCode: string, fetcher: SpeechFetcher): Promise<void> {
    const key = VoicePlayer.keyFor(text, languageCode);
    const request = ++this.request;
    this.pauseOnly();
    this.setState({ key, loading: true });
    try {
      const url = await this.clipUrl(text, languageCode, fetcher);
      if (request !== this.request) return;
      const audio = this.element();
      audio.src = url;
      this.setState({ key, loading: false });
      await audio.play();
    } catch (error) {
      if (request === this.request) this.setState({ key: null, loading: false });
      throw error;
    }
  }

  stop(): void {
    this.request += 1;
    this.pauseOnly();
    this.setState({ key: null, loading: false });
  }

  private pauseOnly(): void {
    if (this.audio && !this.audio.paused) this.audio.pause();
  }
}

/** One player for the whole app, so only one answer speaks at a time. */
export const voicePlayer = new VoicePlayer();
