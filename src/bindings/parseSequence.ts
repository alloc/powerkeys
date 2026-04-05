import { compileCombo } from "./parseCombo";
import type { CompiledStep, Platform } from "../types/internal";

export function compileSequence(source: string, platform: Platform): readonly CompiledStep[] {
  const segments = source.trim().split(/\s+/).filter(Boolean);
  if (segments.length === 0) {
    throw new TypeError("Sequence must not be empty");
  }
  return segments.map((segment) => compileCombo(segment, platform));
}
