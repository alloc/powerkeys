import { createShortcuts } from "../src/index";

function keydown(target: EventTarget, init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function keyup(target: EventTarget, init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent("keyup", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("sigma-keys", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("binds and dispatches a basic combo", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const calls: string[] = [];
    const shortcuts = createShortcuts({ target: host });
    shortcuts.bind("Ctrl+k", () => calls.push("palette"));

    keydown(host, { key: "k", ctrlKey: true, code: "KeyK" });

    expect(calls).toEqual(["palette"]);
    shortcuts.dispose();
  });

  it("evaluates when clauses against nested context keys", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const calls: string[] = [];
    const shortcuts = createShortcuts({ target: host });
    shortcuts.setContext("editor.focus", true);
    shortcuts.setContext("editor.hasSelection", false);

    shortcuts.bind({
      combo: "c",
      when: "editor.focus && editor.hasSelection",
      handler: () => calls.push("copy"),
    });

    keydown(host, { key: "c", code: "KeyC" });
    expect(calls).toEqual([]);

    shortcuts.setContext("editor.hasSelection", true);
    keydown(host, { key: "c", code: "KeyC" });
    expect(calls).toEqual(["copy"]);
    shortcuts.dispose();
  });

  it("resolves scope precedence through getActiveScopes", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const calls: string[] = [];
    const shortcuts = createShortcuts({
      target: host,
      getActiveScopes: () => ["modal", "editor"],
    });

    shortcuts.bind({ combo: "Escape", scope: "editor", handler: () => calls.push("editor") });
    shortcuts.bind({ combo: "Escape", scope: "modal", handler: () => calls.push("modal") });

    keydown(host, { key: "Escape", code: "Escape" });

    expect(calls).toEqual(["modal"]);
    shortcuts.dispose();
  });

  it("supports overlapping sequences with shared prefixes", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const calls: string[] = [];
    const shortcuts = createShortcuts({ target: host, sequenceTimeout: 1000 });

    shortcuts.bind({ sequence: "g g l", handler: () => calls.push("ggl") });
    shortcuts.bind({ sequence: "g g o", handler: () => calls.push("ggo") });

    keydown(host, { key: "g", code: "KeyG" });
    keydown(host, { key: "g", code: "KeyG" });
    keydown(host, { key: "o", code: "KeyO" });

    expect(calls).toEqual(["ggo"]);
    shortcuts.dispose();
  });

  it("pauses a scope and prevents dispatch", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const calls: string[] = [];
    const shortcuts = createShortcuts({
      target: host,
      getActiveScopes: () => ["editor"],
    });

    shortcuts.bind({ combo: "Escape", scope: "editor", handler: () => calls.push("editor") });
    shortcuts.pause("editor");
    keydown(host, { key: "Escape", code: "Escape" });
    expect(calls).toEqual([]);

    shortcuts.resume("editor");
    keydown(host, { key: "Escape", code: "Escape" });
    expect(calls).toEqual(["editor"]);
    shortcuts.dispose();
  });

  it("records shortcuts while suppressing handlers", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const calls: string[] = [];
    const shortcuts = createShortcuts({ target: host, sequenceTimeout: 30 });
    shortcuts.bind("Meta+k", () => calls.push("handler"));

    const session = shortcuts.record({ suppressHandlers: true, timeout: 10 });

    keydown(host, { key: "k", metaKey: true, code: "KeyK" });
    keydown(host, { key: "c", code: "KeyC" });

    const recording = await session.finished;

    expect(calls).toEqual([]);
    expect(recording.steps).toEqual(["Meta+k", "c"]);
    expect(recording.expression).toBe("Meta+k c");
    shortcuts.dispose();
  });

  it("emits live recording snapshots as steps are captured", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const updates: string[] = [];
    const shortcuts = createShortcuts({ target: host, sequenceTimeout: 30 });
    const session = shortcuts.record({
      suppressHandlers: true,
      timeout: 10,
      onUpdate: (recording) => updates.push(recording.expression),
    });

    keydown(host, { key: "k", metaKey: true, code: "KeyK" });
    keydown(host, { key: "c", code: "KeyC" });

    await session.finished;

    expect(updates).toEqual(["Meta+k", "Meta+k c"]);
    shortcuts.dispose();
  });

  it("explains why a binding did not match", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const shortcuts = createShortcuts({ target: host });
    shortcuts.setContext("editor.focus", true);
    shortcuts.setContext("editor.hasSelection", false);
    shortcuts.bind({
      combo: "c",
      when: "editor.focus && editor.hasSelection",
      handler: () => {},
    });

    const event = new KeyboardEvent("keydown", { key: "c", code: "KeyC", bubbles: true });
    Object.defineProperty(event, "target", { value: host });

    const trace = shortcuts.explain(event);

    expect(trace.winner).toBeUndefined();
    expect(trace.candidates[0]?.when?.result).toBe(false);
    expect(trace.candidates[0]?.rejectedBy).toBe("when");
    shortcuts.dispose();
  });

  it("respects editable-target policy overrides", () => {
    const host = document.createElement("div");
    const input = document.createElement("input");
    host.appendChild(input);
    document.body.appendChild(host);

    const calls: string[] = [];
    const shortcuts = createShortcuts({ target: host });
    shortcuts.bind({ combo: "k", handler: () => calls.push("blocked") });
    shortcuts.bind({
      combo: "Meta+k",
      editablePolicy: "allow-if-meta",
      handler: () => calls.push("allowed"),
    });

    keydown(input, { key: "k", code: "KeyK" });
    keydown(input, { key: "k", code: "KeyK", metaKey: true });

    expect(calls).toEqual(["allowed"]);
    shortcuts.dispose();
  });
});
