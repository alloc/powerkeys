# Overview

`powerkeys` is a keyboard runtime for web apps that need more than a few flat
`keydown` listeners. It gives you declarative bindings, layered scopes,
multi-step sequences, `when` clauses, shortcut recording, atomic rebinding
through binding sets, pre-dispatch candidate guards, and a shared availability
check for external actions.

The important boundary is this:

- `powerkeys` owns keyboard matching, dispatch, recording, and evaluation of
  `scope` plus `when`.
- Your app owns commands, command-palette items, UI state, persistence, and any
  metadata such as title, group, search keywords, or active handler ownership.

If you already have a command model, `powerkeys` should plug into it. The usual
shape is to keep the action in your app, reuse its `scope` and `when` when you
attach a shortcut, and call `isAvailable` when a palette or menu needs to know
whether that action currently makes sense. If keyboard dispatch also depends on
whether the active UI layer handles the matched command, keep that check in
`canDispatch` instead of mirroring handler presence into context.

# When to Use

Use `powerkeys` when your app needs one or more of these:

- layered shortcut scopes such as modal over editor over root
- shortcuts that depend on app state such as selection, mode, or read-only
- multi-step sequences such as `g g` or `g i`
- user-recordable shortcut expressions
- shortcuts derived from persisted user preferences or other mutable app state
  that need atomic replacement
- runtime checks that decide whether a matched command is currently handled
- one source of truth for shortcut eligibility and external action availability
- a DOM boundary narrower than the whole document

# When Not to Use

`powerkeys` is a poor fit when you need one or more of these instead:

- OS-level or browser-global shortcuts outside the current document
- a full command system or palette framework that already owns keyboard input
- direct DOM listeners with no meaningful state, scope, or conflict rules
- a library that should own your command registry, menu model, or UI rendering

# Core Abstractions

`ShortcutRuntime`

- Create one with `createShortcuts({ target, ... })`.
- It owns event listeners, binding registration, runtime context, recording, and
  availability checks.

Bindings

- A binding is either one combo such as `Mod+k` or a sequence such as `g g`.
- A binding always has a handler.
- A binding may also declare `scope`, `when`, `priority`,
  `editablePolicy`, `keyEvent`, and event-consumption behavior.

Scopes

- Active scopes come from `getActiveScopes`.
- Earlier scopes have higher precedence.
- `root` is always appended, so unscoped bindings and actions remain eligible.
- Scopes are the coarse filter for "which layer of the app is active right
  now?"

`when` Clauses

- A `when` clause is a boolean expression evaluated against runtime context.
- Use it for finer-grained state such as
  `editor.hasSelection && !editor.readOnly`.
- `when` clauses can be shared between your own action objects and shortcut
  bindings.

Runtime Context

- Write context with `setContext` or `batchContext`.
- Built-in namespaces are `event`, `scope`, `runtime`, and `context`.
- User context is also spread onto the top level, so `editor.hasSelection` is
  readable directly in a `when` clause.

Availability Checks

- `isAvailable({ scope, when })` answers whether an external action is currently
  eligible.
- The input is structural. Extra fields on your own action objects are ignored.
- `isAvailable` evaluates only shared availability concerns. It does not know
  about command ids, palette sections, search text, or rendering.
- For external checks, the `event` namespace is inert: `event.key` and
  `event.code` are `undefined`, and modifier booleans are `false`.

Candidate Dispatch Guards

- `createShortcuts({ canDispatch })` filters candidates after a binding matches
  the keyboard event, scope, editable policy, and `when`.
- The guard runs before winner selection, event consumption, and handler
  execution.
- Returning `false` rejects only that candidate. A lower-priority candidate for
  the same key can still win.
- Use this for callback-owned runtime concerns such as whether the active UI
  layer currently handles the matched command.
- Keep this callback side-effect-free because `explain(event)` evaluates it.
- `isAvailable` does not call `canDispatch`; it remains a shared
  `scope`/`when` availability check for external surfaces.

Recording

- `record()` captures canonical shortcut expressions from live input.
- Recording is separate from registration. The common flow is: record, persist
  the expression, then later bind it directly or swap it into a `BindingSet`.

Binding Sets

- Create one with `shortcuts.createBindingSet()`.
- A binding set owns a mutable collection of bindings that can be replaced as
  one unit.
- `replace(nextBindings)` validates the whole next collection before swapping
  it into place.
- Failed replacement leaves the current bindings unchanged.
- Successful replacement drops any in-progress sequence state owned by the
  previous set contents.

# Data Flow / Lifecycle

1. Create a runtime with a document or element `target`.
2. Keep your app's real state in your app, and mirror only the parts relevant to
   shortcut eligibility into runtime context.
3. Return active scopes from `getActiveScopes` in precedence order.
4. Register bindings with `bind` for static shortcuts or
   `shortcuts.createBindingSet()` for derived shortcut collections that need
   atomic replacement.
5. If your app has its own command or action objects, put shared availability on
   those objects with `scope` and `when`.
6. Reuse that same `scope` and `when` when attaching a keyboard shortcut.
7. Call `isAvailable` when an external surface such as a command palette needs
   to know whether an action should be offered right now.
8. Dispose the runtime when the owning UI subtree or application shuts down.

# Common Tasks -> Recommended APIs

Open a command palette

- `bind({ combo: "Mod+k", preventDefault: true, handler })`

Keep modal shortcuts above editor shortcuts

- `getActiveScopes: () => ["modal", "editor"]`
- Bind modal and editor actions to the same combo with different scopes

Gate a shortcut on app state

- `setContext("editor.hasSelection", true)`
- `bind({ combo: "c", when: "editor.hasSelection", handler })`

Share availability rules with an external command palette

- Put `scope` and `when` on your own action object
- `isAvailable(action)` before rendering or invoking it from the palette
- Reuse that same `scope` and `when` in `bind({ ..., handler })`

Keep handler presence out of `when`

- `createShortcuts({ canDispatch: (candidate) => isCommandHandled(candidate.handler) })`

Register multi-step navigation

- `bind({ sequence: "g g", handler })`
- Adjust `sequenceTimeout` when the default one-second window is not right for
  your app

Temporarily disable keyboard shortcuts

- `pause(scope)` and `resume(scope)`
- Omit the scope to pause or resume the whole runtime
- `pause` affects keyboard dispatch only. It does not make external actions
  unavailable to `isAvailable`

Let users choose their own shortcut

- `record({ onUpdate, suppressHandlers: true })`
- Save the returned `ShortcutRecording.expression`
- Rebind that expression later with `bind` or `BindingSet.replace`

Rebind a user-configurable shortcut set

- `const userBindings = shortcuts.createBindingSet()`
- Recompute your next object-form bindings in app code
- `userBindings.replace(nextBindings)` to swap them atomically

Debug why a shortcut did not fire

- `explain(event)` to inspect scope, matcher, `when`, and `canDispatch`
  decisions

# Recommended Patterns

- Keep your command or action model in your app, and treat `powerkeys` as the
  keyboard and availability layer.
- Use one long-lived `BindingSet` when shortcuts are derived from mutable app
  state or persisted user preferences and must be replaced as one unit.
- Use scopes for major UI layers such as modal, editor, sidebar, and root.
- Use `when` for state that changes frequently inside one scope, such as
  selection state or read-only mode.
- Use `canDispatch` for implementation-level active-handler checks that are not
  useful as shared shortcut context.
- Reuse one `scope` plus `when` rule across all invocation surfaces for the same
  action.
- Mirror only decision-making state into runtime context. If a value does not
  affect eligibility, it probably does not belong there.

# Patterns to Avoid

- Do not build palette presentation concerns such as group names, labels, or
  search keywords into `powerkeys`.
- Do not use `pause` as a visibility switch for menus or palettes. It is a
  keyboard-only control.
- Do not rebuild one dynamic shortcut collection with manual unbind and rebind
  loops when one `BindingSet` can own that collection.
- Do not make shared availability depend on keyboard-event details such as
  `event.key` or modifier state.
- Do not duplicate the same eligibility rule in separate shortcut-only and
  palette-only code paths when one shared `scope` plus `when` clause will do.
- Do not treat `getActiveScopes` as a place for fine-grained state that belongs
  in `when`.

# Invariants and Constraints

- `root` is always active, even when `getActiveScopes` returns nothing.
- Each binding must define exactly one of `combo` or `sequence`.
- Only one recording session may be active per runtime.
- Only one binding wins a given event.
- `canDispatch` filters candidates before winner selection; rejected
  higher-priority bindings do not block lower-priority eligible bindings.
- `BindingSet.replace` is atomic: invalid next bindings do not partially update
  the active set.
- Editable targets are blocked by default.
- Reserved top-level context names are `context`, `event`, `scope`, and
  `runtime`.
- Sequence state expires after `sequenceTimeout` milliseconds of inactivity.
- `pause` and `resume` are reference-counted, so repeated pauses require
  matching resumes.

# Error Model

- Invalid binding definitions throw synchronously during `bind` or
  `BindingSet.replace`.
- Failed `BindingSet.replace` calls leave the set unchanged.
- Invalid `when` syntax also throws synchronously during `isAvailable`.
- `canDispatch` errors reject that candidate and are sent to `onError` with
  phase `"canDispatch"` when provided; otherwise they are rethrown
  asynchronously.
- Handler errors are sent to `onError` when provided; otherwise they are
  rethrown asynchronously.
- `when`-clause evaluation errors during dispatch do not throw through the
  native event handler. They cause that binding to fail its `when` check, and
  the error appears in `explain`.
- `when`-clause evaluation errors inside `isAvailable` return `false`.
- Recording `onUpdate` errors are reported through `onError` and do not cancel
  the active recording.
- Cancelling a recording rejects `RecordingSession.finished` with an
  `AbortError`.

# Terminology

- **Combo**
  - One key press plus zero or more modifiers, such as `Ctrl+k` or `Meta+/`.

- **Sequence**
  - Whitespace-separated combo steps, such as `g g`.

- **Scope**
  - A named dispatch layer used to decide which bindings or external actions are
    eligible before `when` clauses run.

- **When Clause**
  - A boolean expression evaluated against runtime context to make a final
    eligibility decision.

- **Candidate Dispatch Guard**
  - An optional `canDispatch` callback that filters otherwise eligible keyboard
    candidates before conflict resolution.

- **Boundary**
  - The document or element passed as `target`, which limits which native events
    the runtime considers.

- **Editable Policy**
  - The rule that decides whether a binding may run while focus is inside an
    editable element.

- **Binding Set**
  - A runtime-owned collection of bindings that can be replaced, cleared, or
    disposed as one unit.

# Non-Goals

- global shortcuts outside the current DOM boundary
- command registration or command identifiers owned by `powerkeys`
- command-palette or menu rendering
- framework-specific hooks or adapters
