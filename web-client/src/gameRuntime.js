import { CampaignManager } from '@core/engine/CampaignManager'
import { AIEngine } from '@core/ai/AIEngine'
import { setTraceEnabled, summarizeStateForTrace, trace } from '@core/debug/traceLogger'
import {
  modulePlotData,
  moduleAuthority,
  buildDefaultGameState,
  cloneData,
  getAreaById,
  INITIAL_DM_MESSAGE,
  manifest,
  monsterLibrary,
} from './gameData'
import { buildPromptContext } from './gamePromptContext'
import { buildInitialSession, clearPersistedSession, persistSession } from './gameSessionStorage'

export const aiEngine = new AIEngine({
  apiKey: import.meta.env.VITE_AI_API_KEY || import.meta.env.VITE_DEEPSEEK_API_KEY,
  baseURL: import.meta.env.VITE_AI_BASE_URL || import.meta.env.VITE_DEEPSEEK_BASE_URL,
  model: import.meta.env.VITE_AI_MODEL,
})

export const initialSession = buildInitialSession()
const traceEnabled =
  typeof import.meta.env.VITE_AUTODM_TRACE === 'string'
    ? import.meta.env.VITE_AUTODM_TRACE !== 'false'
    : import.meta.env.DEV === true
setTraceEnabled(traceEnabled)

export const campaign = new CampaignManager(initialSession.gameState)

campaign.setMonsterLibrary(monsterLibrary)
campaign.setModulePlot(modulePlotData)
campaign.setModuleAuthority(moduleAuthority)
campaign.setCallbacks((areaId) => {
  campaign.initialize(manifest, getAreaById(areaId), modulePlotData)
})
campaign.initialize(manifest, getAreaById(initialSession.gameState.currentAreaId), modulePlotData)

trace('runtime', 'initialized game runtime', {
  moduleId: manifest.moduleId || manifest.name,
  traceEnabled,
  initialState: summarizeStateForTrace(initialSession.gameState),
})

export {
  buildDefaultGameState,
  buildPromptContext,
  clearPersistedSession,
  cloneData,
  getAreaById,
  INITIAL_DM_MESSAGE,
  manifest,
  moduleAuthority,
  persistSession,
}
