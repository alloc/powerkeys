import { buildModifierState } from "../bindings/canonicalizeStep";
import { isEditableTarget } from "../events/isEditableTarget";
import type { BindingRecord, Candidate, CompiledStep } from "../types/internal";
import type { NormalizedKeyEvent } from "../types/public";

export function matchesStep(event: NormalizedKeyEvent, step: CompiledStep): boolean {
  if (event.key !== step.key) {
    return false;
  }
  const expected = buildModifierState(step);
  return (
    event.modifiers.ctrl === expected.ctrl &&
    event.modifiers.meta === expected.meta &&
    event.modifiers.alt === expected.alt &&
    event.modifiers.shift === expected.shift
  );
}

export function evaluateEditablePolicy(
  binding: BindingRecord,
  target: EventTarget | null,
  modifiers: NormalizedKeyEvent["modifiers"],
): { allowed: boolean } {
  if (!isEditableTarget(target)) {
    return { allowed: true };
  }
  switch (binding.editablePolicy) {
    case "allow-in-editable":
      return { allowed: true };
    case "allow-if-meta":
      return { allowed: modifiers.meta || modifiers.ctrl };
    case "ignore-editable":
    default:
      return { allowed: false };
  }
}

export function chooseWinner(
  candidates: Candidate[],
  activeScopes: readonly string[],
): Candidate | undefined {
  return [...candidates].sort((left, right) => {
    if (left.binding.priority !== right.binding.priority) {
      return right.binding.priority - left.binding.priority;
    }
    if (left.kind !== right.kind) {
      return left.kind === "sequence" ? -1 : 1;
    }
    if (left.sequenceLength !== right.sequenceLength) {
      return right.sequenceLength - left.sequenceLength;
    }
    const leftScopeIndex = activeScopes.indexOf(left.matchedScope);
    const rightScopeIndex = activeScopes.indexOf(right.matchedScope);
    if (leftScopeIndex !== rightScopeIndex) {
      return leftScopeIndex - rightScopeIndex;
    }
    return right.binding.order - left.binding.order;
  })[0];
}

export function applyConsumption(binding: BindingRecord, nativeEvent: KeyboardEvent): void {
  if (binding.preventDefault) {
    nativeEvent.preventDefault();
  }
  if (binding.stopPropagation) {
    nativeEvent.stopPropagation();
  }
}
