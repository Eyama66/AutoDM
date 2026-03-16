import { summarizeInventory, summarizeNpcDmNotes } from './gameUi/inventorySummary'
import { manifest, moduleAuthority, modulePlotData } from './gameData'
import { buildSceneId, getSceneAuthority } from '@core/engine/campaignAuthority'
import { buildPlotFrontier } from '@core/engine/campaignPlotUtils'

export function buildPromptContext(state, currentArea, currentLocation) {
  const plotFrontier = buildPlotFrontier(modulePlotData, state?.plotProgress)
  const sceneAuthority = getSceneAuthority(
    moduleAuthority,
    currentArea?.areaId || state.currentAreaId,
    currentLocation?.id || state.currentLocationId,
  )
  const availableExitOptions = (sceneAuthority?.exits || []).map((exit) => ({
    id: exit.ref,
    name: exit.name,
    areaName: exit.areaName || '',
  }))
  const sceneNpcs = sceneAuthority?.npcs || currentLocation?.npcs || []
  const sceneEncounterIds = sceneAuthority?.encounterIds || currentLocation?.encounters || []
  const allSceneItemNames = sceneAuthority?.itemNames || currentLocation?.items || []
  const claimedSceneItems =
    state?.sceneRuntime?.claimedItemsBySceneId?.[
      buildSceneId(
        currentArea?.areaId || state.currentAreaId,
        currentLocation?.id || state.currentLocationId,
      )
    ] || []
  const sceneItemNames = allSceneItemNames.filter((itemName) => {
    const normalizedItemName = String(itemName || '').trim().toLowerCase()
    return !claimedSceneItems.some(
      (claimedItem) => String(claimedItem || '').trim().toLowerCase() === normalizedItemName,
    )
  })

  return {
    moduleName: manifest.name,
    moduleDescription: manifest.description,
    worldTone: manifest.worldTone,
    currentAreaName: sceneAuthority?.areaName || currentArea?.name || '未知区域',
    currentAreaDescription: currentArea?.dmInstructions || '',
    currentLocationName: sceneAuthority?.locationName || currentLocation?.name || '未知地点',
    currentLocationDescription: sceneAuthority?.description || currentLocation?.description || '',
    availableConnections: (sceneAuthority?.exits || []).map((exit) => exit.ref),
    availableExitOptions,
    currentLocationActions: sceneAuthority?.actions || currentLocation?.actions || [],
    currentLocationEncounters: sceneEncounterIds,
    currentLocationItems: sceneItemNames,
    currentLocationDmNotes: sceneAuthority?.dmNotes || currentLocation?.dmNotes || '',
    npcs: sceneNpcs,
    npcDmNotes: summarizeNpcDmNotes(sceneNpcs),
    playerState: state,
    plotObjective: manifest.description || '探索并活下去',
    modulePlot: modulePlotData,
    equippedItemsSummary: summarizeInventory(state.characterSheet?.inventory, {
      equippedOnly: true,
    }),
    inventorySummary: summarizeInventory(state.characterSheet?.inventory),
    allowedNpcSpeakerNames: sceneAuthority?.npcNames || [],
    knownLocationNames: moduleAuthority.knownLocationNames,
    plotFrontier,
    possibilitySpace: buildPossibilitySpace(sceneEncounterIds, sceneItemNames, sceneNpcs, plotFrontier, modulePlotData, state?.triggerRuntime?.activeTrigger),
  }
}

function buildPossibilitySpace(encounterIds, discoverableItems, npcs, plotFrontier, modulePlotData, activeTrigger) {
  const plotNodes = Array.isArray(modulePlotData?.plotPoints) ? modulePlotData.plotPoints : []

  if (activeTrigger) {
    const deployable = activeTrigger.deployable || {}
    return {
      deployableEncounters: (deployable.encounterIds || []).map((id) => ({ id })),
      advancablePlotNodes: (deployable.plotNodeIds || []).map((id) => {
        const node = plotNodes.find((n) => n.id === id)
        return { id, title: node?.title || id }
      }),
      presentNpcs: npcs.map((npc) => ({ name: npc.name || '', canSpeak: true, canBeInteracted: true })),
      discoverableItems: deployable.itemIds || [],
      activeTrigger: {
        triggerId: activeTrigger.triggerId,
        branch: activeTrigger.branch,
        narrativeHint: activeTrigger.narrativeHint || '',
        isTriggerConstrained: true,
      },
    }
  }

  return {
    deployableEncounters: encounterIds.map((id) => ({ id })),
    advancablePlotNodes: plotFrontier.allowedNodeIds.map((id) => {
      const node = plotNodes.find((n) => n.id === id)
      return { id, title: node?.title || id }
    }),
    presentNpcs: npcs.map((npc) => ({ name: npc.name || '', canSpeak: true, canBeInteracted: true })),
    discoverableItems: discoverableItems,
  }
}
