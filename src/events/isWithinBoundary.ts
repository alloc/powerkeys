export function isWithinBoundary(target: Document | HTMLElement, event: KeyboardEvent): boolean {
  if (target instanceof Document) {
    return true;
  }
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (path.length > 0) {
    return path.includes(target);
  }
  const eventTarget = event.target;
  return eventTarget instanceof Node
    ? target.contains(eventTarget) || eventTarget === target
    : false;
}
