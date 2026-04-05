import { canonicalizePrimaryKey } from "../bindings/canonicalizeStep";
import type { NormalizedKeyEvent } from "../types/public";

export function normalizeKeyboardEvent(event: KeyboardEvent): NormalizedKeyEvent {
  return {
    type: event.type === "keyup" ? "keyup" : "keydown",
    key: canonicalizePrimaryKey(event.key),
    code: event.code,
    modifiers: {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
    },
    repeat: event.repeat,
    composing: event.isComposing,
    target: event.target,
    nativeEvent: event,
  };
}
