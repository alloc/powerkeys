import { createShortcuts, type ShortcutRuntime } from 'powerkeys'

export type NavigationActions = {
  goHome(): void
  goIssues(): void
  focusList(): void
}

export function mountNavigationShortcuts(
  target: Document | HTMLElement,
  actions: NavigationActions,
): ShortcutRuntime {
  const shortcuts = createShortcuts({
    target,
    sequenceTimeout: 800,
  })

  shortcuts.bind({
    sequence: 'g h',
    handler: () => actions.goHome(),
  })

  shortcuts.bind({
    sequence: 'g i',
    handler: () => actions.goIssues(),
  })

  shortcuts.bind({
    sequence: 'g g',
    handler: () => actions.focusList(),
  })

  return shortcuts
}
