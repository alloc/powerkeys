export type EditablePolicy = "ignore-editable" | "allow-in-editable" | "allow-if-meta";
export type KeyEventType = "keydown" | "keyup";

export type ShortcutOptions = {
  target: Document | HTMLElement;
  sequenceTimeout?: number;
  editablePolicy?: EditablePolicy;
  getActiveScopes?: () => Iterable<string>;
  onError?: (error: unknown, info: ErrorInfo) => void;
};

export type ShortcutMatch = {
  bindingId: string;
  combo: string;
  sequence?: string;
  event: NormalizedKeyEvent;
  context: Record<string, unknown>;
  matchedScope: string;
};

export type ShortcutHandler = (match: ShortcutMatch) => void;

export type BindingHandle = {
  id: string;
  dispose(): boolean;
};

export type ErrorInfo = {
  phase: "handler" | "recording";
  bindingId?: string;
  event?: NormalizedKeyEvent;
};

export type RecordOptions = {
  eventType?: KeyEventType;
  timeout?: number;
  suppressHandlers?: boolean;
  consumeEvents?: boolean;
  target?: Document | HTMLElement;
  onUpdate?: (recording: ShortcutRecording) => void;
};

export type RecordingSession = {
  stop(): ShortcutRecording;
  cancel(): void;
  finished: Promise<ShortcutRecording>;
};

export type ShortcutRecording = {
  steps: readonly string[];
  expression: string;
  eventType: KeyEventType;
};

export type BindingInput =
  | string
  | {
      combo?: string;
      sequence?: string;
      scope?: string | string[];
      when?: string;
      keyEvent?: KeyEventType;
      priority?: number;
      editablePolicy?: "inherit" | EditablePolicy;
      preventDefault?: boolean;
      stopPropagation?: boolean;
      allowRepeat?: boolean;
      handler: ShortcutHandler;
    };

export type NormalizedKeyEvent = {
  type: KeyEventType;
  key: string;
  code: string;
  modifiers: {
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
    shift: boolean;
  };
  repeat: boolean;
  composing: boolean;
  target: EventTarget | null;
  nativeEvent: KeyboardEvent;
};

export type BindingSnapshot = {
  id: string;
  type: "combo" | "sequence";
  expression: string;
  scopes: readonly string[];
  priority: number;
  keyEvent: KeyEventType;
  whenSource?: string;
};

export type SequenceSnapshot = {
  bindingId: string;
  matchedScope: string;
  stepIndex: number;
  expiresAt: number;
};

export type WhenTrace = {
  source: string;
  result: boolean;
  error?: Error;
};

export type CandidateTrace = {
  bindingId: string;
  matchedScope?: string;
  matcherMatched: boolean;
  when?: WhenTrace;
  rejectedBy?:
    | "boundary"
    | "recording"
    | "paused"
    | "editable-policy"
    | "scope"
    | "matcher"
    | "when"
    | "conflict";
};

export type EvaluationTrace = {
  event: NormalizedKeyEvent;
  candidates: CandidateTrace[];
  winner?: string;
};

export type ShortcutRuntime = {
  bind(input: BindingInput, handler?: ShortcutHandler): BindingHandle;
  unbind(binding: BindingHandle | string): boolean;
  pause(scope?: string): void;
  resume(scope?: string): void;
  record(options?: RecordOptions): RecordingSession;
  setContext(path: string, value: unknown): void;
  getContext(path: string): unknown;
  deleteContext(path: string): boolean;
  batchContext(update: Record<string, unknown>): void;
  getBindings(): readonly BindingSnapshot[];
  getActiveSequences(): readonly SequenceSnapshot[];
  explain(event: KeyboardEvent): EvaluationTrace;
  dispose(): void;
};
