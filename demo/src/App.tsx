import type { ComponentChildren, JSX, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  createShortcuts,
  type EvaluationTrace,
  type RecordingSession,
  type ShortcutRuntime,
} from "sigma-keys";
import styles from "./App.module.css";

type DemoTab = "basic" | "scope" | "sequence" | "recording";

type LogSetter = (entry: string) => void;

export function App() {
  const [tab, setTab] = useState<DemoTab>("basic");

  return (
    <main class={styles.app}>
      <div class={styles.shell}>
        <header class={styles.hero}>
          <p class={styles.eyebrow}>sigma-keys</p>
          <h1 class={styles.title}>
            Modern keyboard shortcuts with scopes, sequences, and when clauses.
          </h1>
          <p class={styles.lede}>
            This demo uses the runtime directly from source. Each tab mounts a focused example built
            with Preact, TypeScript, and CSS Modules.
          </p>
        </header>

        <div class={styles.grid}>
          <div class={styles.tabRow}>
            <TabButton tab={tab} name="basic" label="Combos" onSelect={setTab} />
            <TabButton tab={tab} name="scope" label="Scopes + when" onSelect={setTab} />
            <TabButton tab={tab} name="sequence" label="Sequences" onSelect={setTab} />
            <TabButton tab={tab} name="recording" label="Recording" onSelect={setTab} />
          </div>

          {tab === "basic" && <BasicDemo />}
          {tab === "scope" && <ScopeWhenDemo />}
          {tab === "sequence" && <SequenceDemo />}
          {tab === "recording" && <RecordingDemo />}
        </div>
      </div>
    </main>
  );
}

function TabButton(props: {
  tab: DemoTab;
  name: DemoTab;
  label: string;
  onSelect: (tab: DemoTab) => void;
}) {
  const active = props.tab === props.name;
  return (
    <button
      type="button"
      class={`${styles.tab} ${active ? styles.tabActive : ""}`}
      onClick={() => props.onSelect(props.name)}
    >
      {props.label}
    </button>
  );
}

function BasicDemo() {
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [toggleCount, setToggleCount] = useState(0);
  const [logs, setLogs] = useLogState();

  useEffect(() => {
    const stage = stageRef.current;
    const input = inputRef.current;
    if (!stage || !input) return;

    const runtime = createShortcuts({ target: stage });
    const toggle = () => {
      setToggleCount((count) => count + 1);
      setLogs("toggled the demo action");
    };

    runtime.bind("Meta+k", toggle);
    runtime.bind({
      combo: "Meta+/",
      editablePolicy: "allow-if-meta",
      handler: () =>
        setLogs(
          "Meta+/ is expected to fire even with the input focused because editable targets do not block it",
        ),
    });
    runtime.bind({
      combo: "Escape",
      editablePolicy: "allow-in-editable",
      handler: ({ event }) => {
        if (event.target instanceof HTMLInputElement) {
          stage.focus();
          setLogs("Escape blurred the focused input");
        } else {
          setToggleCount(0);
          setLogs("Reset the toggle count");
        }
      },
    });

    stage.focus();
    return () => {
      runtime.dispose();
    };
  }, []);

  return (
    <Panel
      title="Combos and editable-target policy"
      text="Focus the stage or the input. Meta+K fires the main action, while Meta+/ demonstrates an editable-policy override that still works when the input is focused."
    >
      <FocusableStage stageRef={stageRef}>
        <div class={styles.kbdRow}>
          <Kbd>Meta+K</Kbd>
          <Kbd>Meta+/</Kbd>
          <Kbd>Escape</Kbd>
        </div>
        <div class={styles.controls}>
          <input
            class={styles.input}
            placeholder="Try Meta+/ from inside this input"
            ref={inputRef}
          />
        </div>
        <div class={styles.statusGrid}>
          <StatusCard label="Toggle count" value={String(toggleCount)} />
          <StatusCard label="Latest event" value={logs[0] ?? "No shortcut fired yet"} />
        </div>
      </FocusableStage>
    </Panel>
  );
}

function ScopeWhenDemo() {
  const stageRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ShortcutRuntime | null>(null);
  const activeScopesRef = useRef<string[]>(["editor"]);
  const pausedRef = useRef(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [logs, setLogs] = useLogState();
  const [trace, setTrace] = useState<string>(
    "Press a key inside the stage to see the latest evaluation trace.",
  );

  activeScopesRef.current = modalOpen ? ["modal", "editor"] : ["editor"];

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const runtime = createShortcuts({
      target: stage,
      getActiveScopes: () => activeScopesRef.current,
    });
    runtimeRef.current = runtime;

    runtime.bind({
      combo: "Escape",
      scope: "editor",
      handler: () => setLogs("editor handled Escape"),
    });
    runtime.bind({
      combo: "Escape",
      scope: "modal",
      priority: 10,
      handler: () => setLogs("modal handled Escape"),
    });
    runtime.bind({
      combo: "c",
      scope: "editor",
      when: "editor.hasSelection && !editor.readOnly",
      handler: () => setLogs("copy action passed its when-clause"),
    });

    const onKeyDown = (event: KeyboardEvent) => {
      setTrace(formatTrace(runtime.explain(event)));
    };
    stage.addEventListener("keydown", onKeyDown);
    stage.focus();

    return () => {
      stage.removeEventListener("keydown", onKeyDown);
      runtime.dispose();
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.setContext("editor.hasSelection", hasSelection);
    runtimeRef.current?.setContext("editor.readOnly", readOnly);
  }, [hasSelection, readOnly]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (pausedRef.current === readOnly) return;
    pausedRef.current = readOnly;
    if (readOnly) {
      runtime.pause("editor");
      return;
    }
    runtime.resume("editor");
  }, [readOnly]);

  return (
    <Panel
      title="Scopes, when clauses, and pause"
      text="Escape is bound in both editor and modal scopes, while C is guarded by a when-clause. Toggling read-only pauses the editor scope entirely."
    >
      <FocusableStage stageRef={stageRef}>
        <div class={styles.kbdRow}>
          <Kbd>Escape</Kbd>
          <Kbd>c</Kbd>
        </div>
        <div class={styles.controls}>
          <label class={styles.checkbox}>
            <input
              checked={modalOpen}
              onInput={() => setModalOpen((value) => !value)}
              type="checkbox"
            />
            modal scope active
          </label>
          <label class={styles.checkbox}>
            <input
              checked={hasSelection}
              onInput={() => setHasSelection((value) => !value)}
              type="checkbox"
            />
            has selection
          </label>
          <label class={styles.checkbox}>
            <input
              checked={readOnly}
              onInput={() => setReadOnly((value) => !value)}
              type="checkbox"
            />
            read only (pauses editor)
          </label>
        </div>
        <div class={styles.statusGrid}>
          <StatusCard label="Active scopes" value={activeScopesRef.current.join(" → ")} />
          <StatusCard label="Latest event" value={logs[0] ?? "No shortcut fired yet"} />
        </div>
        <pre class={styles.trace}>{trace}</pre>
      </FocusableStage>
    </Panel>
  );
}

function SequenceDemo() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [logs, setLogs] = useLogState();
  const [sequenceState, setSequenceState] = useState("No active sequence state");

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const runtime = createShortcuts({ target: stage, sequenceTimeout: 1400 });

    runtime.bind({ sequence: "g i", handler: () => setLogs("opened the inbox sequence") });
    runtime.bind({
      sequence: "g g o",
      handler: () => setLogs("completed the longer shared-prefix sequence"),
    });

    const onKeyDown = () => {
      const states = runtime.getActiveSequences();
      setSequenceState(
        states.length > 0
          ? states.map((state) => `${state.bindingId}@${state.stepIndex}`).join(", ")
          : "No active sequence state",
      );
    };

    stage.addEventListener("keydown", onKeyDown);
    stage.focus();

    return () => {
      stage.removeEventListener("keydown", onKeyDown);
      runtime.dispose();
    };
  }, []);

  return (
    <Panel
      title="Sequences"
      text="Try G then I, or G then G then O. The shared-prefix sequence shows how the runtime tracks active sequence state."
    >
      <FocusableStage stageRef={stageRef}>
        <div class={styles.kbdRow}>
          <Kbd>g i</Kbd>
          <Kbd>g g o</Kbd>
        </div>
        <div class={styles.statusGrid}>
          <StatusCard label="Sequence machine" value={sequenceState} />
          <StatusCard label="Latest event" value={logs[0] ?? "No sequence completed yet"} />
        </div>
        <ol class={styles.log}>
          {logs.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ol>
      </FocusableStage>
    </Panel>
  );
}

function RecordingDemo() {
  const stageRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ShortcutRuntime | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearOnCancelRef = useRef(false);
  const groupedStepsRef = useRef<string[][]>([]);
  const pendingSequenceRef = useRef(false);
  const lastStepCountRef = useRef(0);
  const [shortcutCount, setShortcutCount] = useState(0);
  const [logs, setLogs] = useLogState();
  const [recording, setRecording] = useState<string>("Nothing recorded yet");
  const [capturedSteps, setCapturedSteps] = useState<string>("No keys captured yet");
  const [recordingState, setRecordingState] = useState<string>("Inactive");
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const runtime = createShortcuts({ target: stage, sequenceTimeout: 1200 });
    runtimeRef.current = runtime;

    const bump = () => {
      setShortcutCount((count) => count + 1);
      setLogs("regular shortcut fired");
    };

    runtime.bind("Meta+/", bump);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !sessionRef.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cancelRecording();
    };

    stage.focus();
    stage.addEventListener("keydown", onKeyDown, true);
    return () => {
      stage.removeEventListener("keydown", onKeyDown, true);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      sessionRef.current?.cancel();
      runtime.dispose();
    };
  }, []);

  async function startRecording() {
    const runtime = runtimeRef.current;
    const stage = stageRef.current;
    if (!runtime || !stage || sessionRef.current) return;

    groupedStepsRef.current = [];
    pendingSequenceRef.current = false;
    lastStepCountRef.current = 0;
    clearOnCancelRef.current = false;
    setIsRecording(true);
    setRecording("Recording… click Stop when you are done.");
    setCapturedSteps("Waiting for input…");
    setRecordingState("Listening for the first sequence");
    stage.focus();

    try {
      const session = runtime.record({
        timeout: 2_147_483_647,
        suppressHandlers: true,
        onUpdate: (snapshot) => {
          const nextStep = snapshot.steps[lastStepCountRef.current];
          if (!nextStep) {
            return;
          }
          if (pendingSequenceRef.current || groupedStepsRef.current.length === 0) {
            groupedStepsRef.current = [...groupedStepsRef.current, [nextStep]];
            pendingSequenceRef.current = false;
          } else {
            const lastGroup = groupedStepsRef.current[groupedStepsRef.current.length - 1]!;
            groupedStepsRef.current = [
              ...groupedStepsRef.current.slice(0, -1),
              [...lastGroup, nextStep],
            ];
          }
          lastStepCountRef.current = snapshot.steps.length;
          setCapturedSteps(groupedStepsRef.current.map((steps) => steps.join(" ")).join("  •  "));
          setRecordingState("Recording current sequence");
          if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
          }
          inactivityTimerRef.current = setTimeout(() => {
            pendingSequenceRef.current = true;
            setRecordingState("Idle: next key starts a new sequence");
          }, 1200);
        },
      });
      sessionRef.current = session;
      const result = await session.finished;
      const groupedExpression = groupedStepsRef.current
        .map((steps) => steps.join(" "))
        .join("  • ");
      setRecording(groupedExpression || result.expression || "No keys captured");
      setRecordingState("Stopped");
      setLogs(`recorded ${groupedExpression || result.expression || "no keys"}`);
    } catch (error) {
      if (clearOnCancelRef.current) {
        setRecording("Nothing recorded yet");
        setCapturedSteps("No keys captured yet");
        setRecordingState("Cancelled");
        setLogs("capture cancelled and cleared");
        return;
      }
      const message = error instanceof Error ? error.name : "Recording failed";
      setRecording(message);
      setRecordingState("Inactive");
    } finally {
      clearOnCancelRef.current = false;
      sessionRef.current = null;
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      setIsRecording(false);
    }
  }

  function stopRecording() {
    sessionRef.current?.stop();
  }

  function cancelRecording() {
    if (!sessionRef.current) return;
    clearOnCancelRef.current = true;
    sessionRef.current.cancel();
  }

  return (
    <Panel
      title="Recording mode"
      text="Start recording, then keep typing until you click Stop. After a short pause, the next key starts a new sequence in the live preview, and Escape cancels the capture completely."
    >
      <FocusableStage stageRef={stageRef}>
        <div class={styles.kbdRow}>
          <Kbd>Any non-modifier key</Kbd>
          <Kbd>Meta+/</Kbd>
          <Kbd>Escape</Kbd>
        </div>
        <div class={styles.controls}>
          <button
            class={styles.button}
            disabled={isRecording}
            onClick={startRecording}
            type="button"
          >
            {isRecording ? "Recording…" : "Start recording"}
          </button>
          <button
            class={`${styles.button} ${styles.buttonAlt}`}
            disabled={!isRecording}
            onClick={stopRecording}
            type="button"
          >
            Stop recording
          </button>
          <span class={styles.muted}>
            Meta+/ still demonstrates handler suppression while recording is active.
          </span>
        </div>
        <div class={styles.statusGrid}>
          <StatusCard label="Regular shortcut count" value={String(shortcutCount)} />
          <StatusCard label="Sequence state" value={recordingState} />
          <StatusCard label="Capture" value={isRecording ? capturedSteps : recording} />
        </div>
        <ol class={styles.log}>
          {logs.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ol>
      </FocusableStage>
    </Panel>
  );
}

function Panel(props: { title: string; text: string; children: JSX.Element }) {
  return (
    <section class={styles.panel}>
      <header class={styles.panelHead}>
        <h2 class={styles.panelTitle}>{props.title}</h2>
        <p class={styles.panelText}>{props.text}</p>
      </header>
      {props.children}
    </section>
  );
}

function FocusableStage(props: {
  stageRef: RefObject<HTMLDivElement>;
  children: JSX.Element | JSX.Element[];
}) {
  return (
    <div class={styles.stage} ref={props.stageRef} tabIndex={0}>
      <span class={styles.stageLabel}>Focusable runtime boundary</span>
      {props.children}
    </div>
  );
}

function Kbd(props: { children: ComponentChildren }) {
  return <span class={styles.kbd}>{props.children}</span>;
}

function StatusCard(props: { label: string; value: string }) {
  return (
    <div class={styles.statusCard}>
      <span class={styles.statusLabel}>{props.label}</span>
      <p class={styles.statusValue}>{props.value}</p>
    </div>
  );
}

function useLogState(): [string[], LogSetter] {
  const [entries, setEntries] = useState<string[]>([]);
  return [
    entries,
    (entry) =>
      setEntries((current) =>
        [`${new Date().toLocaleTimeString()}: ${entry}`, ...current].slice(0, 6),
      ),
  ];
}

function formatTrace(trace: EvaluationTrace): string {
  return JSON.stringify(
    {
      winner: trace.winner ?? null,
      candidates: trace.candidates.map((candidate) => ({
        id: candidate.bindingId,
        matchedScope: candidate.matchedScope ?? null,
        rejectedBy: candidate.rejectedBy ?? null,
        when: candidate.when?.result ?? null,
      })),
    },
    null,
    2,
  );
}
