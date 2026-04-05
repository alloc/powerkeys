import type { NormalizedKeyEvent } from "../types/public";
import type { Platform } from "../types/internal";

export function buildWhenContext(
  userContext: Record<string, unknown>,
  normalized: NormalizedKeyEvent,
  activeScopes: readonly string[],
  matchedScope: string,
  platform: Platform,
  recording: boolean,
): Record<string, unknown> {
  return {
    context: userContext,
    event: {
      key: normalized.key,
      code: normalized.code,
      repeat: normalized.repeat,
      composing: normalized.composing,
      alt: normalized.modifiers.alt,
      ctrl: normalized.modifiers.ctrl,
      meta: normalized.modifiers.meta,
      shift: normalized.modifiers.shift,
    },
    scope: {
      active: [...activeScopes],
      matched: matchedScope,
    },
    runtime: {
      platform,
      recording,
    },
    ...userContext,
  };
}
