import { calculateModifier } from '@core/rules/CoreRules'

const ROLL_ABILITY_ALIASES = {
  str: 'str',
  strength: 'str',
  力量: 'str',
  dex: 'dex',
  dexterity: 'dex',
  敏捷: 'dex',
  con: 'con',
  constitution: 'con',
  体质: 'con',
  int: 'int',
  intelligence: 'int',
  智力: 'int',
  wis: 'wis',
  wisdom: 'wis',
  感知: 'wis',
  cha: 'cha',
  charisma: 'cha',
  魅力: 'cha',
}

const ROLL_ABILITY_LABELS = {
  str: '力量调整值',
  dex: '敏捷调整值',
  con: '体质调整值',
  int: '智力调整值',
  wis: '感知调整值',
  cha: '魅力调整值',
}

function formatSignedNumber(value) {
  return value >= 0 ? `+${value}` : `${value}`
}

export function normalizeRollFormula(formula = '') {
  return String(formula)
    .replace(/\s+/g, '')
    .replace(/你的/gi, '')
    .replace(/调整值/gi, '')
    .replace(/力量/gi, 'STR')
    .replace(/敏捷/gi, 'DEX')
    .replace(/体质/gi, 'CON')
    .replace(/智力/gi, 'INT')
    .replace(/感知/gi, 'WIS')
    .replace(/魅力/gi, 'CHA')
    .toUpperCase()
}

export function parseRollAction(actionTag) {
  const match = actionTag?.match(/\[@ROLL\(([^:]+):(.*)\)\]/)
  if (!match) {
    return null
  }

  const label = match[1]?.trim()
  const formula = match[2]?.trim()
  if (!label || !formula) {
    return null
  }

  return {
    label,
    formula,
    normalizedFormula: normalizeRollFormula(formula),
  }
}

export function rollFormula(formula, characterSheet) {
  const normalizedFormula = normalizeRollFormula(formula)
  const signedTokens = `${normalizedFormula.startsWith('-') ? '' : '+'}${normalizedFormula}`.match(
    /[+-][^+-]+/g,
  )

  if (!signedTokens?.length) {
    return null
  }

  let total = 0
  const breakdownParts = []

  for (const token of signedTokens) {
    const sign = token.startsWith('-') ? -1 : 1
    const body = token.slice(1)
    const diceMatch = body.match(/^(\d+)D(\d+)$/)

    if (diceMatch) {
      const count = Number(diceMatch[1])
      const sides = Number(diceMatch[2])
      if (!count || !sides) {
        return null
      }

      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
      const diceTotal = rolls.reduce((sum, value) => sum + value, 0)
      total += sign * diceTotal
      breakdownParts.push({
        sign,
        text: `${count}d${sides}(${rolls.join('+')})`,
      })
      continue
    }

    if (/^\d+$/.test(body)) {
      const flatValue = Number(body)
      total += sign * flatValue
      breakdownParts.push({
        sign,
        text: `${flatValue}`,
      })
      continue
    }

    const abilityKey = ROLL_ABILITY_ALIASES[body.toLowerCase()]
    if (!abilityKey) {
      return null
    }

    const abilityScore = characterSheet?.abilities?.[abilityKey]
    if (typeof abilityScore !== 'number') {
      return null
    }

    const modifier = calculateModifier(abilityScore)
    total += sign * modifier
    breakdownParts.push({
      sign,
      text: `${ROLL_ABILITY_LABELS[abilityKey]}(${formatSignedNumber(modifier)})`,
    })
  }

  const breakdown = breakdownParts
    .map((part, index) =>
      index === 0
        ? `${part.sign === -1 ? '-' : ''}${part.text}`
        : `${part.sign === -1 ? ' - ' : ' + '}${part.text}`,
    )
    .join('')

  return {
    total,
    breakdown,
    normalizedFormula,
  }
}
