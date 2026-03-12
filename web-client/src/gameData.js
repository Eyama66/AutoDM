import { DEFAULT_CHARACTER } from '@core/engine/DefaultCharacter'
import { CharacterManager } from '@core/engine/CharacterManager'
import manifest from '@data/modules/eldora_shadow/module_manifest.json'
import thornVillage from '@data/modules/eldora_shadow/areas/THORN_VILLAGE.json'

export const INITIAL_DM_MESSAGE = {
  id: 1,
  role: 'dm',
  content:
    '欢迎来到《艾尔多拉之影》。你正站在黑荆棘岗哨的断壁残垣前，寒冷的北风吹过你的披风。你面前是那扇在无数传说中出现的锈迹斑驳的铁门。你是谁？你因何而至？',
  actions: [],
}

const characterModules = import.meta.glob('@data/characters/*.json', { eager: true })
const areaModules = import.meta.glob('@data/modules/eldora_shadow/areas/*.json', { eager: true })
const monsterModules = import.meta.glob('@data/modules/eldora_shadow/entities/*.json', {
  eager: true,
})

const availableCharacters = Object.values(characterModules).map((module) => module.default || module)
const allAreas = Object.values(areaModules).map((module) => module.default || module)
const areaIndex = Object.fromEntries(allAreas.map((area) => [area.areaId, area]))
const monsterRaw = Object.values(monsterModules)[0]

export const monsterLibrary = Array.isArray(monsterRaw) ? monsterRaw : monsterRaw?.default || []
export { manifest }

export function cloneData(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

export function parseLocationRef(locationRef, fallbackAreaId) {
  if (typeof locationRef !== 'string') {
    return { areaId: fallbackAreaId, locationId: '' }
  }

  const [areaId, locationId] = locationRef.split(':')
  if (locationId) {
    return { areaId: areaId || fallbackAreaId, locationId }
  }

  return { areaId: fallbackAreaId, locationId: locationRef }
}

function loadPreferredCharacter(options = {}) {
  if (options.ignoreSaved) {
    return availableCharacters[0] || DEFAULT_CHARACTER
  }

  for (const character of availableCharacters) {
    const savedCharacter = CharacterManager.loadSavedCharacter(character.id)
    if (savedCharacter) {
      return savedCharacter
    }
  }

  return availableCharacters[0] || DEFAULT_CHARACTER
}

export function getAreaById(areaId) {
  return areaIndex[areaId] || thornVillage
}

export function buildDefaultGameState(options = {}) {
  const startingLocation = parseLocationRef(manifest.startingLocation, thornVillage.areaId)
  const characterSheet = cloneData(loadPreferredCharacter(options))

  return {
    currentModule: manifest.moduleId,
    currentAreaId: startingLocation.areaId,
    currentLocationId: startingLocation.locationId,
    characterSheet,
    party: [characterSheet],
    plotProgress: [],
    activeQuestIds: [],
    isCombatActive: false,
    variables: { last_chance_available: false, ...(manifest.globalVariables || {}) },
    sessionMode: 'solo',
    phase: 'exploration',
    activeScene: {
      sceneId: `${startingLocation.areaId}:${startingLocation.locationId}`,
      areaId: startingLocation.areaId,
      locationId: startingLocation.locationId,
      tags: [],
    },
  }
}
