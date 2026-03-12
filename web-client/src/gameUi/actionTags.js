import { normalizeRollFormula } from './formulaRolls'

export function parseCheckAction(actionTag) {
  const match = actionTag?.match(/\[@CHECK\(([\s\S]*?)\)\]/)
  if (!match?.[1]) {
    return null
  }

  const payloadParts = match[1]
    .split(':')
    .map((part) => part.trim())
    .filter(Boolean)

  if (payloadParts.length < 2) {
    return null
  }

  const [skill, dcRaw, ...reasonParts] = payloadParts
  const dc = Number(dcRaw)
  if (!skill || !Number.isFinite(dc) || dc <= 0) {
    return null
  }

  return {
    skill,
    dc,
    reason: reasonParts.join(':').trim(),
  }
}

export function parseCheckSetAction(actionTag) {
  const match = actionTag?.match(/\[@CHECK_SET\(([\s\S]*?)\)\]/)
  if (!match?.[1]) {
    return null
  }

  try {
    const parsed = JSON.parse(match[1])
    if (
      !parsed ||
      (parsed.mode !== 'choose_one' && parsed.mode !== 'all') ||
      typeof parsed.label !== 'string' ||
      !Array.isArray(parsed.checks) ||
      parsed.checks.length === 0
    ) {
      return null
    }

    const checks = parsed.checks
      .map((check) => ({
        skill: String(check?.skill || '').trim(),
        dc: Number(check?.dc),
        reason: String(check?.reason || '').trim(),
      }))
      .filter((check) => check.skill && Number.isFinite(check.dc) && check.dc > 0)

    if (!checks.length) {
      return null
    }

    return {
      mode: parsed.mode,
      label: parsed.label.trim(),
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '',
      checks,
    }
  } catch {
    return null
  }
}

function deriveCheckActionFromNarrative(content) {
  const match =
    content.match(/请(?:你)?(?:先)?(?:进行|做|来|过|完成)(?:一次)?\s*([^\n。！]*?)检定[^。\n]*?(?:目标\s*)?(?:AC|DC|难度)\s*[:：]?\s*(\d{1,2})/i) ||
    content.match(/请(?:你)?(?:先)?进行(?:一次)?\s*([^\n。！]*?)检定[^。\n]*?(\d{1,2})/i)

  if (!match) {
    return null
  }

  const skill = match[1]?.replace(/[（(].*$/, '').replace(/[:：]/g, '').trim()
  const dc = match[2]?.trim()

  return skill && dc ? `[@CHECK(${skill}:${dc})]` : null
}

function deriveRollActionFromNarrative(content) {
  if (!/(请|需要|重掷|先把|要投)/.test(content) || !/(掷|投)/.test(content)) {
    return null
  }

  const formulaMatch = content.match(
    /(\d+d\d+(?:\s*[+-]\s*(?:\d+|(?:你的)?(?:力量|敏捷|体质|智力|感知|魅力)(?:调整值)?|(?:STR|DEX|CON|INT|WIS|CHA)))*)/i,
  )

  if (!formulaMatch?.[1]) {
    return null
  }

  const labelMatch = content.match(/([^\s（(，。；:\n]{1,12})伤害/)
  const label = labelMatch?.[1]
    ? `${labelMatch[1]}伤害`
    : content.includes('治疗')
      ? '治疗掷骰'
      : '数值掷骰'

  return `[@ROLL(${label}:${normalizeRollFormula(formulaMatch[1])})]`
}

export function deriveSystemActionFromNarrative(content, existingActions = []) {
  if (
    existingActions.some(
      (action) =>
        action.startsWith('[@CHECK(') ||
        action.startsWith('[@CHECK_SET(') ||
        action.startsWith('[@ROLL('),
    )
  ) {
    return null
  }

  return deriveCheckActionFromNarrative(content) || deriveRollActionFromNarrative(content)
}
