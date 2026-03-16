export interface ParsedLocationRef {
  areaId: string;
  locationId: string;
  ref: string;
  sceneId: string;
}

export interface SceneTriggerDeployable {
  encounterIds?: string[];
  plotNodeIds?: string[];
  itemIds?: string[];
}

export interface SceneTriggerBranch {
  narrativeHint: string;
  deployable: SceneTriggerDeployable;
}

export interface SceneTrigger {
  id: string;
  when: "check_resolved";
  skill: string;
  dc: number;
  branches: {
    success: SceneTriggerBranch;
    failure?: SceneTriggerBranch;
    [key: string]: SceneTriggerBranch | undefined;
  };
}

export interface AuthorityExit {
  ref: string;
  sceneId: string;
  areaId: string;
  areaName: string;
  locationId: string;
  name: string;
}

export interface SceneAuthority {
  sceneId: string;
  areaId: string;
  areaName: string;
  locationId: string;
  locationName: string;
  description: string;
  exits: AuthorityExit[];
  actions: string[];
  encounterIds: string[];
  itemNames: string[];
  npcNames: string[];
  npcs: any[];
  dmNotes: string;
  triggers: SceneTrigger[];
}

export interface ModuleAuthority {
  sceneIndex: Record<string, SceneAuthority>;
  knownLocationNames: string[];
}

interface RawSceneRecord {
  areaId: string;
  areaName: string;
  locationId: string;
  locationName: string;
  description: string;
  connections: string[];
  actions: string[];
  encounterIds: string[];
  itemNames: string[];
  npcs: any[];
  dmNotes: string;
  triggers: SceneTrigger[];
}

export function buildSceneId(areaId: string, locationId: string): string {
  return `${areaId}:${locationId}`;
}

export function parseLocationRef(
  locationRef: string,
  fallbackAreaId: string,
): ParsedLocationRef {
  if (typeof locationRef !== "string") {
    return {
      areaId: fallbackAreaId,
      locationId: "",
      ref: "",
      sceneId: buildSceneId(fallbackAreaId, ""),
    };
  }

  const [areaIdOrLocationId, explicitLocationId] = locationRef.split(":");
  const areaId = explicitLocationId ? areaIdOrLocationId || fallbackAreaId : fallbackAreaId;
  const locationId = explicitLocationId || areaIdOrLocationId || "";

  return {
    areaId,
    locationId,
    ref: explicitLocationId ? `${areaId}:${locationId}` : locationId,
    sceneId: buildSceneId(areaId, locationId),
  };
}

export function compileModuleAuthority(areas: any[]): ModuleAuthority {
  const rawScenes = collectRawScenes(areas);
  const rawSceneIndex = new Map<string, RawSceneRecord>(
    rawScenes.map((scene) => [buildSceneId(scene.areaId, scene.locationId), scene]),
  );

  const sceneIndex = Object.fromEntries(
    rawScenes.map((scene) => {
      const sceneId = buildSceneId(scene.areaId, scene.locationId);

      return [
        sceneId,
        {
          sceneId,
          areaId: scene.areaId,
          areaName: scene.areaName,
          locationId: scene.locationId,
          locationName: scene.locationName,
          description: scene.description,
          exits: scene.connections.map((connectionRef) =>
            buildAuthorityExit(connectionRef, scene.areaId, rawSceneIndex),
          ),
          actions: scene.actions,
          encounterIds: scene.encounterIds,
          itemNames: scene.itemNames,
          npcNames: scene.npcs
            .map((npc: any) => String(npc?.name || "").trim())
            .filter(Boolean),
          npcs: scene.npcs,
          dmNotes: scene.dmNotes,
          triggers: scene.triggers,
        } satisfies SceneAuthority,
      ];
    }),
  );

  const knownLocationNames = Array.from(
    new Set(
      rawScenes
        .map((scene) => scene.locationName)
        .map((name) => String(name || "").trim())
        .filter(Boolean),
    ),
  );

  return {
    sceneIndex,
    knownLocationNames,
  };
}

export function getSceneAuthority(
  authority: ModuleAuthority | null | undefined,
  areaId: string,
  locationId: string,
): SceneAuthority | null {
  if (!authority) {
    return null;
  }

  return authority.sceneIndex[buildSceneId(areaId, locationId)] || null;
}

function collectRawScenes(areas: any[]): RawSceneRecord[] {
  return (Array.isArray(areas) ? areas : []).flatMap((area: any) => {
    const areaId = String(area?.areaId || "").trim();
    const areaName = String(area?.name || areaId || "").trim();
    const locations = Array.isArray(area?.locations) ? area.locations : [];

    return locations
      .map((location: any) => {
        const locationId = String(location?.id || "").trim();
        if (!areaId || !locationId) {
          return null;
        }

        return {
          areaId,
          areaName,
          locationId,
          locationName: String(location?.name || locationId).trim(),
          description: String(location?.description || "").trim(),
          connections: normalizeStringList(location?.connections),
          actions: normalizeStringList(location?.actions),
          encounterIds: normalizeStringList(location?.encounters),
          itemNames: normalizeStringList(location?.items),
          npcs: Array.isArray(location?.npcs) ? location.npcs : [],
          dmNotes: String(location?.dmNotes || "").trim(),
          triggers: parseSceneTriggers(location?.triggers),
        } satisfies RawSceneRecord;
      })
      .filter(Boolean) as RawSceneRecord[];
  });
}

function buildAuthorityExit(
  connectionRef: string,
  fallbackAreaId: string,
  rawSceneIndex: Map<string, RawSceneRecord>,
): AuthorityExit {
  const parsedRef = parseLocationRef(connectionRef, fallbackAreaId);
  const targetScene = rawSceneIndex.get(parsedRef.sceneId);

  return {
    ref: parsedRef.ref,
    sceneId: parsedRef.sceneId,
    areaId: parsedRef.areaId,
    areaName: targetScene?.areaName || parsedRef.areaId,
    locationId: parsedRef.locationId,
    name: targetScene?.locationName || parsedRef.locationId,
  };
}

function parseSceneTriggers(value: unknown): SceneTrigger[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (t: any) =>
        t &&
        typeof t.id === "string" &&
        t.when === "check_resolved" &&
        typeof t.skill === "string" &&
        typeof t.dc === "number" &&
        t.branches &&
        typeof t.branches.success === "object",
    )
    .map((t: any): SceneTrigger => ({
      id: t.id,
      when: "check_resolved",
      skill: String(t.skill).trim(),
      dc: t.dc,
      branches: {
        success: parseTriggerBranch(t.branches.success),
        ...(t.branches.failure ? { failure: parseTriggerBranch(t.branches.failure) } : {}),
      },
    }));
}

function parseTriggerBranch(raw: any): SceneTriggerBranch {
  return {
    narrativeHint: String(raw?.narrativeHint || "").trim(),
    deployable: {
      encounterIds: normalizeStringList(raw?.deployable?.encounterIds),
      plotNodeIds: normalizeStringList(raw?.deployable?.plotNodeIds),
      itemIds: normalizeStringList(raw?.deployable?.itemIds),
    },
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}
