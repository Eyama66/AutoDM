import { CampaignManager } from '@core/engine/CampaignManager'
import { AIEngine } from '@core/ai/AIEngine'
import {
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

export const campaign = new CampaignManager(initialSession.gameState)

campaign.setMonsterLibrary(monsterLibrary)
campaign.setCallbacks((areaId) => {
  campaign.initialize(manifest, getAreaById(areaId))
})
campaign.initialize(manifest, getAreaById(initialSession.gameState.currentAreaId))

export {
  buildDefaultGameState,
  buildPromptContext,
  clearPersistedSession,
  cloneData,
  getAreaById,
  INITIAL_DM_MESSAGE,
  manifest,
  persistSession,
}
