import type {
  EditablePolicy,
  EvaluationTrace,
  KeyEventType,
  ShortcutHandler,
  ShortcutRecording,
  WhenTrace,
} from "./public";

export type Platform = "mac" | "windows" | "linux" | "other";
export type ModifierName = "Ctrl" | "Meta" | "Alt" | "Shift";
export type ParsedModifierName = ModifierName | "Mod";

export type CompiledStep = {
  key: string;
  modifiers: readonly ModifierName[];
  expression: string;
};

export type CompiledWhenClause = {
  source: string;
  ast: unknown;
  evaluate(context: Record<string, unknown>): boolean;
};

export type BindingRecord = {
  id: string;
  order: number;
  type: "combo" | "sequence";
  expression: string;
  keyEvent: KeyEventType;
  scopes: readonly string[];
  priority: number;
  editablePolicy: EditablePolicy;
  preventDefault: boolean;
  stopPropagation: boolean;
  allowRepeat: boolean;
  steps: readonly CompiledStep[];
  whenSource?: string;
  when?: CompiledWhenClause;
  handler: ShortcutHandler;
};

export type SequenceState = {
  bindingId: string;
  binding: BindingRecord;
  matchedScope: string;
  stepIndex: number;
  expiresAt: number;
};

export type Candidate = {
  binding: BindingRecord;
  matchedScope: string;
  kind: "combo" | "sequence";
  sequenceLength: number;
  when?: WhenTrace;
};

export type RecordingState = {
  eventType: KeyEventType;
  timeout: number;
  suppressHandlers: boolean;
  consumeEvents: boolean;
  target: Document | HTMLElement;
  steps: string[];
  onUpdate?: (recording: ShortcutRecording) => void;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
  finish(recording: ShortcutRecording): void;
  fail(error: Error): void;
};

export type EvaluateResult = {
  trace: EvaluationTrace;
  winner?: Candidate;
};

export const RESERVED_CONTEXT_NAMES = new Set(["context", "event", "scope", "runtime"]);
export const MODIFIER_ORDER: readonly ModifierName[] = ["Ctrl", "Meta", "Alt", "Shift"];
export const MODIFIER_KEY_NAMES = new Set(["Ctrl", "Meta", "Alt", "Shift"]);
