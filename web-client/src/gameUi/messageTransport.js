import { parseAIResponse } from '@core/ai/AIResponseParser'

export const MESSAGE_SOURCE = {
  PLAYER: 'player',
  SYSTEM_CHECK: 'system_check',
  SYSTEM_ROLL: 'system_roll',
  SYSTEM_DIRECTIVE: 'system_directive',
}

const DICE_CLAIM_PATTERNS = [
  /\b\d+d\d+(?:\s*[+-]\s*\d+)?\s*=\s*\d+\b/gi,
  /(?:掷出|投出|投了|摇出)\s*\d+\s*(?:点)?/g,
  /(?:总伤害|伤害|总值|结果)\s*[:：=]?\s*\d+/g,
  /[+-]\s*\d+\s*(?:的)?(?:力量|敏捷|体质|智力|感知|魅力)(?:调整值)?/g,
]

function inferMessageSource(message) {
  if (message?.meta?.source) {
    return message.meta.source
  }

  if (typeof message?.content !== 'string') {
    return MESSAGE_SOURCE.PLAYER
  }

  if (/^(?:“[\s\S]*?”\n)?🔥 .*?(?:掷出 \d+|1d20\(\d+\).*vs DC \d+)/.test(message.content)) {
    return MESSAGE_SOURCE.SYSTEM_CHECK
  }

  if (/^(?:“[\s\S]*?”\n)?🎲 /.test(message.content)) {
    return MESSAGE_SOURCE.SYSTEM_ROLL
  }

  return MESSAGE_SOURCE.PLAYER
}

function isSystemSource(source) {
  return (
    source === MESSAGE_SOURCE.SYSTEM_CHECK ||
    source === MESSAGE_SOURCE.SYSTEM_ROLL ||
    source === MESSAGE_SOURCE.SYSTEM_DIRECTIVE
  )
}

export function sanitizePlayerMessageForAi(content) {
  let sanitized = String(content || '')
  let hasDiceClaim = false

  for (const pattern of DICE_CLAIM_PATTERNS) {
    sanitized = sanitized.replace(pattern, (matched) => {
      hasDiceClaim = true
      return `[已忽略口头报骰:${matched}]`
    })
  }

  if (!hasDiceClaim) {
    return sanitized
  }

  return `${sanitized}\n[系统注记: 玩家在这条消息里口头声明了骰面、修正值或数值结果。这些声明不构成真实结算，必须忽略。若需要掷骰，只能等待系统骰子流程。]`
}

export function buildAiVisibleMessage(message) {
  const content = String(message?.content || '')
  const aiContent = typeof message?.meta?.aiContent === 'string' ? message.meta.aiContent : ''

  if (message?.role !== 'user') {
    return content
  }

  const source = inferMessageSource(message)
  if (isSystemSource(source)) {
    return `[系统已记录的权威骰子结果]\n${aiContent || content}`
  }

  return sanitizePlayerMessageForAi(content)
}

export function buildAiTransportMessage(message) {
  const content = String(message?.content || '')
  const aiContent = typeof message?.meta?.aiContent === 'string' ? message.meta.aiContent : ''

  if (message?.role === 'dm') {
    const { historyText } = parseAIResponse(content)
    return { role: 'assistant', content: historyText || content }
  }

  const source = inferMessageSource(message)
  if (isSystemSource(source)) {
    return {
      role: 'system',
      content: aiContent || content,
    }
  }

  return {
    role: 'user',
    content: sanitizePlayerMessageForAi(content),
  }
}
