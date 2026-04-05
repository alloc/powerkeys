# Sigma Keys Technical Design

## Summary

`sigma-keys` is a browser-only keyboard shortcut runtime for modern web applications.

It is designed around five separate concerns:

- event normalization: determine what key event happened
- scope activation: determine where bindings are allowed to compete
- pattern matching: determine which combos or sequences match the event
- `when` evaluation: determine whether a matched binding is currently eligible
- conflict resolution: determine which eligible binding wins

The package does not preserve Combokeys or Mousetrap behavior. It is a clean-slate design.

`when` clauses are compiled and evaluated with [`@casbin/expression-eval`](https://npmjs.org/package/@casbin/expression-eval), using the APIs described in [expression-eval-readme.md](/Users/alec/dev/alloc/sigma-keys/expression-eval-readme.md).

## Goals

- Provide a small runtime for browser keyboard shortcuts based on `KeyboardEvent.key`, `KeyboardEvent.code`, `keydown`, and `keyup`
- Support single-key bindings, modifier combos, and multi-step sequences in one coherent model
- Support VS Code-style `when` clauses backed by a context store
- Make scope precedence explicit instead of hiding it in DOM behavior or registration order
- Make runtime decisions explainable and testable
- Provide first-class recording for user-defined shortcuts

## Non-goals

- Compatibility with Combokeys, Mousetrap, or `keypress`-era APIs
- Sandboxing of untrusted `when` expressions
- A plugin system based on runtime monkey-patching
- Desktop-native key abstraction beyond what browsers expose
- A full command framework or application state container

## Design decisions

- The default matching event is `keydown`
- Binding strings are semantic, not physical; day one uses `KeyboardEvent.key`
- `Mod` is resolved at bind time to `Meta` on Apple platforms and `Ctrl` elsewhere
- `when` expressions are configuration, not a security boundary
- Only one binding dispatches per event
- Recording mode is a first-class runtime feature

## Terminology

`Runtime`
: A `ShortcutRuntime` instance attached to a `Document` or `HTMLElement`.

`Binding`
: A registered combo or sequence with metadata such as scope, priority, and `when`.

`Combo`
: A single key step, optionally preceded by modifiers, for example `Mod+k` or `Shift+Enter`.

`Sequence`
: An ordered list of combo steps separated by spaces, for example `g i` or `Mod+k c`.

`Scope`
: A logical activation name such as `root`, `editor`, `modal`, or `palette`.

`Context key`
: A dot-path value stored in the runtime and used by `when` expressions, for example `editor.hasSelection`.

`Recording`
: A temporary mode that captures normalized shortcut steps and returns a canonical shortcut expression.

## Public API

### `createShortcuts(options)`

```ts
type ShortcutOptions = {
  target: Document | HTMLElement;
  sequenceTimeout?: number;
  editablePolicy?: "ignore-editable" | "allow-in-editable" | "allow-if-meta";
  getActiveScopes?: () => Iterable<string>;
  onError?: (error: unknown, info: ErrorInfo) => void;
};
```

Semantics:

- `target` is required and defines the event boundary for the runtime.
- `sequenceTimeout` defaults to `1000` milliseconds.
- `editablePolicy` is the runtime default for bindings that do not override it.
- `getActiveScopes()` returns active scopes in descending precedence order.
- `onError` receives handler failures and internal non-fatal runtime errors.

Returns a `ShortcutRuntime`.

### Core public types

```ts
type ShortcutHandler = (match: ShortcutMatch) => void;

type BindingHandle = {
  id: string;
  dispose(): boolean;
};

type ShortcutMatch = {
  bindingId: string;
  combo: string;
  sequence?: string;
  event: NormalizedKeyEvent;
  context: Record<string, unknown>;
  matchedScope: string;
};

type ErrorInfo = {
  phase: "handler" | "recording";
  bindingId?: string;
  event?: NormalizedKeyEvent;
};
```

Semantics:

- `BindingHandle.id` is unique per runtime.
- `BindingHandle.dispose()` removes the binding and returns `true` if it was still active.
- `ShortcutHandler` is synchronous from the runtime's perspective. Returned values are ignored.

### `ShortcutRuntime`

```ts
type ShortcutRuntime = {
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
```

Method contracts:

- `bind()` compiles and registers a binding. Invalid input throws `TypeError`.
- `unbind()` accepts a handle or binding id and returns `true` only if a binding was removed.
- `pause()` increments a pause counter for a scope. Omitted scope means all scopes.
- `resume()` decrements the pause counter for a scope down to zero. Extra resumes are no-ops.
- `record()` starts a recording session. If a recording session is already active on the runtime, it throws.
- `setContext()` sets or replaces the value at a dot-path.
- `getContext()` returns the value or subtree at a dot-path, or `undefined`.
- `deleteContext()` deletes the subtree rooted at a dot-path.
- `batchContext()` applies multiple `setContext()` operations as one logical update.
- `getBindings()` returns immutable snapshots, not live records.
- `getActiveSequences()` returns immutable snapshots of in-progress sequences.
- `explain()` performs evaluation without dispatching handlers or mutating runtime state.
- `dispose()` is idempotent and removes listeners, bindings, sequence state, pause state, and any active recording session.

### Binding input

```ts
type BindingInput =
  | string
  | {
      combo?: string;
      sequence?: string;
      scope?: string | string[];
      when?: string;
      keyEvent?: "keydown" | "keyup";
      priority?: number;
      editablePolicy?: "inherit" | "ignore-editable" | "allow-in-editable" | "allow-if-meta";
      preventDefault?: boolean;
      stopPropagation?: boolean;
      allowRepeat?: boolean;
      handler: ShortcutHandler;
    };
```

Rules:

- A string input is shorthand for `{ combo: string, handler }`.
- Exactly one of `combo` or `sequence` is required.
- `keyEvent` defaults to `keydown`.
- `scope` defaults to `'root'`.
- `when` defaults to `true`.
- `priority` defaults to `0`.
- `editablePolicy: 'inherit'` means "use the runtime default".
- `preventDefault` and `stopPropagation` default to `false`.
- `allowRepeat` defaults to `false`.
- Passing both an inline `handler` and a second `handler` argument throws `TypeError`.

### Recording API

```ts
type RecordOptions = {
  eventType?: "keydown" | "keyup";
  timeout?: number;
  suppressHandlers?: boolean;
  consumeEvents?: boolean;
  target?: Document | HTMLElement;
};

type RecordingSession = {
  stop(): ShortcutRecording;
  cancel(): void;
  finished: Promise<ShortcutRecording>;
};

type ShortcutRecording = {
  steps: readonly string[];
  expression: string;
  eventType: "keydown" | "keyup";
};
```

Semantics:

- `eventType` defaults to `keydown`.
- `timeout` defaults to the runtime's `sequenceTimeout`.
- `suppressHandlers` defaults to `true`.
- `consumeEvents` defaults to `false`.
- `target` defaults to the runtime target.
- `stop()` finalizes the recording immediately and returns the same immutable object that resolves `finished`.
- `cancel()` aborts recording. `finished` rejects with `AbortError`.
- `stop()` and `cancel()` are idempotent after settlement.

## Binding grammar

### Combo grammar

A combo is one primary key plus zero or more modifiers joined by `+`.

Examples:

- `Mod+k`
- `Shift+Enter`
- `Alt+/`

Rules:

- Modifiers are `Alt`, `Ctrl`, `Meta`, `Shift`, and `Mod`.
- Day one does not support physical-key syntax such as `code:KeyK`.
- Matching is case-insensitive at registration time.
- Canonical output order is `Ctrl`, `Meta`, `Alt`, `Shift`, then primary key.
- `Mod` is resolved at compile time and does not appear in canonical output.
- A combo with zero primary keys or multiple primary keys is invalid.

### Sequence grammar

A sequence is one or more combo steps separated by single spaces.

Examples:

- `g i`
- `Mod+k c`
- `Shift+Enter Escape`

Rules:

- Empty steps are invalid.
- Canonical sequence output joins canonical combo steps with single spaces.

## Runtime semantics

### Event boundary

The runtime only processes events within its target boundary.

Rules:

- If `target` is a `Document`, all keyboard events received by that document are eligible for evaluation.
- If `target` is an `HTMLElement`, the event must originate from within that element's composed subtree.
- Boundary checks use `event.composedPath()` when available and DOM containment checks otherwise.
- Nested runtimes are allowed. Each runtime evaluates independently against its own boundary.

### Event normalization

Raw DOM keyboard events are normalized into a stable internal shape.

```ts
type NormalizedKeyEvent = {
  type: "keydown" | "keyup";
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
```

Normalization rules:

- `key` comes from `event.key`
- `code` comes from `event.code`
- modifier flags come from the native event
- printable keys are preserved semantically
- `Escape`, `Enter`, arrow keys, and other named keys retain their browser semantic names
- matching ignores pure modifier keydown events unless a binding explicitly targets a modifier as the primary key

### Scope model

Scopes are logical activation names, not DOM selectors.

Rules:

- `'root'` is always active and always has the lowest precedence.
- `getActiveScopes()` returns active scopes in highest-to-lowest precedence order.
- Callers must not return `'root'`; the runtime appends it automatically.
- A binding matches if at least one of its declared scopes is active.
- If a binding declares multiple scopes, the highest-precedence active scope becomes its `matchedScope`.

Scope precedence is used during conflict resolution. This avoids ambiguous terms like "more specific scope".

### Editable-target policy

Editable policy is applied before matching.

An editable target is:

- `input`
- `textarea`
- `select`
- any content-editable element

Policy behavior:

- `ignore-editable`: reject the binding when the target is editable
- `allow-in-editable`: permit normal matching
- `allow-if-meta`: permit matching only if `Meta` or `Ctrl` is pressed

Binding-level policy overrides runtime default policy.

### Sequence model

Sequences are tracked explicitly as state machine entries.

```ts
type SequenceSnapshot = {
  bindingId: string;
  matchedScope: string;
  stepIndex: number;
  expiresAt: number;
};
```

Rules:

- The first matching step creates a sequence state.
- A state advances only on events of the binding's `keyEvent` type.
- Events of the other type are ignored by the sequence machine.
- If the next step matches, the state advances and its deadline is refreshed.
- If an event of the binding's `keyEvent` type does not match the next step, the state is removed.
- If the state reaches its final step, it produces a sequence-completion candidate and is then removed.
- States expire after `sequenceTimeout` milliseconds without a matching next step.
- `repeat` events do not advance states unless `allowRepeat` is true on the binding.

## `when` clause design

### Why `expression-eval`

`@casbin/expression-eval` is the package's primary runtime dependency for `when` evaluation because it provides:

- `parse(expression)` for validation and AST access
- `compile(expression)` for compile-once/evaluate-many performance
- expression semantics that are sufficient for VS Code-style boolean eligibility checks

The runtime does not define a second expression language on top of it.

### `when` syntax

Examples:

```txt
editor.focus && !editor.readOnly
editor.hasSelection && pane.active == "mail"
modal.open && modal.kind == "rename"
git.stageVisible || scm.focus
event.ctrl && !runtime.recording
```

Rules:

- `when` expressions are compiled at bind time
- syntax errors throw `TypeError` from `bind()`
- runtime evaluation errors are treated as non-matches
- the runtime does not inject helper functions or globals

### Context model

Context keys are stored as a nested object assembled from dot-path keys.

Examples:

```ts
runtime.setContext("editor.focus", true);
runtime.setContext("editor.hasSelection", false);
runtime.setContext("pane.active", "mail");
```

This produces a context tree equivalent to:

```ts
{
  editor: {
    focus: true,
    hasSelection: false,
  },
  pane: {
    active: 'mail',
  },
}
```

### Reserved namespaces

These top-level names are reserved:

- `context`
- `event`
- `scope`
- `runtime`

Rules:

- `setContext()` rejects paths whose first segment is reserved
- user context is available both under `context.*` and mirrored at the top level
- built-in namespaces always win over user data because collisions are rejected

### `when` evaluation context

Each `when` clause is evaluated against an object with these fields:

```ts
{
  context: { ...userContext },
  event: {
    key,
    code,
    repeat,
    composing,
    alt,
    ctrl,
    meta,
    shift,
  },
  scope: {
    active: ['modal', 'editor', 'root'],
    matched: 'editor',
  },
  runtime: {
    platform: 'mac' | 'windows' | 'linux' | 'other',
    recording: boolean,
  },

  ...userContext
}
```

The top-level mirroring exists only for user context. Built-in namespaces are not mirrored further.

### Compilation strategy

At bind time:

1. store the original `when` source
2. call `parse(source)` to validate syntax and retain the AST
3. call `compile(source)` to produce the evaluator

```ts
import { parse, compile } from "@casbin/expression-eval";

function compileWhenClause(source: string): CompiledWhenClause {
  const ast = parse(source);
  const evaluateRaw = compile(source);

  return {
    source,
    ast,
    evaluate(context) {
      return !!evaluateRaw(context);
    },
  };
}
```

### Trust model

`expression-eval` explicitly does not promise sandboxing. `sigma-keys` adopts the same stance.

Implications:

- `when` expressions are trusted application configuration
- untrusted user-authored expressions are out of scope
- host applications that need sandboxing must add it outside `sigma-keys`

### Matching and dispatch pipeline

Each runtime event is processed in this order:

1. boundary check
2. event normalization
3. active recording check
4. editable-target policy check
5. scope resolution
6. pause filter
7. combo matching and sequence-state advancement
8. `when` evaluation on surviving candidates
9. conflict resolution
10. event consumption (`preventDefault` / `stopPropagation`)
11. handler dispatch

Only one binding may dispatch per event.

### Pause semantics

Pause is reference-counted per scope.

Rules:

- `pause()` with no scope pauses all scopes
- `pause('editor')` pauses bindings only when their highest-precedence active scope would be `editor`
- paused scopes are removed from the active-scope list before matcher evaluation
- paused scopes do not dispatch and do not advance sequence state
- `resume()` decrements the corresponding pause counter
- pause counters never go below zero

This means "paused" always means fully inactive for matching purposes.

### Conflict resolution

If multiple candidates survive matching and `when`, winner selection is deterministic:

1. higher `priority`
2. sequence completion over plain combo
3. longer sequence length
4. higher scope precedence, using the index from `getActiveScopes()`
5. newer registration

Because step 4 is based on ordered active scopes, scope precedence is explicit and implementation-safe.

### Dispatch semantics

Dispatch rules:

- exactly one handler runs for a winning candidate
- `preventDefault` and `stopPropagation` are applied before handler invocation
- handler return values are ignored
- handler exceptions are caught and passed to `onError`
- if `onError` is absent, the error is re-thrown in a microtask so it is visible during development without corrupting runtime state

The runtime never awaits handlers.

### Observability

The runtime exposes non-mutating inspection APIs from the start.

```ts
type BindingSnapshot = {
  id: string;
  type: "combo" | "sequence";
  expression: string;
  scopes: readonly string[];
  priority: number;
  keyEvent: "keydown" | "keyup";
  whenSource?: string;
};

type WhenTrace = {
  source: string;
  result: boolean;
  error?: Error;
};

type CandidateTrace = {
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

type EvaluationTrace = {
  event: NormalizedKeyEvent;
  candidates: CandidateTrace[];
  winner?: string;
};
```

`explain(event)` uses the same pipeline as real evaluation but does not mutate sequence state, recording state, pause state, or dispatch handlers.

### Recording mode

Recording is a first-class runtime feature for user shortcut customization.

Rules:

- only one recording session may be active per runtime
- recording listens to the same normalized event stream as matching
- recorded steps use the same canonicalization logic as `bind()`
- if `suppressHandlers` is `true`, events inside the recording target do not dispatch handlers and do not advance sequence state
- if `consumeEvents` is `true`, the runtime calls `preventDefault` and `stopPropagation` for recorded events inside the recording target
- automatic completion occurs after `timeout` milliseconds with no additional recorded step
- `steps` is the canonical list of recorded combo steps
- `expression` is `steps.join(' ')`

Example:

```ts
const session = shortcuts.record({
  timeout: 1200,
  suppressHandlers: true,
});

const recording = await session.finished;
// recording.steps => ['Meta+k', 'c']
// recording.expression => 'Meta+k c'
```

Recording is implemented as a parallel consumer of normalized events, not by replacing the main dispatch function.

### Failure handling

Synchronous failures:

- invalid combo syntax in `bind()`
- invalid sequence syntax in `bind()`
- invalid `when` syntax in `bind()`
- reserved context path in `setContext()`
- starting a second recording session while one is active

These throw immediately.

Runtime failures:

- `when` evaluation errors become non-matches and are captured in traces
- handler errors are passed to `onError`
- recording errors are passed to `onError`

The runtime should remain internally consistent after any non-fatal failure.

## Internal module layout

Recommended source layout:

```txt
src/
  index.ts
  runtime/
    createRuntime.ts
    dispatch.ts
    explain.ts
    pauseState.ts
    recordState.ts
  events/
    normalizeKeyboardEvent.ts
    isWithinBoundary.ts
    isEditableTarget.ts
  bindings/
    parseCombo.ts
    parseSequence.ts
    compileBinding.ts
    canonicalizeStep.ts
  when/
    compileWhenClause.ts
    buildWhenContext.ts
  scopes/
    resolveActiveScopes.ts
  sequences/
    SequenceMachine.ts
  types/
    public.ts
    internal.ts
```

## Testing strategy

Unit tests should cover:

- combo parsing and canonicalization
- sequence parsing and canonicalization
- invalid binding rejection
- event normalization
- boundary checks
- editable-target policy
- scope resolution and precedence
- pause semantics
- sequence state transitions and expiry
- `when` parse failure
- `when` evaluation over nested context keys
- `when` reserved-namespace rejection
- conflict resolution
- recording canonicalization
- `explain()` trace output

Integration tests should cover:

- overlapping sequences with shared prefixes
- a combo and a sequence completing on the same event
- the same combo in multiple scopes with different precedence
- recording with and without `suppressHandlers`
- nested runtimes with overlapping boundaries
- editable-target behavior with per-binding overrides

## Deferred extensions

These are intentionally out of the initial design, but the structure should allow them later:

- physical-key syntax based on `KeyboardEvent.code`
- custom editable-target predicates
- runtime hooks for instrumentation
- reactive subscriptions to context changes

## Recommendation

Build `sigma-keys` as a small runtime with:

- `keydown`-first matching
- semantic combo and sequence strings
- ordered logical scopes
- explicit sequence state
- first-class editable policy
- `@casbin/expression-eval` for compiled `when` clauses
- first-class recording
- traceable decisions

This is the minimum design that is both implementation-safe and product-useful.
