import { CharacterManager } from '@core/engine/CharacterManager'

import {
  buildDefaultGameState,
  cloneData,
  getAreaById,
  INITIAL_DM_MESSAGE,
  manifest,
  parseLocationRef,
} from './gameData'

const SESSION_STORAGE_KEY = 'autodm_session_v1'
const MAX_PERSISTED_MESSAGES = 80
const FALLBACK_PERSISTED_MESSAGES = 30

function getPersistedMessages(messages, limit = MAX_PERSISTED_MESSAGES) {
  return messages.slice(-limit).map((message) => ({
    ...message,
    actions: Array.isArray(message.actions) ? message.actions.slice(0, 12) : [],
  }))
}

function loadPersistedSession() {
  try {
    if (typeof localStorage === 'undefined') {
      return null
    }

    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    console.warn('[App] 读取会话存档失败，回退到默认状态:', error)
    return null
  }
}

export function buildInitialSession() {
  const defaultState = buildDefaultGameState()
  const persistedSession = loadPersistedSession()

  if (!persistedSession?.gameState) {
    return {
      gameState: defaultState,
      messages: [INITIAL_DM_MESSAGE],
    }
  }

  const mergedState = {
    ...defaultState,
    ...persistedSession.gameState,
    characterSheet: persistedSession.gameState.characterSheet
      ? cloneData(persistedSession.gameState.characterSheet)
      : defaultState.characterSheet,
    party:
      Array.isArray(persistedSession.gameState.party) && persistedSession.gameState.party.length > 0
        ? cloneData(persistedSession.gameState.party)
        : [defaultState.characterSheet],
    plotProgress: Array.isArray(persistedSession.gameState.plotProgress)
      ? persistedSession.gameState.plotProgress
      : defaultState.plotProgress,
    activeQuestIds: Array.isArray(persistedSession.gameState.activeQuestIds)
      ? persistedSession.gameState.activeQuestIds
      : defaultState.activeQuestIds,
    isCombatActive: Boolean(persistedSession.gameState.isCombatActive),
    variables: {
      last_chance_available: false,
      ...(manifest.globalVariables || {}),
      ...(persistedSession.gameState.variables || {}),
    },
    sessionMode:
      persistedSession.gameState.sessionMode === 'party' ? 'party' : defaultState.sessionMode,
    phase: CharacterManager.isDowned(
      persistedSession.gameState.characterSheet
        ? persistedSession.gameState.characterSheet
        : defaultState.characterSheet,
    )
      ? 'endgame'
      : typeof persistedSession.gameState.phase === 'string'
        ? persistedSession.gameState.phase
        : defaultState.phase,
  }

  if (mergedState.sessionMode === 'solo') {
    mergedState.party = [mergedState.characterSheet]
  }

  const safeArea = getAreaById(mergedState.currentAreaId)
  mergedState.currentAreaId = safeArea.areaId

  if (!safeArea.locations.some((location) => location.id === mergedState.currentLocationId)) {
    const fallbackLocation = parseLocationRef(manifest.startingLocation, safeArea.areaId)
    mergedState.currentLocationId = fallbackLocation.locationId
  }

  mergedState.activeScene = {
    sceneId: `${mergedState.currentAreaId}:${mergedState.currentLocationId}`,
    areaId: mergedState.currentAreaId,
    locationId: mergedState.currentLocationId,
    tags: Array.isArray(mergedState.activeScene?.tags) ? mergedState.activeScene.tags : [],
  }

  return {
    gameState: mergedState,
    messages:
      Array.isArray(persistedSession.messages) && persistedSession.messages.length > 0
        ? persistedSession.messages
        : [INITIAL_DM_MESSAGE],
  }
}

export function persistSession(messages, gameState) {
  try {
    if (typeof localStorage === 'undefined') {
      return
    }

    const persistPayload = (limit) =>
      JSON.stringify({
        gameState,
        messages: getPersistedMessages(messages, limit),
      })

    try {
      localStorage.setItem(SESSION_STORAGE_KEY, persistPayload(MAX_PERSISTED_MESSAGES))
    } catch {
      localStorage.setItem(SESSION_STORAGE_KEY, persistPayload(FALLBACK_PERSISTED_MESSAGES))
    }
  } catch (error) {
    console.warn('[App] 写入会话存档失败:', error)
  }
}

export function clearPersistedSession() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  }
}
