# Combokeys Successor Notes

This note is based on the implementation under `./combokeys/` and its test suite. It is meant to capture the real contract a successor should preserve, plus the implementation decisions that matter if you rewrite rather than maintain.

## What Combokeys actually is

Combokeys is a small browser keyboard shortcut engine with four core capabilities:

- Element-scoped listeners instead of an implicit global document listener. Each instance is bound to one DOM element and attaches `keypress`, `keydown`, and `keyup` listeners immediately on construction (`Combokeys/index.js:4-75`, `Combokeys/prototype/addEvents.js:3-11`).
- Support for single keys, modifier combos, and space-delimited sequences (`Combokeys/prototype/bindSingle.js:12-55`, `Combokeys/prototype/bindSequence.js:13-77`).
- Default event-type inference so callers usually omit `"keypress"`, `"keydown"`, or `"keyup"` (`Combokeys/prototype/getKeyInfo.js:11-60`, `Combokeys/prototype/pickBestAction.js:10-24`).
- A plugin model built by monkey-patching instance methods rather than subclassing or composing middleware (`plugins/*/index.js`).

The tests show the public surface is larger than the README implies. A successor should treat the tests as the contract, especially for sequences and default action selection.

## Behavioral contract worth preserving

### 1. Instance scoping is the main fork-level product decision

The fork from Mousetrap changed the library from implicit document-level binding to explicit instance construction on a chosen element. Multiple independent instances are supported and tested (`README.md`, `test/initialization.js:6-24`).

Why it matters:

- It keeps shortcut scope local to a subtree or specific widget.
- It makes simultaneous shortcut domains possible.
- It keeps plugin state instance-local because plugins patch an instance, not a shared prototype.

If a successor moves back to a singleton or global registry, it stops being the same product.

### 2. Callback shape and side effects are part of the API

Callbacks receive `(event, combo)` and returning `false` must both prevent default and stop propagation (`Combokeys/prototype/fireCallback.js:12-28`, `test/bind.js:165-215`).

That behavior is old-school jQuery-style, but it is tested and likely depended on.

### 3. Default suppression inside editable elements is intentional

Shortcuts do not fire in `input`, `select`, `textarea`, or `contentEditable` elements unless:

- the target has class `combokeys`, or
- the global-bind plugin explicitly bypasses the suppression

See `Combokeys/prototype/stopCallback.js:11-20` and `test/plugins/global-bind.js:22-112`.

This is an important product decision, not just an implementation detail. A successor should keep a clear policy here.

### 4. Rebinding overwrites, unbinding neutralizes

Rebinding the same combo or sequence replaces the earlier callback (`Combokeys/prototype/getMatches.js:71-80`, `test/bind.js:117-130`, `test/bind.js:540-553`).

`unbind()` does not remove records. It re-binds the combo to a no-op callback (`Combokeys/prototype/unbind.js:20-23`). Tests only assert that the original callback stops firing (`test/unbind.js:8-50`), so a successor can implement this more cleanly, but it should preserve:

- exact-match overwrite semantics
- array support for `bind` and `unbind`
- `any-character` being unbindable

### 5. `any-character` is special and `keypress`-only

`any-character` bindings are injected only during `keypress` matching, with a small guard for Firefox arrow-key anomalies (`Combokeys/prototype/getMatches.js:25-35`). Tests cover the positive path (`test/bind.js:132-143`, `test/unbind.js:22-33`).

This is a semantic feature, not just a naming alias.

## Internal design choices that explain the behavior

### 1. Normalization pipeline

The event flow is:

1. Raw DOM event enters `handleKeyEvent`
2. `which` is normalized
3. character name is derived from the event
4. active modifiers are computed
5. matching callbacks are resolved
6. callbacks fire or sequence state resets

Relevant files:

- `Combokeys/prototype/handleKeyEvent.js:10-35`
- `helpers/characterFromEvent.js:10-50`
- `helpers/eventModifiers.js:10-29`
- `Combokeys/prototype/handleKey.js:12-92`
- `Combokeys/prototype/getMatches.js:16-86`

This split is useful. A successor should keep a similarly explicit pipeline even if it switches to `KeyboardEvent.key` / `code`.

### 2. Data model is simple but effective

There are three central stores per instance (`Combokeys/index.js:21-65`):

- `callbacks`: keyed by normalized final key, each value is an array of `{ callback, modifiers, action, seq, level, combo }`
- `directMap`: string key of `combo:action` for `trigger()`
- `sequenceLevels`: current progress per bound sequence

This data model explains why the library stays small. It also explains some quirks:

- matching is linear within one final-key bucket
- sequence entries are inserted before normal bindings so sequence matching wins where needed (`Combokeys/prototype/bindSingle.js:36-54`)
- `trigger()` is separate from real event dispatch and only uses `directMap` (`Combokeys/prototype/trigger.js:10-15`)

### 3. Action inference is a major design choice

If the caller does not specify an action, Combokeys chooses one:

- `keydown` for non-printable/special keys via the reverse special-key map
- `keypress` for printable characters
- forced `keydown` when modifiers are involved

See `Combokeys/prototype/pickBestAction.js:10-24`, `Combokeys/prototype/getReverseMap.js:11-30`, and the contract tests in `test/bind.js:662-705`.

This inference is central to the UX. A successor should preserve the behavior, even if the implementation changes.

### 4. Sequence handling is the hardest part and where most value lives

The sequence engine has a few important invariants:

- Each sequence tracks its current level in `sequenceLevels` (`Combokeys/prototype/bindSequence.js:16-18`).
- Partial matches advance the sequence and set `nextExpectedAction` based on the next key (`Combokeys/prototype/bindSequence.js:27-33`, `73-76`).
- The library only fires callbacks at the deepest matched sequence level to avoid subsequences firing (`Combokeys/prototype/handleKey.js:22-63`).
- Unmatched input resets active sequences, but modifier keys are treated specially so mixed combo/sequence bindings can work (`Combokeys/prototype/handleKey.js:65-92`).
- Active sequences time out after 1 second (`Combokeys/prototype/resetSequenceTimer.js:11-20`, `test/bind.js:628-658`).
- After a sequence finishes, there is a deliberate 10ms delayed reset to avoid a race when one sequence ends on a key another sequence starts with (`Combokeys/prototype/bindSequence.js:54-61`).
- `ignoreNextKeyup` and `ignoreNextKeypress` exist specifically to suppress false trailing events around sequence completion and modifier-heavy transitions (`Combokeys/index.js:45-65`, `Combokeys/prototype/bindSequence.js:46-52`, `Combokeys/prototype/handleKey.js:77-92`, `Combokeys/prototype/handleKeyEvent.js:28-32`).

The tests around sequences are the most important migration set:

- basic sequences and mixed event types (`test/bind.js:350-380`)
- sequences starting with modifiers (`test/bind.js:382-403`)
- single-key bindings suppressed inside sequences (`test/bind.js:405-439`)
- shared prefixes (`test/bind.js:487-508`)
- subsequence suppression (`test/bind.js:511-537`)
- combos inside sequences (`test/bind.js:571-590`)
- timeout behavior (`test/bind.js:628-658`)

If a successor gets sequence behavior wrong, it will feel flaky even if basic combos work.

## Cross-browser and keyboard-layout assumptions

Combokeys was written for the `keyCode`/`which`/`keypress` era.

Important assumptions:

- Printable characters are primarily derived from `keypress` char codes (`helpers/characterFromEvent.js:16-33`).
- Non-printable keys are decoded from numeric lookup tables (`helpers/special-keys-map.js`, `helpers/special-characters-map.js`).
- Shifted punctuation for non-`keypress` actions is normalized through a US-layout shift map (`helpers/shift-map.js:3-33`, `Combokeys/prototype/getKeyInfo.js:38-44`).
- The `mod` alias is determined from `navigator.platform` (`helpers/special-aliases.js:9-15`).

The README claims international-layout support, but the source is more nuanced:

- printable-character handling is layout-friendly when the browser emits useful `keypress` chars
- shifted-key normalization for `keydown`/`keyup` is explicitly US-keyboard-specific

A successor should decide whether to preserve this exact behavior for compatibility or move to a more modern `event.key`/`event.code` model and accept some compatibility drift.

## Plugin architecture lessons

Plugins are functions that mutate one instance and capture plugin state in closure variables.

That gives simple ergonomics, but it has consequences:

- patch ordering matters when multiple plugins wrap the same method
- there is no formal plugin lifecycle
- plugins are not easily introspectable
- plugin state is private and tied to the patched instance

Specific examples:

- `global-bind` wraps `stopCallback` and `unbind` and tracks a map of globally-allowed combos (`plugins/global-bind/index.js:11-50`)
- `pause` wraps `stopCallback` and gates everything behind one boolean (`plugins/pause/index.js:8-28`)
- `record` temporarily replaces `handleKey` entirely during recording (`plugins/record/index.js:45-51`, `194-197`)
- `bind-dictionary` replaces `bind` to accept an object map (`plugins/bind-dictionary/index.js:16-36`)

This is workable for a small library, but if a successor wants a richer extension story, this is the area to redesign first.

## Known liabilities and likely rewrite targets

### 1. `unbind()` is intentionally crude

It binds a no-op instead of deleting the callback record (`Combokeys/prototype/unbind.js:20-23`). The comment acknowledges this as technical debt.

Why this matters:

- callback arrays keep dead entries
- direct-map semantics are indirect rather than explicit
- the implementation is harder to reason about than true removal

### 2. Global instance tracking can leak

Instances are pushed into `Combokeys.instances` by default (`Combokeys/index.js:71-73`), and static `Combokeys.reset()` just calls `.reset()` on each instance (`Combokeys/reset.js:4-9`). There is no removal on `detach()`.

That means a long-lived app that creates and discards many instances can accumulate stale instance references unless it disables global storage.

### 3. Tests are strong on behavior, weak on composition edge cases

The suite covers the core keyboard contract well, but it does not deeply test:

- multiple plugins applied together
- plugin application order
- repeated attach/detach cycles
- modern browser APIs like `event.key`, `event.code`, IME/composition, dead keys, or shadow DOM

A successor should port the existing tests first, then add those missing cases.

### 4. The test harness reflects the old browser model

`test/lib/key-event.js` simulates a `keydown -> keypress -> keyup` pipeline with synthetic `keyCode`/`charCode` values (`test/lib/key-event.js:50-128`). That is appropriate for this codebase, but a successor using modern event semantics may need a different harness.

## If I were building the successor

I would preserve these semantics first:

- explicit instance-per-element binding
- callback signature and `return false` behavior
- default suppression in editable fields, with an override mechanism
- exact overwrite semantics for rebinding
- `any-character`
- the sequence semantics encoded by `test/bind.js`

I would deliberately change these implementation details:

- replace `keyCode`/`which`-centric parsing with a modern normalization layer built on `KeyboardEvent.key` and carefully chosen `code` fallbacks
- implement true removal for `unbind`
- replace plugin monkey-patching with explicit hooks or middleware
- make global instance storage opt-in or remove it
- make sequence timing configurable instead of hard-coded to 1000ms

## Minimum test set to port into a successor

If only part of the suite is carried over, these are the highest-value cases:

- default action inference (`test/bind.js:662-705`)
- shared-prefix and subsequence sequence behavior (`test/bind.js:487-537`)
- combo-inside-sequence behavior (`test/bind.js:571-590`)
- sequence timeout and reset timing (`test/bind.js:628-658`)
- suppression in editable controls plus global override (`test/plugins/global-bind.js:22-112`)
- `return false` prevent-default / stop-propagation behavior (`test/bind.js:165-215`)
- unbind and rebinding overwrite semantics (`test/bind.js:117-130`, `test/unbind.js:8-50`)
- numeric keypad plus/minus/zero handling (`test/bind.js:278-319`)

That subset preserves most of the non-obvious value in this library.
