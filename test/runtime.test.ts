import { createShortcuts } from '../src/index'

function keydown(target: EventTarget, init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function keyup(target: EventTarget, init: KeyboardEventInit & { key: string }): KeyboardEvent {
  const event = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

describe('powerkeys', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('binds and dispatches a basic combo', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    shortcuts.bind('Ctrl+k', () => calls.push('palette'))

    keydown(host, { key: 'k', ctrlKey: true, code: 'KeyK' })

    expect(calls).toEqual(['palette'])
    shortcuts.dispose()
  })

  it('matches alt number-row shortcuts by physical digit code', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    shortcuts.bind('Alt+1', () => calls.push('semantic'))
    shortcuts.bind('Alt+Digit2', () => calls.push('physical'))

    keydown(host, { key: '¡', code: 'Digit1', altKey: true })
    keydown(host, { key: '™', code: 'Digit2', altKey: true })

    expect(calls).toEqual(['semantic', 'physical'])
    shortcuts.dispose()
  })

  it('matches alt letter shortcuts by physical key code', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    shortcuts.bind('Alt+l', () => calls.push('semantic'))
    shortcuts.bind('Alt+KeyM', () => calls.push('physical'))

    keydown(host, { key: '¬', code: 'KeyL', altKey: true })
    keydown(host, { key: 'µ', code: 'KeyM', altKey: true })

    expect(calls).toEqual(['semantic', 'physical'])
    shortcuts.dispose()
  })

  it('keeps non-alt printable shortcuts semantic unless physical code is explicit', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    shortcuts.bind('1', () => calls.push('semantic digit'))
    shortcuts.bind('Digit2', () => calls.push('physical digit'))
    shortcuts.bind('l', () => calls.push('semantic letter'))
    shortcuts.bind('KeyM', () => calls.push('physical letter'))

    keydown(host, { key: '¡', code: 'Digit1' })
    keydown(host, { key: '™', code: 'Digit2' })
    keydown(host, { key: '¬', code: 'KeyL' })
    keydown(host, { key: 'µ', code: 'KeyM' })

    expect(calls).toEqual(['physical digit', 'physical letter'])
    shortcuts.dispose()
  })

  it('evaluates when clauses against nested context keys', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    shortcuts.setContext('editor.focus', true)
    shortcuts.setContext('editor.hasSelection', false)

    shortcuts.bind({
      combo: 'c',
      when: 'editor.focus && editor.hasSelection',
      handler: () => calls.push('copy'),
    })

    keydown(host, { key: 'c', code: 'KeyC' })
    expect(calls).toEqual([])

    shortcuts.setContext('editor.hasSelection', true)
    keydown(host, { key: 'c', code: 'KeyC' })
    expect(calls).toEqual(['copy'])
    shortcuts.dispose()
  })

  it('filters canDispatch candidates before choosing a winner', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const guardCalls: Array<{
      combo: string
      handler: unknown
      matchedScope: string
    }> = []
    const highPriority = () => calls.push('high')
    const lowPriority = () => calls.push('low')
    const shortcuts = createShortcuts({
      target: host,
      canDispatch: (candidate) => {
        guardCalls.push({
          combo: candidate.combo,
          handler: candidate.handler,
          matchedScope: candidate.matchedScope,
        })
        return candidate.handler !== highPriority
      },
    })

    shortcuts.bind({
      combo: 'x',
      priority: 10,
      preventDefault: true,
      handler: highPriority,
    })
    shortcuts.bind({ combo: 'x', handler: lowPriority })

    const event = keydown(host, { key: 'x', code: 'KeyX' })

    expect(calls).toEqual(['low'])
    expect(event.defaultPrevented).toBe(false)
    expect(guardCalls).toEqual([
      { combo: 'x', handler: highPriority, matchedScope: 'root' },
      { combo: 'x', handler: lowPriority, matchedScope: 'root' },
    ])
    shortcuts.dispose()
  })

  it('runs canDispatch only after when clauses pass', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const guardCalls: unknown[] = []
    const blocked = () => calls.push('blocked')
    const available = () => calls.push('available')
    const shortcuts = createShortcuts({
      target: host,
      canDispatch: (candidate) => {
        guardCalls.push(candidate.handler)
        return true
      },
    })
    shortcuts.setContext('editor.enabled', false)

    shortcuts.bind({
      combo: 'x',
      priority: 10,
      when: 'editor.enabled',
      handler: blocked,
    })
    shortcuts.bind({ combo: 'x', handler: available })

    keydown(host, { key: 'x', code: 'KeyX' })

    expect(calls).toEqual(['available'])
    expect(guardCalls).toEqual([available])
    shortcuts.dispose()
  })

  it('reports canDispatch errors and keeps lower-priority candidates eligible', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const errors: string[] = []
    const throwing = () => calls.push('throwing')
    const available = () => calls.push('available')
    const shortcuts = createShortcuts({
      target: host,
      canDispatch: (candidate) => {
        if (candidate.handler === throwing) {
          throw new Error('not handled')
        }
        return true
      },
      onError: (error, info) => {
        errors.push(
          `${info.phase}:${info.bindingId}:${error instanceof Error ? error.message : String(error)}`,
        )
      },
    })

    const throwingHandle = shortcuts.bind({
      combo: 'x',
      priority: 10,
      handler: throwing,
    })
    shortcuts.bind({ combo: 'x', handler: available })

    keydown(host, { key: 'x', code: 'KeyX' })

    expect(calls).toEqual(['available'])
    expect(errors).toEqual([`canDispatch:${throwingHandle.id}:not handled`])
    shortcuts.dispose()
  })

  it('resolves scope precedence through getActiveScopes', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({
      target: host,
      getActiveScopes: () => ['modal', 'editor'],
    })

    shortcuts.bind({ combo: 'Escape', scope: 'editor', handler: () => calls.push('editor') })
    shortcuts.bind({ combo: 'Escape', scope: 'modal', handler: () => calls.push('modal') })

    keydown(host, { key: 'Escape', code: 'Escape' })

    expect(calls).toEqual(['modal'])
    shortcuts.dispose()
  })

  it('checks external availability against active scopes and when clauses', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const shortcuts = createShortcuts({
      target: host,
      getActiveScopes: () => ['modal', 'editor'],
    })
    shortcuts.setContext('editor.canCopy', true)

    expect(
      shortcuts.isAvailable({
        scope: ['sidebar', 'modal'] as const,
        when: 'scope.matched === "modal" && editor.canCopy',
      }),
    ).toBe(true)
    expect(
      shortcuts.isAvailable({
        scope: 'sidebar',
        when: 'editor.canCopy',
      }),
    ).toBe(false)

    shortcuts.dispose()
  })

  it('does not run canDispatch for external availability checks', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({
      target: host,
      canDispatch: () => {
        calls.push('guard')
        return false
      },
    })

    expect(shortcuts.isAvailable({ when: 'true' })).toBe(true)
    expect(calls).toEqual([])
    shortcuts.dispose()
  })

  it('provides inert event values for external availability checks', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const shortcuts = createShortcuts({ target: host })

    expect(
      shortcuts.isAvailable({
        when: 'event.key == null && !event.ctrl && !event.meta && !event.repeat',
      }),
    ).toBe(true)
    expect(
      shortcuts.isAvailable({
        when: 'event.ctrl',
      }),
    ).toBe(false)

    shortcuts.dispose()
  })

  it('supports overlapping sequences with shared prefixes', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host, sequenceTimeout: 1000 })

    shortcuts.bind({ sequence: 'g g l', handler: () => calls.push('ggl') })
    shortcuts.bind({ sequence: 'g g o', handler: () => calls.push('ggo') })

    keydown(host, { key: 'g', code: 'KeyG' })
    keydown(host, { key: 'g', code: 'KeyG' })
    keydown(host, { key: 'o', code: 'KeyO' })

    expect(calls).toEqual(['ggo'])
    shortcuts.dispose()
  })

  it('pauses a scope and prevents dispatch', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({
      target: host,
      getActiveScopes: () => ['editor'],
    })

    shortcuts.bind({ combo: 'Escape', scope: 'editor', handler: () => calls.push('editor') })
    shortcuts.pause('editor')
    keydown(host, { key: 'Escape', code: 'Escape' })
    expect(calls).toEqual([])

    shortcuts.resume('editor')
    keydown(host, { key: 'Escape', code: 'Escape' })
    expect(calls).toEqual(['editor'])
    shortcuts.dispose()
  })

  it('ignores paused scopes when checking external availability', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const shortcuts = createShortcuts({
      target: host,
      getActiveScopes: () => ['editor'],
    })

    shortcuts.pause('editor')

    expect(
      shortcuts.isAvailable({
        scope: 'editor',
        when: 'true',
      }),
    ).toBe(true)

    shortcuts.dispose()
  })

  it('treats when evaluation errors as unavailable for external checks', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const shortcuts = createShortcuts({ target: host })
    shortcuts.setContext('editor', null)

    expect(
      shortcuts.isAvailable({
        when: 'editor.canCopy',
      }),
    ).toBe(false)

    shortcuts.dispose()
  })

  it('throws on invalid when syntax for external availability checks', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const shortcuts = createShortcuts({ target: host })

    expect(() =>
      shortcuts.isAvailable({
        when: '(',
      }),
    ).toThrow()

    shortcuts.dispose()
  })

  it('records shortcuts while suppressing handlers', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host, sequenceTimeout: 30 })
    shortcuts.bind('Meta+k', () => calls.push('handler'))

    const session = shortcuts.record({ suppressHandlers: true, timeout: 10 })

    keydown(host, { key: 'k', metaKey: true, code: 'KeyK' })
    keydown(host, { key: 'c', code: 'KeyC' })

    const recording = await session.finished

    expect(calls).toEqual([])
    expect(recording.steps).toEqual(['Meta+k', 'c'])
    expect(recording.expression).toBe('Meta+k c')
    shortcuts.dispose()
  })

  it('emits live recording snapshots as steps are captured', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const updates: string[] = []
    const shortcuts = createShortcuts({ target: host, sequenceTimeout: 30 })
    const session = shortcuts.record({
      suppressHandlers: true,
      timeout: 10,
      onUpdate: (recording) => updates.push(recording.expression),
    })

    keydown(host, { key: 'k', metaKey: true, code: 'KeyK' })
    keydown(host, { key: 'c', code: 'KeyC' })

    await session.finished

    expect(updates).toEqual(['Meta+k', 'Meta+k c'])
    shortcuts.dispose()
  })

  it('auto-finishes idle recordings after timeout', async () => {
    vi.useFakeTimers()
    try {
      const host = document.createElement('div')
      document.body.appendChild(host)

      const shortcuts = createShortcuts({ target: host, sequenceTimeout: 30 })
      const session = shortcuts.record({ timeout: 10 })

      await vi.advanceTimersByTimeAsync(10)

      await expect(session.finished).resolves.toEqual({
        steps: [],
        expression: '',
        eventType: 'keydown',
      })
      shortcuts.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('continues recording if onUpdate throws', async () => {
    vi.useFakeTimers()
    try {
      const host = document.createElement('div')
      document.body.appendChild(host)

      const errors: string[] = []
      const shortcuts = createShortcuts({
        target: host,
        sequenceTimeout: 30,
        onError: (error, info) => {
          errors.push(`${info.phase}:${error instanceof Error ? error.message : String(error)}`)
        },
      })

      const session = shortcuts.record({
        timeout: 10,
        onUpdate: () => {
          throw new Error('boom')
        },
      })

      keydown(host, { key: 'k', code: 'KeyK' })
      await vi.advanceTimersByTimeAsync(10)

      await expect(session.finished).resolves.toEqual({
        steps: ['k'],
        expression: 'k',
        eventType: 'keydown',
      })
      expect(errors).toEqual(['recording:boom'])
      shortcuts.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores modifier-only presses while recording', async () => {
    vi.useFakeTimers()
    try {
      const host = document.createElement('div')
      document.body.appendChild(host)

      const shortcuts = createShortcuts({ target: host, sequenceTimeout: 30 })
      const session = shortcuts.record({ suppressHandlers: true, timeout: 10 })

      keydown(host, { key: 'Control', code: 'ControlLeft', ctrlKey: true })
      keydown(host, { key: 'k', code: 'KeyK', ctrlKey: true })
      await vi.advanceTimersByTimeAsync(10)

      await expect(session.finished).resolves.toEqual({
        steps: ['Ctrl+k'],
        expression: 'Ctrl+k',
        eventType: 'keydown',
      })
      shortcuts.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('explains why a binding did not match', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const shortcuts = createShortcuts({ target: host })
    shortcuts.setContext('editor.focus', true)
    shortcuts.setContext('editor.hasSelection', false)
    shortcuts.bind({
      combo: 'c',
      when: 'editor.focus && editor.hasSelection',
      handler: () => {},
    })

    const event = new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true })
    Object.defineProperty(event, 'target', { value: host })

    const trace = shortcuts.explain(event)

    expect(trace.winner).toBeUndefined()
    expect(trace.candidates[0]?.when?.result).toBe(false)
    expect(trace.candidates[0]?.rejectedBy).toBe('when')
    shortcuts.dispose()
  })

  it('explains candidates rejected by canDispatch', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const rejected = () => calls.push('rejected')
    const accepted = () => calls.push('accepted')
    const shortcuts = createShortcuts({
      target: host,
      canDispatch: (candidate) => candidate.handler !== rejected,
    })

    const rejectedHandle = shortcuts.bind({
      combo: 'x',
      priority: 10,
      handler: rejected,
    })
    const acceptedHandle = shortcuts.bind({ combo: 'x', handler: accepted })

    const event = new KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true })
    Object.defineProperty(event, 'target', { value: host })

    const trace = shortcuts.explain(event)
    const rejectedTrace = trace.candidates.find(
      (candidate) => candidate.bindingId === rejectedHandle.id,
    )

    expect(calls).toEqual([])
    expect(trace.winner).toBe(acceptedHandle.id)
    expect(rejectedTrace?.canDispatch?.result).toBe(false)
    expect(rejectedTrace?.rejectedBy).toBe('can-dispatch')
    shortcuts.dispose()
  })

  it('respects editable-target policy overrides', () => {
    const host = document.createElement('div')
    const input = document.createElement('input')
    host.appendChild(input)
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    shortcuts.bind({ combo: 'k', handler: () => calls.push('blocked') })
    shortcuts.bind({
      combo: 'Meta+k',
      editablePolicy: 'allow-if-meta',
      handler: () => calls.push('allowed'),
    })

    keydown(input, { key: 'k', code: 'KeyK' })
    keydown(input, { key: 'k', code: 'KeyK', metaKey: true })

    expect(calls).toEqual(['allowed'])
    shortcuts.dispose()
  })

  it('replaces binding-set contents atomically', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    const bindingSet = shortcuts.createBindingSet()

    bindingSet.replace([{ combo: 'Meta+k', handler: () => calls.push('original') }])

    keydown(host, { key: 'k', metaKey: true, code: 'KeyK' })
    expect(calls).toEqual(['original'])

    expect(() =>
      bindingSet.replace([
        { combo: 'Meta+l', handler: () => calls.push('next') },
        { handler: () => calls.push('invalid') },
      ]),
    ).toThrow()

    keydown(host, { key: 'k', metaKey: true, code: 'KeyK' })
    keydown(host, { key: 'l', metaKey: true, code: 'KeyL' })

    expect(calls).toEqual(['original', 'original'])
    expect(bindingSet.getBindings().map((binding) => binding.expression)).toEqual(['Meta+k'])
    shortcuts.dispose()
  })

  it('clears and disposes binding sets', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    const bindingSet = shortcuts.createBindingSet()

    bindingSet.replace([{ combo: 'Meta+k', handler: () => calls.push('active') }])
    bindingSet.clear()

    keydown(host, { key: 'k', metaKey: true, code: 'KeyK' })
    expect(calls).toEqual([])
    expect(bindingSet.getBindings()).toEqual([])

    bindingSet.replace([{ combo: 'Meta+l', handler: () => calls.push('next') }])
    bindingSet.dispose()

    keydown(host, { key: 'l', metaKey: true, code: 'KeyL' })
    expect(calls).toEqual([])
    expect(bindingSet.getBindings()).toEqual([])
    expect(() => bindingSet.replace([{ combo: 'Meta+/', handler: () => {} }])).toThrow(
      'Binding set is disposed',
    )
    shortcuts.dispose()
  })

  it('preserves direct-binding precedence across repeated binding-set replacement', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    const bindingSet = shortcuts.createBindingSet()

    shortcuts.bind({ combo: 'x', handler: () => calls.push('direct') })
    bindingSet.replace([{ combo: 'x', handler: () => calls.push('set-first') }])

    keydown(host, { key: 'x', code: 'KeyX' })
    expect(calls).toEqual(['direct'])

    calls.length = 0
    bindingSet.replace([{ combo: 'x', handler: () => calls.push('set-second') }])
    keydown(host, { key: 'x', code: 'KeyX' })

    expect(calls).toEqual(['direct'])
    expect(shortcuts.getBindings().map((binding) => binding.expression)).toEqual(['x', 'x'])
    shortcuts.dispose()
  })

  it('preserves binding-set precedence across repeated replacement', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const calls: string[] = []
    const shortcuts = createShortcuts({ target: host })
    const firstSet = shortcuts.createBindingSet()
    const secondSet = shortcuts.createBindingSet()

    secondSet.replace([{ combo: 'x', handler: () => calls.push('second') }])
    firstSet.replace([{ combo: 'x', handler: () => calls.push('first') }])

    keydown(host, { key: 'x', code: 'KeyX' })
    expect(calls).toEqual(['second'])

    calls.length = 0
    firstSet.replace([{ combo: 'x', handler: () => calls.push('first-again') }])
    keydown(host, { key: 'x', code: 'KeyX' })

    expect(calls).toEqual(['second'])
    shortcuts.dispose()
  })

  it('drops active sequence state when replacing a binding set', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const shortcuts = createShortcuts({ target: host, sequenceTimeout: 1000 })
    const bindingSet = shortcuts.createBindingSet()

    bindingSet.replace([{ sequence: 'g g', handler: () => {} }])

    keydown(host, { key: 'g', code: 'KeyG' })
    expect(shortcuts.getActiveSequences()).toHaveLength(1)

    bindingSet.replace([{ combo: 'x', handler: () => {} }])

    expect(shortcuts.getActiveSequences()).toEqual([])
    shortcuts.dispose()
  })

  it('returns binding snapshots in stable runtime order', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const shortcuts = createShortcuts({ target: host })
    const earlySet = shortcuts.createBindingSet()
    const lateSet = shortcuts.createBindingSet()

    lateSet.replace([{ combo: 'z', handler: () => {} }])
    earlySet.replace([
      { combo: 'x', handler: () => {} },
      { combo: 'y', handler: () => {} },
    ])

    expect(earlySet.getBindings().map((binding) => binding.expression)).toEqual(['x', 'y'])
    expect(shortcuts.getBindings().map((binding) => binding.expression)).toEqual(['x', 'y', 'z'])

    earlySet.replace([{ combo: 'w', handler: () => {} }])

    expect(shortcuts.getBindings().map((binding) => binding.expression)).toEqual(['w', 'z'])
    shortcuts.dispose()
  })
})
