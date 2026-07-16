export function isWithinBoundary(target: Document | HTMLElement, event: KeyboardEvent): boolean {
  return getBoundaryDepth(target, event) != null
}

export function getBoundaryDepth(
  target: Document | HTMLElement | undefined,
  event: KeyboardEvent,
): number | undefined {
  if (!target || target instanceof Document) {
    return Number.POSITIVE_INFINITY
  }
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.length > 0) {
    // The path starts at the event origin, so a lower index is a narrower boundary.
    const index = path.indexOf(target)
    return index >= 0 ? index : undefined
  }
  const eventTarget = event.target
  if (!(eventTarget instanceof Node) || (!target.contains(eventTarget) && eventTarget !== target)) {
    return undefined
  }

  let depth = 0
  let current: Node | null = eventTarget
  while (current && current !== target) {
    current = current.parentNode
    depth += 1
  }
  return current === target ? depth : undefined
}
