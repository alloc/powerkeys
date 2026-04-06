import { createShortcuts, type ShortcutRuntime } from 'powerkeys'

export type EditorState = {
  modalOpen: boolean
  hasSelection: boolean
  readOnly: boolean
}

export type EditorActions = {
  closeEditor(): void
  closeModal(): void
  copySelection(): void
}

export function mountEditorShortcuts(
  target: HTMLElement,
  state: EditorState,
  actions: EditorActions,
): {
  shortcuts: ShortcutRuntime
  syncState(nextState: Partial<EditorState>): void
} {
  const shortcuts = createShortcuts({
    target,
    getActiveScopes: () => (state.modalOpen ? ['modal', 'editor'] : ['editor']),
  })

  shortcuts.bind({
    combo: 'Escape',
    scope: 'editor',
    handler: () => actions.closeEditor(),
  })

  shortcuts.bind({
    combo: 'Escape',
    scope: 'modal',
    priority: 10,
    handler: () => actions.closeModal(),
  })

  shortcuts.bind({
    combo: 'c',
    scope: 'editor',
    when: 'editor.hasSelection && !editor.readOnly',
    handler: () => actions.copySelection(),
  })

  const syncState = (nextState: Partial<EditorState>): void => {
    Object.assign(state, nextState)
    shortcuts.batchContext({
      'editor.hasSelection': state.hasSelection,
      'editor.readOnly': state.readOnly,
    })
  }

  syncState(state)
  return { shortcuts, syncState }
}
