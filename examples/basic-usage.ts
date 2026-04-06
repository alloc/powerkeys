import { createShortcuts, type ShortcutRuntime } from 'powerkeys'

export type BasicActions = {
  openPalette(): void
  closeSurface(): void
}

export function mountBasicShortcuts(
  target: Document | HTMLElement,
  actions: BasicActions,
): ShortcutRuntime {
  const shortcuts = createShortcuts({ target })

  shortcuts.bind({
    combo: 'Mod+k',
    preventDefault: true,
    handler: () => actions.openPalette(),
  })

  shortcuts.bind({
    combo: 'Escape',
    handler: () => actions.closeSurface(),
  })

  return shortcuts
}
