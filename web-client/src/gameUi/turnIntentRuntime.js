import { ActionProcessor } from '@core/engine/ActionProcessor'
import { parseCheckPayload, parseCheckSetPayload } from '@core/engine/campaignPayloadUtils'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeInlineText(value) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function buildOptionId(type, targetId) {
  return `${type}:${targetId || 'none'}`
}

const MOVE_CUE_REGEX = /(前往|往|去|走向|走去|走到|进入|进到|钻进|爬进|潜入|回到|返回|穿过|通过|前进|深入|下去)/

function uniqueValues(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function buildNameAliases(name) {
  const normalized = normalizeInlineText(name)
  if (!normalized) {
    return []
  }

  const aliases = new Set([normalized])
  if (normalized.includes('的')) {
    aliases.add(normalizeInlineText(normalized.split('的').slice(-1)[0]))
  }

  if (normalized.length >= 2) {
    aliases.add(normalized.slice(0, 2))
    aliases.add(normalized.slice(-2))
  }

  if (normalized.length >= 3) {
    aliases.add(normalized.slice(0, 3))
    aliases.add(normalized.slice(-3))
  }

  if (normalized.length >= 4) {
    aliases.add(normalized.slice(-4))
  }

  return uniqueValues([...aliases].filter((alias) => alias.length >= 2))
}

function parseAllowedSceneChecks(actions) {
  const actionTags = Array.isArray(actions) ? actions : []
  return actionTags.flatMap((actionTag) => {
    const normalizedTag = normalizeText(actionTag)
    if (!normalizedTag) {
      return []
    }

    const parsedActions = ActionProcessor.parse(
      normalizedTag.startsWith('[') ? normalizedTag : `[${normalizedTag}]`,
    )

    return parsedActions.flatMap((action) => {
      if (action.type === '@CHECK') {
        const parsed = parseCheckPayload(action.payload)
        return parsed ? [parsed] : []
      }

      if (action.type === '@CHECK_SET') {
        const parsed = parseCheckSetPayload(action.payload)
        return parsed?.checks || []
      }

      return []
    })
  })
}

function pickExitMatch(input, exits) {
  const normalizedInput = normalizeInlineText(input)
  if (!normalizedInput || !MOVE_CUE_REGEX.test(normalizedInput)) {
    return null
  }

  const matches = exits
    .map((exit) => {
      const aliases = buildNameAliases(exit?.name)
      const bestAlias = aliases
        .filter((alias) => normalizedInput.includes(alias))
        .sort((left, right) => right.length - left.length)[0]

      if (!bestAlias) {
        return null
      }

      return {
        exit,
        score: bestAlias.length + (normalizeInlineText(exit?.name) === bestAlias ? 5 : 0),
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)

  if (matches.length === 0) {
    return null
  }

  if (matches.length > 1 && matches[0].score === matches[1].score) {
    return null
  }

  return matches[0].exit
}

function splitIntentClauses(input) {
  return uniqueValues(
    String(input || '')
      .split(/(?:，|。|！|\!|？|\?|；|;|然后|再|接着|随后|之后)/)
      .map((part) => normalizeInlineText(part))
      .filter(Boolean),
  )
}

function inferTraversalCheck(input, context) {
  const normalizedInput = normalizeInlineText(input)
  if (!normalizedInput || !MOVE_CUE_REGEX.test(normalizedInput)) {
    return null
  }

  const dmNotes = normalizeInlineText(context?.currentLocationDmNotes)
  const traversalMoveTags = ActionProcessor.parse(dmNotes)
    .filter((action) => action.type === '@MOVE')
  if (traversalMoveTags.length === 0) {
    return null
  }

  const allowedChecks = parseAllowedSceneChecks(context?.currentLocationActions)
  if (allowedChecks.length !== 1) {
    return null
  }

  return allowedChecks[0]
}

export function buildEngineActionTags(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return []
  }

  return actions
    .map((action) => {
      const actionType = normalizeText(action?.type)
      const payload = normalizeText(action?.payload)
      if (!actionType) {
        return ''
      }

      return payload ? `[${actionType}(${payload})]` : `[${actionType}]`
    })
    .filter(Boolean)
}

export function buildSceneIntentOptions(context) {
  const options = []
  const exits = Array.isArray(context?.availableExitOptions) ? context.availableExitOptions : []
  const npcNames = Array.isArray(context?.allowedNpcSpeakerNames) ? context.allowedNpcSpeakerNames : []
  const itemNames = Array.isArray(context?.currentLocationItems) ? context.currentLocationItems : []
  const currentLocationName = normalizeText(context?.currentLocationName)

  exits.forEach((exit) => {
    if (!normalizeText(exit?.id) || !normalizeText(exit?.name)) {
      return
    }

    options.push({
      id: buildOptionId('move', exit.id),
      type: 'move',
      label: `前往 ${exit.name}`,
      targetId: exit.id,
      targetLabel: exit.name,
      playerPrompt: `我前往${exit.name}。`,
    })
  })

  npcNames.forEach((npcName) => {
    const normalizedNpcName = normalizeText(npcName)
    if (!normalizedNpcName) {
      return
    }

    options.push({
      id: buildOptionId('talk', normalizedNpcName),
      type: 'talk',
      label: `交谈 ${normalizedNpcName}`,
      targetId: normalizedNpcName,
      targetLabel: normalizedNpcName,
      playerPrompt: `我和${normalizedNpcName}交谈。`,
    })
  })

  itemNames.forEach((itemName) => {
    const normalizedItemName = normalizeText(itemName)
    if (!normalizedItemName) {
      return
    }

    options.push({
      id: buildOptionId('loot', normalizedItemName),
      type: 'loot',
      label: `拾取 ${normalizedItemName}`,
      targetId: normalizedItemName,
      targetLabel: normalizedItemName,
      playerPrompt: `我拾起${normalizedItemName}。`,
    })
  })

  if (currentLocationName) {
    options.push({
      id: buildOptionId('inspect', currentLocationName),
      type: 'inspect',
      targetId: currentLocationName,
      targetLabel: currentLocationName,
      label: `观察 ${currentLocationName}`,
      playerPrompt: `我仔细观察${currentLocationName}。`,
    })
  }

  return options
}

export function inferTurnIntentFromPlayerInput(playerInput, context) {
  const normalizedInput = normalizeInlineText(playerInput)
  if (!normalizedInput) {
    return null
  }

  const candidates = uniqueValues([
    ...splitIntentClauses(normalizedInput).reverse(),
    normalizedInput,
  ])
  const exits = Array.isArray(context?.availableExitOptions) ? context.availableExitOptions : []
  for (const candidate of candidates) {
    const matchedExit = pickExitMatch(candidate, exits)
    if (matchedExit) {
      return {
        id: buildOptionId('move', matchedExit.id),
        type: 'move',
        label: `前往 ${matchedExit.name}`,
        targetId: matchedExit.id,
        targetLabel: matchedExit.name,
        playerPrompt: playerInput,
      }
    }

    const traversalCheck = inferTraversalCheck(candidate, context)
    if (traversalCheck) {
      return {
        id: buildOptionId(
          'scene_check',
          `${normalizeText(context?.currentLocationName)}:${traversalCheck.skill}:${traversalCheck.dc}`,
        ),
        type: 'scene_check',
        label: `尝试通过 ${normalizeText(context?.currentLocationName) || '当前场景'}`,
        targetId: normalizeText(context?.currentLocationName),
        targetLabel: normalizeText(context?.currentLocationName),
        playerPrompt: playerInput,
        pendingCheck: traversalCheck,
      }
    }
  }

  return null
}

export function resolveTurnIntent(intent, context) {
  const intentType = normalizeText(intent?.type)
  const targetId = normalizeText(intent?.targetId)

  switch (intentType) {
    case 'move':
      return resolveMoveIntent(intent, context, targetId)
    case 'scene_check':
      return resolveSceneCheckIntent(intent, context)
    case 'talk':
      return resolveTalkIntent(intent, context, targetId)
    case 'loot':
      return resolveLootIntent(intent, context, targetId)
    case 'inspect':
      return {
        status: 'allowed',
        summary: `玩家在当前场景内观察${normalizeText(intent?.targetLabel) || '周围环境'}。`,
        playerPrompt: intent.playerPrompt || '我仔细观察四周。',
        engineActions: [],
        narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene', 'preserve_tension'],
      }
    default:
      return {
        status: 'clarify',
        summary: '当前结构化意图无法识别。',
        playerPrompt: intent.playerPrompt || intent.label || '我想继续行动。',
        engineActions: [],
        narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene'],
      }
  }
}

export function serializeEngineActions(actions) {
  return buildEngineActionTags(actions).join(' ')
}

export function stripResolvedActionTags(text, resolvedActionTags) {
  const rawText = String(text || '')
  const tags = Array.isArray(resolvedActionTags) ? resolvedActionTags.filter(Boolean) : []

  if (!rawText || tags.length === 0) {
    return rawText
  }

  return tags.reduce((nextText, tag) => nextText.split(tag).join(''), rawText)
}

export function buildSystemTurnResolutionPrompt(intent, resolution, context) {
  const isPendingCheckResolution = normalizeInlineText(resolution?.status) === 'requires_check'
  const lines = [
    '[SYS_TURN_RESOLUTION]',
    `intent_type=${normalizeInlineText(intent?.type) || 'unknown'}`,
    `status=${normalizeInlineText(resolution?.status) || 'clarify'}`,
    `summary=${normalizeInlineText(resolution?.summary) || '需要根据当前场景继续裁定。'}`,
    `player_intent=${normalizeInlineText(resolution?.playerPrompt || intent?.playerPrompt || intent?.label)}`,
    `scene=${normalizeInlineText(context?.currentLocationName) || '未知地点'}`,
    `instruction=${
      isPendingCheckResolution
        ? '这条玩家意图已经由本地运行时裁定为一项既定检定。你只负责在世界内描写眼前的不确定性与风险，停在掷骰前的危机时刻；不要重新改判技能或 DC，也不要重复输出新的[@CHECK]标签。'
        : '这条玩家意图已经由本地运行时完成初步裁定。你只负责在世界内叙事，不要重新解释规则。除非新情境必须继续推进，否则不要输出新的[@ACTION]标签。'
    }`,
  ]

  const directives = Array.isArray(resolution?.narrativeDirectives)
    ? resolution.narrativeDirectives.filter(Boolean)
    : []
  if (directives.length > 0) {
    lines.push(`directives=${directives.join('|')}`)
  }

  const actions = Array.isArray(resolution?.engineActions) ? resolution.engineActions : []
  actions.forEach((action, index) => {
    const actionType = normalizeInlineText(action?.type)
    const payload = normalizeInlineText(action?.payload)
    if (!actionType) {
      return
    }

    lines.push(`resolved_action_${index + 1}=${payload ? `${actionType}(${payload})` : actionType}`)
  })

  return lines.join('\n')
}

function resolveMoveIntent(intent, context, targetId) {
  const exit = (context?.availableExitOptions || []).find((entry) => normalizeText(entry?.id) === targetId)
  if (!exit) {
    return {
      status: 'blocked',
      summary: '玩家试图前往当前场景之外的地点。',
      playerPrompt: intent.playerPrompt || intent.label || '我想前进。',
      engineActions: [],
      narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene', 'deny_unknown_entity'],
    }
  }

  return {
    status: 'allowed',
    summary: `玩家沿着当前已知路径前往${exit.name}。`,
    playerPrompt: intent.playerPrompt || `我前往${exit.name}。`,
    engineActions: [{ type: '@MOVE', payload: exit.id }],
    narrativeDirectives: ['acknowledge_player_intent', 'preserve_tension'],
  }
}

function resolveSceneCheckIntent(intent, context) {
  const pendingCheck = intent?.pendingCheck
  const currentLocationName = normalizeText(context?.currentLocationName) || '当前场景'
  if (!pendingCheck?.skill || !pendingCheck?.dc) {
    return {
      status: 'clarify',
      summary: '玩家尝试继续深入，但当前场景没有明确的裁定路径。',
      playerPrompt: intent.playerPrompt || intent.label || '我继续往前走。',
      engineActions: [],
      narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene'],
    }
  }

  const reason =
    normalizeText(pendingCheck.reason) || `穿过${currentLocationName}继续前进`

  return {
    status: 'requires_check',
    summary: `玩家尝试穿过${currentLocationName}继续前进，必须先通过一次${pendingCheck.skill}检定。`,
    playerPrompt: intent.playerPrompt || intent.label || `我继续穿过${currentLocationName}。`,
    engineActions: [
      {
        type: '@CHECK',
        payload: `${pendingCheck.skill}:${pendingCheck.dc}:${reason}`,
      },
    ],
    narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene', 'preserve_tension'],
  }
}

function resolveTalkIntent(intent, context, targetId) {
  const npcName = (context?.allowedNpcSpeakerNames || []).find(
    (entry) => normalizeText(entry) === targetId,
  )
  if (!npcName) {
    return {
      status: 'blocked',
      summary: '玩家试图与当前不在场的人物交谈。',
      playerPrompt: intent.playerPrompt || intent.label || '我想和某人交谈。',
      engineActions: [],
      narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene', 'deny_unknown_entity'],
    }
  }

  return {
    status: 'allowed',
    summary: `玩家把注意力投向了${npcName}。`,
    playerPrompt: intent.playerPrompt || `我和${npcName}交谈。`,
    engineActions: [],
    narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene'],
  }
}

function resolveLootIntent(intent, context, targetId) {
  const itemName = (context?.currentLocationItems || []).find(
    (entry) => normalizeText(entry) === targetId,
  )
  if (!itemName) {
    return {
      status: 'blocked',
      summary: '玩家试图获取当前场景不存在的物品。',
      playerPrompt: intent.playerPrompt || intent.label || '我想捡起什么。',
      engineActions: [],
      narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene', 'deny_unknown_entity'],
    }
  }

  return {
    status: 'allowed',
    summary: `玩家拿起了${itemName}。`,
    playerPrompt: intent.playerPrompt || `我拾起${itemName}。`,
    engineActions: [{ type: '@ITEM_ADD', payload: itemName }],
    narrativeDirectives: ['acknowledge_player_intent', 'stay_in_scene'],
  }
}
