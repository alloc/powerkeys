import { createShortcuts } from 'powerkeys'
import { mountBasicShortcuts } from '../examples/basic-usage'
import { mountCommandAvailability } from '../examples/command-availability'
import { mountCustomizableShortcuts } from '../examples/customizable-shortcuts'
import { beginShortcutCapture } from '../examples/record-shortcut'
import { mountEditorShortcuts } from '../examples/scopes-and-when'
import { mountNavigationShortcuts } from '../examples/sequences'

function keydown(target: EventTarget, init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function withPlatform<T>(platform: string, run: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'platform')
  Object.defineProperty(navigator, 'platform', {
    configurable: true,
    value: platform,
  })
  try {
    return run()
  } finally {
    if (descriptor) {
      Object.defineProperty(navigator, 'platform', descriptor)
    } else {
      delete (navigator as Navigator & { platform?: string }).platform
    }
  }
}

describe('documentation examples', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('demonstrates the basic combo example', () => {
    withPlatform('MacIntel', () => {
      const host = document.createElement('div')
      document.body.appendChild(host)

      const calls: string[] = []
      const shortcuts = mountBasicShortcuts(host, {
        openPalette: () => calls.push('palette'),
        closeSurface: () => calls.push('close'),
      })

      const paletteEvent = keydown(host, { key: 'k', metaKey: true, code: 'KeyK' })
      expect(calls).toEqual(['palette'])
      expect(paletteEvent.defaultPrevented).toBe(true)

      keydown(host, { key: 'Escape', code: 'Escape' })
      expect(calls).toEqual(['palette', 'close'])

      shortcuts.dispose()
    })
  })

  it('demonstrates scopes and when clauses', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const state = {
      modalOpen: false,
      hasSelection: false,
      readOnly: false,
    }
    const calls: string[] = []
    const { shortcuts, syncState } = mountEditorShortcuts(host, state, {
      closeEditor: () => calls.push('editor'),
      closeModal: () => calls.push('modal'),
      copySelection: () => calls.push('copy'),
    })

    keydown(host, { key: 'Escape', code: 'Escape' })
    expect(calls).toEqual(['editor'])

    keydown(host, { key: 'c', code: 'KeyC' })
    expect(calls).toEqual(['editor'])

    syncState({ hasSelection: true })
    keydown(host, { key: 'c', code: 'KeyC' })
    expect(calls).toEqual(['editor', 'copy'])

    syncState({ modalOpen: true })
    keydown(host, { key: 'Escape', code: 'Escape' })
    expect(calls).toEqual(['editor', 'copy', 'modal'])

    syncState({ readOnly: true })
    keydown(host, { key: 'c', code: 'KeyC' })
    expect(calls).toEqual(['editor', 'copy', 'modal'])

    shortcuts.dispose()
  })

  it('demonstrates external command availability checks', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const state = {
      modalOpen: false,
      canRename: false,
      readOnly: false,
    }
    const calls: string[] = []
    const { shortcuts, getPaletteCommands, syncState } = mountCommandAvailability(host, state, {
      renameSymbol: () => calls.push('rename'),
    })

    expect(getPaletteCommands().map((command) => command.id)).toEqual([])

    syncState({ canRename: true })
    expect(getPaletteCommands().map((command) => command.id)).toEqual(['editor.renameSymbol'])

    keydown(host, { key: 'F2', code: 'F2' })
    expect(calls).toEqual(['rename'])

    syncState({ readOnly: true })
    expect(getPaletteCommands().map((command) => command.id)).toEqual([])

    keydown(host, { key: 'F2', code: 'F2' })
    expect(calls).toEqual(['rename'])

    shortcuts.dispose()
  })

  it('demonstrates sequence bindings', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = mountNavigationShortcuts(host, {
      goHome: () => calls.push('home'),
      goIssues: () => calls.push('issues'),
      focusList: () => calls.push('list'),
    })

    keydown(host, { key: 'g', code: 'KeyG' })
    keydown(host, { key: 'h', code: 'KeyH' })
    keydown(host, { key: 'g', code: 'KeyG' })
    keydown(host, { key: 'g', code: 'KeyG' })

    expect(calls).toEqual(['home', 'list'])
    shortcuts.dispose()
  })

  it('demonstrates shortcut recording', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const previews: string[] = []
    const saved: string[] = []
    const shortcuts = createShortcuts({ target: host, sequenceTimeout: 20 })
    const session = beginShortcutCapture(shortcuts, {
      preview: (expression) => previews.push(expression),
      save: (recording) => saved.push(recording.expression),
    })

    keydown(host, { key: 'k', code: 'KeyK', ctrlKey: true })
    keydown(host, { key: 'c', code: 'KeyC' })

    await expect(session.finished).resolves.toMatchObject({
      expression: 'Ctrl+k c',
    })
    expect(previews).toEqual(['Ctrl+k', 'Ctrl+k c'])
    expect(saved).toEqual(['Ctrl+k c'])

    shortcuts.dispose()
  })

  it('demonstrates rebinding a user-configurable shortcut set', () => {
    withPlatform('MacIntel', () => {
      const host = document.createElement('div')
      document.body.appendChild(host)

      const state = {
        openPalette: 'Meta+k',
        renameSymbol: 'g r',
      }
      const calls: string[] = []
      const { shortcuts, syncBindings } = mountCustomizableShortcuts(host, state, {
        openPalette: () => calls.push('palette'),
        renameSymbol: () => calls.push('rename'),
      })

      const originalPaletteEvent = keydown(host, {
        key: 'k',
        metaKey: true,
        code: 'KeyK',
      })
      expect(originalPaletteEvent.defaultPrevented).toBe(true)

      keydown(host, { key: 'g', code: 'KeyG' })
      keydown(host, { key: 'r', code: 'KeyR' })
      expect(calls).toEqual(['palette', 'rename'])

      syncBindings({
        openPalette: 'Meta+/',
        renameSymbol: null,
      })

      keydown(host, { key: 'k', metaKey: true, code: 'KeyK' })
      keydown(host, { key: 'g', code: 'KeyG' })
      keydown(host, { key: 'r', code: 'KeyR' })
      expect(calls).toEqual(['palette', 'rename'])

      const reboundPaletteEvent = keydown(host, {
        key: '/',
        metaKey: true,
        code: 'Slash',
      })
      expect(reboundPaletteEvent.defaultPrevented).toBe(true)
      expect(calls).toEqual(['palette', 'rename', 'palette'])

      shortcuts.dispose()
    })
  })
})
