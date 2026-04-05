import type {
  KeyEventType,
  RecordOptions,
  RecordingSession,
  ShortcutRecording,
} from "../types/public";
import type { NormalizedKeyEvent, ErrorInfo } from "../types/public";
import type { RecordingState } from "../types/internal";
import { isWithinBoundary } from "../events/isWithinBoundary";
import { MODIFIER_KEY_NAMES } from "../types/internal";

export class RecordStateController {
  private state: RecordingState | null = null;

  start(
    runtimeTarget: Document | HTMLElement,
    sequenceTimeout: number,
    options: RecordOptions | undefined,
  ): RecordingSession {
    if (this.state) {
      throw new TypeError("A recording session is already active");
    }

    const eventType = options?.eventType ?? "keydown";
    const timeout = options?.timeout ?? sequenceTimeout;
    const suppressHandlers = options?.suppressHandlers ?? true;
    const consumeEvents = options?.consumeEvents ?? false;
    const target = options?.target ?? runtimeTarget;
    const onUpdate = options?.onUpdate;

    let resolveFinished: ((recording: ShortcutRecording) => void) | null = null;
    let rejectFinished: ((error: Error) => void) | null = null;
    const finished = new Promise<ShortcutRecording>((resolve, reject) => {
      resolveFinished = resolve;
      rejectFinished = reject;
    });

    const finish = (recording: ShortcutRecording): void => {
      if (!this.state || this.state.settled) {
        return;
      }
      this.clearTimer(this.state);
      this.state.settled = true;
      this.state = null;
      resolveFinished?.(recording);
    };

    const fail = (error: Error): void => {
      if (!this.state || this.state.settled) {
        return;
      }
      this.clearTimer(this.state);
      this.state.settled = true;
      this.state = null;
      rejectFinished?.(error);
    };

    this.state = {
      eventType,
      timeout,
      suppressHandlers,
      consumeEvents,
      target,
      steps: [],
      onUpdate,
      timer: null,
      settled: false,
      finish,
      fail,
    };

    return {
      stop: () => {
        const active = this.state;
        if (!active) {
          return finalizeRecording([], eventType);
        }
        const recording = finalizeRecording(active.steps, eventType);
        active.finish(recording);
        return recording;
      },
      cancel: () => {
        this.state?.fail(createAbortError());
      },
      finished,
    };
  }

  handle(
    normalized: NormalizedKeyEvent,
    nativeEvent: KeyboardEvent,
    mutate: boolean,
    onError: ((error: unknown, info: ErrorInfo) => void) | undefined,
  ): { intercepted: boolean } {
    const active = this.state;
    if (!active) {
      return { intercepted: false };
    }
    if (!isWithinBoundary(active.target, nativeEvent)) {
      return { intercepted: false };
    }

    const maybeStep = normalized.type === active.eventType ? stepFromEvent(normalized) : null;
    const captured = maybeStep != null;

    if (captured && mutate) {
      try {
        active.steps.push(maybeStep);
        active.onUpdate?.(finalizeRecording(active.steps, active.eventType));
        this.restartTimer(active);
      } catch (error) {
        onError?.(error, { phase: "recording", event: normalized });
      }
    }

    if (captured && active.consumeEvents && mutate) {
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();
    }

    return { intercepted: active.suppressHandlers };
  }

  isRecording(): boolean {
    return this.state != null;
  }

  dispose(): void {
    if (!this.state) {
      return;
    }
    this.state.fail(createAbortError());
    this.state = null;
  }

  private restartTimer(active: RecordingState): void {
    this.clearTimer(active);
    active.timer = setTimeout(() => {
      const recording = finalizeRecording(active.steps, active.eventType);
      active.finish(recording);
    }, active.timeout);
  }

  private clearTimer(active: RecordingState): void {
    if (active.timer) {
      clearTimeout(active.timer);
      active.timer = null;
    }
  }
}

function stepFromEvent(event: NormalizedKeyEvent): string | null {
  const key = event.key;
  if (MODIFIER_KEY_NAMES.has(key)) {
    return null;
  }
  const modifiers: string[] = [];
  if (event.modifiers.ctrl) modifiers.push("Ctrl");
  if (event.modifiers.meta) modifiers.push("Meta");
  if (event.modifiers.alt) modifiers.push("Alt");
  if (event.modifiers.shift) modifiers.push("Shift");
  return [...modifiers, key].join("+");
}

function finalizeRecording(steps: readonly string[], eventType: KeyEventType): ShortcutRecording {
  const frozenSteps = Object.freeze([...steps]) as readonly string[];
  return Object.freeze({
    steps: frozenSteps,
    expression: frozenSteps.join(" "),
    eventType,
  });
}

function createAbortError(): Error {
  try {
    return new DOMException("Recording cancelled", "AbortError");
  } catch {
    const error = new Error("Recording cancelled");
    error.name = "AbortError";
    return error;
  }
}
