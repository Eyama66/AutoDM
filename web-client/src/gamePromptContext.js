import { summarizeInventory, summarizeNpcDmNotes } from './gameUi/inventorySummary'
import { getAreaById, manifest, parseLocationRef } from './gameData'

export function buildPromptContext(state, currentArea, currentLocation) {
  const availableExitOptions = (currentLocation?.connections || []).map((locationRef) => {
    const parsedRef = parseLocationRef(locationRef, currentArea?.areaId || state.currentAreaId)
    const targetArea =
      parsedRef.areaId === currentArea?.areaId ? currentArea : getAreaById(parsedRef.areaId)
    const targetLocation = targetArea?.locations?.find((location) => location.id === parsedRef.locationId)

    return {
      id: locationRef,
      name: targetLocation?.name || locationRef,
      areaName: targetArea?.name || '',
    }
  })

  return {
    moduleName: manifest.name,
    moduleDescription: manifest.description,
    worldTone: manifest.worldTone,
    currentAreaName: currentArea?.name || '未知区域',
    currentAreaDescription: currentArea?.dmInstructions || '',
    currentLocationName: currentLocation?.name || '未知地点',
    currentLocationDescription: currentLocation?.description || '',
    availableConnections: currentLocation?.connections || [],
    availableExitOptions,
    currentLocationActions: currentLocation?.actions || [],
    currentLocationDmNotes: currentLocation?.dmNotes || '',
    npcs: currentLocation?.npcs || [],
    npcDmNotes: summarizeNpcDmNotes(currentLocation?.npcs),
    playerState: state,
    plotObjective: manifest.description || '探索并活下去',
    equippedItemsSummary: summarizeInventory(state.characterSheet?.inventory, {
      equippedOnly: true,
    }),
    inventorySummary: summarizeInventory(state.characterSheet?.inventory),
  }
}
