# Combokeys Clean-Sheet Successor Notes

This note is based on the implementation under `./combokeys/`, but it does not optimize for backwards compatibility. The goal here is to identify what is fundamentally useful in Combokeys, what should be discarded, and what a modern successor should look like if it were designed for current browsers and current application architecture.

## What is still valuable

Combokeys gets a few product-level ideas right:

- Keyboard shortcuts should be scoped. Binding to a chosen element or subtree is more useful than assuming one global document listener.
- Single keys, modifier combos, and multi-step sequences belong in the same system. Users think of them as one feature.
- Shortcut systems need a policy for editable targets. Not firing inside text inputs by default is still the right default for most apps.
- Sequence behavior matters more than a minimal API. Shared prefixes, partial matches, and reset behavior are where shortcut systems either feel solid or flaky.

Those ideas are worth keeping. Most of the implementation is not.

## What a new successor should not inherit

### 1. Do not build on `keypress`, `keyCode`, or `which`

That model belongs to an older browser era. A fresh implementation should center on:

- `KeyboardEvent.key` for semantic key meaning
- `KeyboardEvent.code` when physical-key location actually matters
- explicit handling for modifiers, repeats, composition, and dead-key states

If a keybinding engine starts from deprecated browser primitives, it will spend its life compensating for them.

### 2. Do not preserve the old action model as-is

Combokeys infers between `keypress`, `keydown`, and `keyup`. A clean successor should instead define a more modern event model:

- `keydown` should be the default for almost all commands
- `keyup` should be opt-in for the small number of cases that actually need it
- text entry or character-capture should be modeled explicitly rather than hidden behind `keypress`

This makes the API easier to reason about and avoids historical browser weirdness leaking into the product.

### 3. Do not monkey-patch instance methods for extensibility

Combokeys plugins work by replacing methods on an instance. That is simple, but it is not a good foundation.

A modern successor should use explicit extension points:

- lifecycle hooks
- middleware around normalized events
- pluggable matchers or policies
- explicit feature modules instead of ad hoc method replacement

That gives predictable composition and makes plugin order far less fragile.

### 4. Do not keep unbind-by-overwrite

Replacing a binding with a no-op callback is a workaround, not a design. A fresh system should treat bindings as real records with stable ids, metadata, and deletion.

Useful consequences:

- `bind()` can return a handle
- `unbind()` can remove by handle, combo, namespace, or scope
- introspection becomes possible
- debug tooling becomes possible

### 5. Do not keep global instance tracking

Static global registries are unnecessary unless the system is explicitly designed around them. A clean successor should let the host application own lifecycle and memory management.

## What the modern core should look like

## 1. A normalized event layer

The first layer should translate browser keyboard events into a stable internal representation, something like:

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

That normalized object should be the basis of matching, filtering, debugging, and plugins.

This is the biggest conceptual upgrade over Combokeys. Instead of mixing browser quirks directly into matching, normalize once and keep the rest of the system clean.

## 2. A declarative binding model

Bindings should be stored as structured objects, not implicit callback arrays under final-key buckets.

For example:

```ts
type Binding = {
  id: string;
  scope: string;
  kind: "combo" | "sequence";
  steps: Step[];
  handler: (ctx: MatchContext) => void | boolean;
  when?: (ctx: MatchContext) => boolean;
  priority?: number;
  enabled?: boolean;
};
```

That opens up capabilities Combokeys cannot support cleanly:

- priority and conflict resolution
- temporary enable/disable
- conditional bindings
- namespaces/scopes
- inspection and devtools

## 3. Sequence matching as an explicit state machine

Combokeys has the right instinct here: sequence handling deserves dedicated state. But a clean successor should express it directly as a state machine rather than through a few mutable flags and timers.

A better model:

- each active sequence attempt is an object
- each attempt knows its current step, timeout deadline, and originating scope
- advancing a sequence is an explicit transition
- conflicts are resolved by policy, not by incidental array order

This makes shared prefixes, cancellation, and longest-match rules much easier to reason about.

Combokeys proves that sequence behavior is the hardest part. A new system should make that the most explicit part of the design.

## 4. Scope as a first-class concept

Combokeys scopes by DOM element because that was the most obvious fork improvement. A new successor should go further and model scope directly.

Possible scope layers:

- DOM scope: bind to a specific element subtree
- logical scope: editor, modal, command palette, table, canvas
- focus scope: only active when a given controller says it is
- global scope: explicit and rare

This avoids pushing too much policy into DOM containment checks.

## 5. Editable-target policy should be configurable, not plugin-only

Combokeys is right to suppress shortcuts inside editable controls by default. But this should be a built-in policy layer, not a plugin hack.

Useful policies:

- `ignore-editable`
- `allow-in-editable`
- `allow-if-meta`
- `custom`

This should be configurable per binding or per scope.

## API direction I would choose

A modern API should feel more like a small shortcut runtime than a clever event utility.

Example direction:

```ts
const shortcuts = createShortcuts({
  target: editorRoot,
  editablePolicy: "ignore-editable",
});

shortcuts.bind("Mod+k", openPalette);
shortcuts.bind("g i", goInbox);

shortcuts.bind({
  combo: "Mod+Shift+p",
  handler: openCommandMenu,
  scope: "editor",
  priority: 10,
});

const disposable = shortcuts.bind("Escape", closeDialog);
disposable.dispose();
```

Important characteristics:

- bindings can be strings or structured objects
- `Mod` remains as a high-level abstraction
- return values are disposables, not just implicit registrations
- scope and priority are part of the binding model

## Features I would add that Combokeys does not really support

### 1. Introspection

The system should be able to answer:

- what bindings are active right now
- why a specific binding did or did not match
- which scope consumed the event
- which sequence states are currently in progress

This is extremely useful in real applications and nearly impossible with Combokeys’ current shape.

### 2. Debug mode

A debug mode should log normalized events, candidate matches, filtered matches, and winning matches. Shortcut bugs are often policy bugs, not parsing bugs.

### 3. Better conflict handling

Combokeys effectively resolves conflicts through insertion order plus sequence special cases. A clean successor should define conflict rules intentionally:

- highest priority wins
- more specific bindings beat less specific bindings
- longer sequences beat shorter overlapping ones
- scope precedence beats registration order

### 4. Configurable timing

Sequence timeout should be configurable globally and per binding. One second is a legacy heuristic, not a universal product truth.

### 5. Repeat-aware behavior

Modern apps often care whether a key is auto-repeating. A successor should expose `event.repeat` and allow bindings to opt into or out of repeat handling.

### 6. Composition-aware behavior

A modern shortcut engine should treat IME/composition as a first-class concern. During composition, many shortcuts should either suspend matching or use a different policy.

## What I would keep conceptually from the plugins

The plugin set points at real feature needs:

- bind many shortcuts at once
- allow some shortcuts inside editable controls
- temporarily suspend shortcut handling
- record a user-defined shortcut

I would keep all four capabilities, but not as monkey patches.

They should become first-class modules:

- bulk registration API
- editable-target policy overrides
- runtime pause/resume on a scope or controller
- a dedicated recorder component using the same normalization layer as the main matcher

The recorder is especially worth rethinking. It should not replace the main `handleKey` implementation. It should listen to the same normalized event stream and produce a canonical shortcut description.

## Architectural shape I would recommend

Use a layered design:

1. DOM adapter
2. event normalizer
3. policy filters
4. matcher engine
5. sequence state machine
6. dispatcher
7. devtools/introspection surface

That layering would make the system easier to test and easier to port to environments beyond the browser if needed.

## Testing strategy for a clean-sheet successor

Since compatibility is not the goal, the test suite should change shape too.

Focus on:

- normalized event snapshots
- matcher correctness for combos and sequences
- scope precedence
- editable-target policies
- composition and repeat behavior
- debug/introspection output

I would still port some of Combokeys’ sequence cases because they encode real UX problems:

- shared-prefix sequences
- overlapping subsequences
- combo-inside-sequence behavior
- interrupted sequence reset
- timeout behavior

Those are not legacy quirks. They are inherent to the problem space.

## Recommended product stance

If I were building the successor from scratch, I would define it this way:

- modern-browser-only
- `keydown`-centric
- explicit scopes
- structured bindings
- observable runtime state
- no deprecated keyboard-event semantics
- no monkey-patching plugin system

In other words: keep the product insight, discard the historical implementation constraints.

## Bottom line

Combokeys is useful as evidence for what matters in a shortcut engine:

- scope
- sequences
- editable-target policy
- ergonomic combo syntax

It is not a good blueprint for a modern implementation.

The right successor is not Combokeys rewritten in TypeScript. It is a small, explicit shortcut runtime built around normalized modern keyboard events and a real state machine for matching.
