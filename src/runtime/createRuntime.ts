import { compileBinding } from "../bindings/compileBinding";
import { isWithinBoundary } from "../events/isWithinBoundary";
import { normalizeKeyboardEvent } from "../events/normalizeKeyboardEvent";
import { chooseWinner, evaluateEditablePolicy, applyConsumption, matchesStep } from "./dispatch";
import { PauseState } from "./pauseState";
import { RecordStateController } from "./recordState";
import { detectPlatform } from "./platform";
import { resolveActiveScopes, pickMatchedScope } from "../scopes/resolveActiveScopes";
import { SequenceMachine } from "../sequences/SequenceMachine";
import { buildWhenContext } from "../when/buildWhenContext";
import type {
  BindingHandle,
  BindingInput,
  BindingSnapshot,
  CandidateTrace,
  ErrorInfo,
  EvaluationTrace,
  RecordOptions,
  RecordingSession,
  ShortcutHandler,
  ShortcutOptions,
  ShortcutRuntime,
  WhenTrace,
} from "../types/public";
import type { BindingRecord, Candidate, EvaluateResult } from "../types/internal";
import { RESERVED_CONTEXT_NAMES } from "../types/internal";

export function createShortcuts(options: ShortcutOptions): ShortcutRuntime {
  const runtimeTarget = options.target;
  const sequenceTimeout = options.sequenceTimeout ?? 1000;
  const defaultEditablePolicy = options.editablePolicy ?? "ignore-editable";
  const getActiveScopes = options.getActiveScopes;
  const onError = options.onError;
  const platform = detectPlatform();

  const bindings = new Map<string, BindingRecord>();
  const bindingOrder: string[] = [];
  const pauseState = new PauseState();
  const recordState = new RecordStateController();
  const sequenceMachine = new SequenceMachine();
  let disposed = false;
  let nextBindingId = 1;
  let nextBindingOrder = 1;
  let userContext: Record<string, unknown> = {};

  const handleNativeEvent = (event: KeyboardEvent): void => {
    if (!disposed) {
      evaluateKeyboardEvent(event, true);
    }
  };

  runtimeTarget.addEventListener("keydown", handleNativeEvent);
  runtimeTarget.addEventListener("keyup", handleNativeEvent);

  function bind(input: BindingInput, handler?: ShortcutHandler): BindingHandle {
    ensureNotDisposed();
    const compiled = compileBinding({
      input,
      handler,
      id: `binding-${nextBindingId++}`,
      order: nextBindingOrder++,
      defaultEditablePolicy,
      platform,
    });

    bindings.set(compiled.id, compiled);
    bindingOrder.push(compiled.id);

    return {
      id: compiled.id,
      dispose() {
        return unbind(compiled.id);
      },
    };
  }

  function unbind(binding: BindingHandle | string): boolean {
    const id = typeof binding === "string" ? binding : binding.id;
    const existed = bindings.delete(id);
    if (!existed) {
      return false;
    }
    sequenceMachine.removeBinding(id);
    const index = bindingOrder.indexOf(id);
    if (index >= 0) {
      bindingOrder.splice(index, 1);
    }
    return true;
  }

  function pause(scope?: string): void {
    ensureNotDisposed();
    pauseState.pause(scope);
  }

  function resume(scope?: string): void {
    pauseState.resume(scope);
  }

  function record(options?: RecordOptions): RecordingSession {
    ensureNotDisposed();
    return recordState.start(runtimeTarget, sequenceTimeout, options);
  }

  function setContext(path: string, value: unknown): void {
    ensureNotDisposed();
    const segments = splitPath(path);
    if (segments.length === 0) {
      throw new TypeError("Context path must not be empty");
    }
    if (RESERVED_CONTEXT_NAMES.has(segments[0]!)) {
      throw new TypeError(`Context path "${path}" uses a reserved namespace`);
    }
    userContext = cloneContextTree(userContext);
    setNestedValue(userContext, segments, value);
  }

  function getContext(path: string): unknown {
    const segments = splitPath(path);
    if (segments.length === 0) {
      return undefined;
    }
    return getNestedValue(userContext, segments);
  }

  function deleteContext(path: string): boolean {
    ensureNotDisposed();
    const segments = splitPath(path);
    if (segments.length === 0) {
      return false;
    }
    if (RESERVED_CONTEXT_NAMES.has(segments[0]!)) {
      throw new TypeError(`Context path "${path}" uses a reserved namespace`);
    }
    userContext = cloneContextTree(userContext);
    return deleteNestedValue(userContext, segments);
  }

  function batchContext(update: Record<string, unknown>): void {
    ensureNotDisposed();
    const nextContext = cloneContextTree(userContext);
    for (const [path, value] of Object.entries(update)) {
      const segments = splitPath(path);
      if (segments.length === 0) {
        continue;
      }
      if (RESERVED_CONTEXT_NAMES.has(segments[0]!)) {
        throw new TypeError(`Context path "${path}" uses a reserved namespace`);
      }
      setNestedValue(nextContext, segments, value);
    }
    userContext = nextContext;
  }

  function getBindings(): readonly BindingSnapshot[] {
    return getBindingRecords().map((binding) => ({
      id: binding.id,
      type: binding.type,
      expression: binding.expression,
      scopes: [...binding.scopes],
      priority: binding.priority,
      keyEvent: binding.keyEvent,
      whenSource: binding.whenSource,
    }));
  }

  function getActiveSequences() {
    return sequenceMachine.snapshots(Date.now());
  }

  function explain(event: KeyboardEvent): EvaluationTrace {
    return evaluateKeyboardEvent(event, false).trace;
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    runtimeTarget.removeEventListener("keydown", handleNativeEvent);
    runtimeTarget.removeEventListener("keyup", handleNativeEvent);
    bindings.clear();
    bindingOrder.length = 0;
    sequenceMachine.clear();
    pauseState.clear();
    recordState.dispose();
    userContext = {};
  }

  function evaluateKeyboardEvent(nativeEvent: KeyboardEvent, mutate: boolean): EvaluateResult {
    const boundaryMatched = isWithinBoundary(runtimeTarget, nativeEvent);
    const normalized = normalizeKeyboardEvent(nativeEvent);
    if (!boundaryMatched) {
      return { trace: { event: normalized, candidates: [] } };
    }

    const now = Date.now();
    if (mutate) {
      sequenceMachine.prune(now);
    }

    const traceCandidates = new Map<string, CandidateTrace>();
    const recordingIntercepted = recordState.handle(normalized, nativeEvent, mutate, onError);
    if (recordingIntercepted.intercepted) {
      return { trace: { event: normalized, candidates: [] } };
    }

    const activeScopes = resolveActiveScopes(getActiveScopes);
    const activeScopesAfterPause = pauseState.applyToScopes(activeScopes);
    const sourceStates = sequenceMachine.cloneActive(now, activeScopesAfterPause);
    const nextStates = [] as ReturnType<typeof sequenceMachine.cloneActive>;
    const candidates: Candidate[] = [];

    for (const binding of getBindingRecords()) {
      const matchedScope = pickMatchedScope(binding.scopes, activeScopesAfterPause);
      const trace: CandidateTrace = {
        bindingId: binding.id,
        matchedScope: matchedScope ?? undefined,
        matcherMatched: false,
      };

      if (!matchedScope) {
        trace.rejectedBy = pauseOrScopeRejection(
          binding.scopes,
          activeScopes,
          activeScopesAfterPause,
        );
        traceCandidates.set(binding.id, trace);
        continue;
      }

      const editableResult = evaluateEditablePolicy(
        binding,
        normalized.target,
        normalized.modifiers,
      );
      if (!editableResult.allowed) {
        trace.rejectedBy = "editable-policy";
        traceCandidates.set(binding.id, trace);
        continue;
      }

      if (binding.type === "combo") {
        if (
          binding.keyEvent !== normalized.type ||
          (normalized.repeat && !binding.allowRepeat) ||
          !matchesStep(normalized, binding.steps[0]!)
        ) {
          trace.rejectedBy = "matcher";
          traceCandidates.set(binding.id, trace);
          continue;
        }
        trace.matcherMatched = true;
        candidates.push({
          binding,
          matchedScope,
          kind: "combo",
          sequenceLength: 1,
        });
        traceCandidates.set(binding.id, trace);
        continue;
      }

      const sequenceResult = sequenceMachine.evaluateBinding(
        binding,
        matchedScope,
        normalized,
        now,
        sequenceTimeout,
        sourceStates,
        nextStates,
      );

      if (sequenceResult.producedCandidate) {
        trace.matcherMatched = true;
        candidates.push(sequenceResult.candidate!);
      } else if (!sequenceResult.keptState) {
        trace.rejectedBy = "matcher";
      }
      traceCandidates.set(binding.id, trace);
    }

    const eligibleCandidates: Candidate[] = [];
    for (const candidate of candidates) {
      const trace = traceCandidates.get(candidate.binding.id)!;
      const whenTrace = evaluateWhen(
        candidate.binding,
        normalized,
        activeScopesAfterPause,
        candidate.matchedScope,
      );
      if (whenTrace) {
        trace.when = whenTrace;
        if (!whenTrace.result) {
          trace.rejectedBy = "when";
          continue;
        }
      }
      eligibleCandidates.push(candidate);
    }

    const winner = chooseWinner(eligibleCandidates, activeScopesAfterPause);
    if (winner) {
      for (const candidate of eligibleCandidates) {
        if (candidate.binding.id !== winner.binding.id) {
          const trace = traceCandidates.get(candidate.binding.id);
          if (trace && !trace.rejectedBy) {
            trace.rejectedBy = "conflict";
          }
        }
      }
    }

    if (mutate) {
      sequenceMachine.commit(nextStates);
      if (winner) {
        applyConsumption(winner.binding, nativeEvent);
        dispatchWinner(winner, normalized, activeScopes);
      }
    }

    return {
      winner,
      trace: {
        event: normalized,
        candidates: [...traceCandidates.values()],
        winner: winner?.binding.id,
      },
    };
  }

  function dispatchWinner(
    candidate: Candidate,
    normalized: ReturnType<typeof normalizeKeyboardEvent>,
    activeScopes: readonly string[],
  ): void {
    try {
      candidate.binding.handler({
        bindingId: candidate.binding.id,
        combo: candidate.binding.steps[0]!.expression,
        sequence: candidate.binding.type === "sequence" ? candidate.binding.expression : undefined,
        event: normalized,
        context: buildWhenContext(
          cloneContextTree(userContext),
          normalized,
          activeScopes,
          candidate.matchedScope,
          platform,
          recordState.isRecording(),
        ),
        matchedScope: candidate.matchedScope,
      });
    } catch (error) {
      reportError(error, { phase: "handler", bindingId: candidate.binding.id, event: normalized });
    }
  }

  function evaluateWhen(
    binding: BindingRecord,
    normalized: ReturnType<typeof normalizeKeyboardEvent>,
    activeScopes: readonly string[],
    matchedScope: string,
  ): WhenTrace | undefined {
    if (!binding.when) {
      return undefined;
    }
    const context = buildWhenContext(
      cloneContextTree(userContext),
      normalized,
      activeScopes,
      matchedScope,
      platform,
      recordState.isRecording(),
    );
    try {
      return {
        source: binding.when.source,
        result: binding.when.evaluate(context),
      };
    } catch (error) {
      return {
        source: binding.when.source,
        result: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  function reportError(error: unknown, info: ErrorInfo): void {
    if (onError) {
      onError(error, info);
      return;
    }
    queueMicrotask(() => {
      throw error instanceof Error ? error : new Error(String(error));
    });
  }

  function getBindingRecords(): BindingRecord[] {
    return bindingOrder
      .map((id) => bindings.get(id))
      .filter((binding): binding is BindingRecord => !!binding);
  }

  function ensureNotDisposed(): void {
    if (disposed) {
      throw new TypeError("Shortcut runtime is disposed");
    }
  }

  return {
    bind,
    unbind,
    pause,
    resume,
    record,
    setContext,
    getContext,
    deleteContext,
    batchContext,
    getBindings,
    getActiveSequences,
    explain,
    dispose,
  };
}

function splitPath(path: string): string[] {
  return path
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function setNestedValue(
  root: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): void {
  let cursor: Record<string, unknown> = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const current = cursor[segment];
    if (!isPlainObject(current)) {
      const next: Record<string, unknown> = {};
      cursor[segment] = next;
      cursor = next;
    } else {
      cursor = current;
    }
  }
  cursor[segments[segments.length - 1]!] = value;
}

function getNestedValue(root: Record<string, unknown>, segments: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const segment of segments) {
    if (!isPlainObject(cursor) && !Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function deleteNestedValue(root: Record<string, unknown>, segments: readonly string[]): boolean {
  let cursor: Record<string, unknown> = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const next = cursor[segments[index]!];
    if (!isPlainObject(next)) {
      return false;
    }
    cursor = next;
  }
  const last = segments[segments.length - 1]!;
  if (!(last in cursor)) {
    return false;
  }
  delete cursor[last];
  return true;
}

function cloneContextTree(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = isPlainObject(child) ? cloneContextTree(child) : child;
  }
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pauseOrScopeRejection(
  bindingScopes: readonly string[],
  activeScopes: readonly string[],
  afterPause: readonly string[],
): CandidateTrace["rejectedBy"] {
  if (
    pickMatchedScope(bindingScopes, activeScopes) &&
    !pickMatchedScope(bindingScopes, afterPause)
  ) {
    return "paused";
  }
  return "scope";
}
