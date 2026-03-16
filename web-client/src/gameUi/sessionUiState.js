import { CharacterManager } from '@core/engine/CharacterManager'

import { parseCheckAction, parseCheckSetAction } from './actionTags'
import { parseRollAction } from './formulaRolls'

function findDmAction(lastDmMessage, prefix) {
  if (lastDmMessage?.role !== 'dm' || !Array.isArray(lastDmMessage.actions)) {
    return null
  }

  return lastDmMessage.actions.find((action) => action.startsWith(prefix)) || null
}

export function buildSessionUiState(state, messages, isThinking) {
  const isCharacterDowned = CharacterManager.isDowned(state.characterSheet)
  const rescueWindowOpen =
    state.phase === 'endgame' && state.variables?.last_chance_available === true
  const isTerminalLocked = state.phase === 'endgame' && !rescueWindowOpen
  const isSessionCompleted = state.phase === 'completed'
  const sessionEndReason =
    typeof state.variables?.session_end_reason === 'string'
      ? state.variables.session_end_reason
      : ''
  const lastDmMessage = messages.length > 0 ? messages[messages.length - 1] : null
  const canReadPendingActions =
    lastDmMessage?.role === 'dm' &&
    !isThinking &&
    !isSessionCompleted

  const pendingCheckAction =
    canReadPendingActions && (!isCharacterDowned || rescueWindowOpen)
      ? findDmAction(lastDmMessage, '[@CHECK(')
      : null
  const pendingCheckSetAction =
    canReadPendingActions && (!isCharacterDowned || rescueWindowOpen)
      ? findDmAction(lastDmMessage, '[@CHECK_SET(')
      : null
  const pendingRollAction = canReadPendingActions
    ? findDmAction(lastDmMessage, '[@ROLL(')
    : null

  return {
    isCharacterDowned,
    rescueWindowOpen,
    isTerminalLocked,
    isSessionCompleted,
    sessionEndReason,
    pendingCheckAction,
    pendingCheckSetAction,
    pendingRollAction,
    pendingCheck: pendingCheckAction ? parseCheckAction(pendingCheckAction) : null,
    pendingCheckSet: pendingCheckSetAction ? parseCheckSetAction(pendingCheckSetAction) : null,
    pendingFormulaRoll: pendingRollAction ? parseRollAction(pendingRollAction) : null,
    hasPendingDiceAction:
      Boolean(pendingCheckAction) ||
      Boolean(pendingCheckSetAction) ||
      Boolean(pendingRollAction),
  }
}
