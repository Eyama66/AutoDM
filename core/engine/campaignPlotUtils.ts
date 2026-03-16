export interface PlotNodeLike {
  id: string;
  title?: string;
  status?: string;
  nextPoints?: string[];
  prerequisites?: string[];
}

export interface ModulePlotLike {
  plotTitle?: string;
  mainObjective?: string;
  plotPoints?: PlotNodeLike[];
}

export interface PlotFrontier {
  completedNodeIds: string[];
  activeNodeIds: string[];
  allowedNodeIds: string[];
  blockedNodeIds: string[];
}

export function getCompletedPlotNodeIds(
  plotProgress: string[] | undefined,
): string[] {
  if (!Array.isArray(plotProgress)) {
    return [];
  }

  return Array.from(
    new Set(
      plotProgress
        .map((plotId) => String(plotId || "").trim())
        .filter(Boolean),
    ),
  );
}

export function buildPlotFrontier(
  modulePlot: ModulePlotLike | null | undefined,
  plotProgress: string[] | undefined,
): PlotFrontier {
  const nodes = Array.isArray(modulePlot?.plotPoints) ? modulePlot.plotPoints : [];
  const completedNodeIds = getCompletedPlotNodeIds(plotProgress);
  const completedSet = new Set(completedNodeIds);
  const knownNodeIds = new Set(nodes.map((node) => node.id).filter(Boolean));

  const activeNodeIds = Array.from(
    new Set(
      nodes
        .filter((node) => isNodeInitiallyActive(node))
        .map((node) => node.id)
        .filter((nodeId) => !!nodeId && !completedSet.has(nodeId)),
    ),
  );

  const allowedSet = new Set(activeNodeIds);

  for (const node of nodes) {
    if (!node?.id || !completedSet.has(node.id)) {
      continue;
    }

    for (const nextId of Array.isArray(node.nextPoints) ? node.nextPoints : []) {
      const trimmedNextId = String(nextId || "").trim();
      if (!trimmedNextId || completedSet.has(trimmedNextId) || !knownNodeIds.has(trimmedNextId)) {
        continue;
      }

      const targetNode = nodes.find((candidate) => candidate.id === trimmedNextId);
      if (targetNode && arePrerequisitesSatisfied(targetNode, completedSet)) {
        allowedSet.add(trimmedNextId);
      }
    }
  }

  if (allowedSet.size === 0) {
    for (const node of nodes) {
      if (!node?.id || completedSet.has(node.id)) {
        continue;
      }

      if (arePrerequisitesSatisfied(node, completedSet) && isNodeInitiallyReachable(node)) {
        allowedSet.add(node.id);
      }
    }
  }

  const blockedNodeIds = nodes
    .map((node) => node.id)
    .filter(
      (nodeId) =>
        !!nodeId && !completedSet.has(nodeId) && !allowedSet.has(nodeId),
    );

  return {
    completedNodeIds,
    activeNodeIds,
    allowedNodeIds: Array.from(allowedSet),
    blockedNodeIds,
  };
}

export function isPlotUpdateAllowed(
  modulePlot: ModulePlotLike | null | undefined,
  plotProgress: string[] | undefined,
  plotPointId: string,
): boolean {
  const normalizedId = String(plotPointId || "").trim();
  if (!normalizedId) {
    return false;
  }

  const frontier = buildPlotFrontier(modulePlot, plotProgress);
  return frontier.allowedNodeIds.includes(normalizedId);
}

function arePrerequisitesSatisfied(
  node: PlotNodeLike,
  completedSet: Set<string>,
): boolean {
  const prerequisites = Array.isArray(node.prerequisites) ? node.prerequisites : [];
  return prerequisites.every((requiredId) => completedSet.has(requiredId));
}

function isNodeInitiallyActive(node: PlotNodeLike): boolean {
  const status = normalizeStatus(node.status);
  return status === "active" || status === "in progress";
}

function isNodeInitiallyReachable(node: PlotNodeLike): boolean {
  const status = normalizeStatus(node.status);
  return status === "active" || status === "in progress" || status === "not started";
}

function normalizeStatus(status: string | undefined): string {
  return String(status || "").trim().toLowerCase();
}
