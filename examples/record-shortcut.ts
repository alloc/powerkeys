import type { RecordingSession, ShortcutRecording, ShortcutRuntime } from 'powerkeys'

export type RecorderCallbacks = {
  preview(expression: string): void
  save(recording: ShortcutRecording): void
}

export function beginShortcutCapture(
  shortcuts: ShortcutRuntime,
  callbacks: RecorderCallbacks,
): RecordingSession {
  const session = shortcuts.record({
    suppressHandlers: true,
    consumeEvents: true,
    onUpdate: (recording) => callbacks.preview(recording.expression),
  })

  void session.finished.then(callbacks.save, () => {})
  return session
}
