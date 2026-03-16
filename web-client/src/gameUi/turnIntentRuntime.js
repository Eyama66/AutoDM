function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeInlineText(value) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function buildOptionId(type, targetId) {
  return `${type}:${targetId || 'none'}`
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

export function resolveTurnIntent(intent, context) {
  const intentType = normalizeText(intent?.type)
  const targetId = normalizeText(intent?.targetId)

  switch (intentType) {
    case 'move':
      return resolveMoveIntent(intent, context, targetId)
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
  const lines = [
    '[SYS_TURN_RESOLUTION]',
    `intent_type=${normalizeInlineText(intent?.type) || 'unknown'}`,
    `status=${normalizeInlineText(resolution?.status) || 'clarify'}`,
    `summary=${normalizeInlineText(resolution?.summary) || '需要根据当前场景继续裁定。'}`,
    `player_intent=${normalizeInlineText(resolution?.playerPrompt || intent?.playerPrompt || intent?.label)}`,
    `scene=${normalizeInlineText(context?.currentLocationName) || '未知地点'}`,
    'instruction=这条玩家意图已经由本地运行时完成初步裁定。你只负责在世界内叙事，不要重新解释规则。除非新情境必须继续推进，否则不要输出新的[@ACTION]标签。',
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
