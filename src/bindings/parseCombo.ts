import { canonicalizePrimaryKey, parseBindingToken, stepToExpression } from './canonicalizeStep'
import type { CompiledStep, ModifierName, Platform } from '../types/internal'
import { MODIFIER_ORDER } from '../types/internal'

const DIGIT_CODE_PATTERN = /^Digit([0-9])$/i
const KEY_CODE_PATTERN = /^Key([a-z])$/i

export function compileCombo(source: string, platform: Platform): CompiledStep {
  const trimmed = source.trim()
  if (!trimmed) {
    throw new TypeError('Combo must not be empty')
  }

  const tokens = trimmed
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
  if (tokens.length === 0) {
    throw new TypeError('Combo must not be empty')
  }

  let primaryKey: string | null = null
  const modifiers = new Set<ModifierName>()

  for (const token of tokens) {
    const parsed = parseBindingToken(token)
    if (parsed.type === 'modifier') {
      if (parsed.name === 'Mod') {
        modifiers.add(platform === 'mac' ? 'Meta' : 'Ctrl')
      } else {
        modifiers.add(parsed.name)
      }
      continue
    }

    if (primaryKey) {
      throw new TypeError(`Combo "${source}" has multiple primary keys`)
    }
    primaryKey = parsed.key
  }

  if (!primaryKey) {
    throw new TypeError(`Combo "${source}" must include a primary key`)
  }

  if (primaryKey === 'Mod') {
    throw new TypeError('Mod cannot be used as a primary key')
  }

  const orderedModifiers = MODIFIER_ORDER.filter((name) => modifiers.has(name))
  const usesAlt = orderedModifiers.includes('Alt')
  const physicalDigit = primaryKey.match(DIGIT_CODE_PATTERN)
  const physicalKey = primaryKey.match(KEY_CODE_PATTERN)
  const digitCode = physicalDigit ? `Digit${physicalDigit[1]!}` : undefined
  const keyCode = physicalKey ? `Key${physicalKey[1]!.toUpperCase()}` : undefined
  const explicitCode = digitCode ?? keyCode
  const primary = physicalDigit
    ? physicalDigit[1]!
    : physicalKey
      ? physicalKey[1]!.toLowerCase()
      : canonicalizePrimaryKey(primaryKey)
  const altPrintableCode =
    usesAlt && primary.length === 1
      ? /[0-9]/.test(primary)
        ? `Digit${primary}`
        : /[a-z]/.test(primary)
          ? `Key${primary.toUpperCase()}`
          : undefined
      : undefined
  const code = explicitCode ?? altPrintableCode

  return {
    key: primary,
    code,
    modifiers: orderedModifiers,
    expression: stepToExpression(orderedModifiers, explicitCode ?? primary),
  }
}
