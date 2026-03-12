import { calculateCheckResult, resolveCheckSetup } from '@core/rules/CoreRules'

function getCheckModifiers(characterSheet) {
  return Array.isArray(characterSheet?.checkModifiers) ? characterSheet.checkModifiers : []
}

function formatCheckVerdict(outcome) {
  return outcome.isSuccess ? '成功' : '失败'
}

function formatCheckStaticParts(parts) {
  return parts.map((part) => `${part.label}(${part.value >= 0 ? `+${part.value}` : part.value})`)
}

export function getCheckPreview(characterSheet, check) {
  const setup = resolveCheckSetup(
    check.skill,
    characterSheet.abilities,
    characterSheet.proficiencies.skills,
    characterSheet.level,
    {
      checkModifiers: getCheckModifiers(characterSheet),
    },
  )

  return {
    ...setup,
    breakdownLabel: formatCheckStaticParts(setup.parts).join(' + '),
    criticalRule:
      '普通检定只按总值是否达到 DC 结算。原始 d20 点数会被记录给 DM 参考，但不会自动变成大成功或大失败。',
  }
}

export function resolveCheckOutcome(characterSheet, check) {
  const roll = Math.floor(Math.random() * 20) + 1
  const result = calculateCheckResult(
    roll,
    check.skill,
    characterSheet.abilities,
    characterSheet.proficiencies.skills,
    characterSheet.level,
    {
      checkModifiers: getCheckModifiers(characterSheet),
    },
  )

  return {
    ...check,
    roll,
    total: result.total,
    rollSignal: result.rollSignal,
    breakdown: result.breakdown,
    isSuccess: result.total >= check.dc,
  }
}

export function buildCheckOutcomeSummary(outcome) {
  return `${outcome.skill} 检定，难度 DC=${outcome.dc}。${outcome.reason ? `判定理由：${outcome.reason}。` : ''}掷骰结果：${outcome.breakdown.expression}，最终判定为 ${formatCheckVerdict(outcome)}。`.trim()
}

export function buildCheckDisplayLabel(characterSheet, outcome, playerContext = '') {
  return `${playerContext ? `“${playerContext}”\n` : ''}🔥 ${characterSheet.race}${characterSheet.class}的本能 - [${outcome.skill}] ${outcome.breakdown.expression} vs DC ${outcome.dc}（${formatCheckVerdict(outcome)}）`
}

export function buildCheckSetDisplayLabel(characterSheet, checkSet, outcomes, playerContext = '') {
  const summaryLines = outcomes.map((outcome) => {
    return `- [${outcome.skill}] ${outcome.breakdown.expression} vs DC ${outcome.dc}（${formatCheckVerdict(outcome)}）`
  })

  return `${playerContext ? `“${playerContext}”\n` : ''}🎲 ${characterSheet.race}${characterSheet.class}正在结算「${checkSet.label}」\n${summaryLines.join('\n')}`
}
