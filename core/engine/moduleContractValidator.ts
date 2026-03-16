import { ActionProcessor, SUPPORTED_ACTION_TYPES, type ParsedAction } from "./ActionProcessor.js";
import { parseLocationRef } from "./campaignAuthority.js";
import {
  isValidCheckPayload,
  isValidCheckSetPayload,
  isValidFormulaRoll,
  isValidVariableUpdate,
  parseKeyValuePayload,
  parseListPayload,
} from "./campaignPayloadUtils.js";
import type { ModulePlotLike, PlotNodeLike } from "./campaignPlotUtils.js";

export interface ModuleContractSource {
  manifest: {
    moduleId?: string;
    globalVariables?: Record<string, unknown>;
  };
  modulePlot: ModulePlotLike | null | undefined;
  areas: any[];
}

export interface ModuleContractIssue {
  severity: "error" | "warning";
  file: string;
  code: string;
  message: string;
}

export interface ModuleContractValidationResult {
  errors: ModuleContractIssue[];
  warnings: ModuleContractIssue[];
}

interface SceneContext {
  file: string;
  areaId: string;
  locationId: string;
  connections: Set<string>;
  encounterIds: Set<string>;
  itemNames: Set<string>;
  plotNodeIds: Set<string>;
  globalVariableKeys: Set<string>;
}

const SUPPORTED_ACTION_TYPE_SET = new Set<string>(SUPPORTED_ACTION_TYPES);

export function validateModuleContracts(
  source: ModuleContractSource,
): ModuleContractValidationResult {
  const issues: ModuleContractIssue[] = [];
  const plotNodes = Array.isArray(source.modulePlot?.plotPoints)
    ? source.modulePlot?.plotPoints
    : [];
  const plotNodeIds = new Set(
    plotNodes.map((node) => String(node?.id || "").trim()).filter(Boolean),
  );
  const globalVariableKeys = new Set(
    Object.keys(source.manifest?.globalVariables || {}).map((key) => String(key || "").trim()),
  );
  const knownSceneIds = collectKnownSceneIds(source.areas);

  issues.push(...validatePlotGraph(plotNodes, plotNodeIds, "data/modules/*/module_plot.json"));
  issues.push(
    ...validateAreas(
      source.areas,
      knownSceneIds,
      plotNodeIds,
      globalVariableKeys,
    ),
  );

  return {
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
  };
}

function validatePlotGraph(
  plotNodes: PlotNodeLike[],
  plotNodeIds: Set<string>,
  file: string,
): ModuleContractIssue[] {
  const issues: ModuleContractIssue[] = [];
  const incomingCounts = new Map<string, number>();

  for (const node of plotNodes) {
    const nodeId = String(node?.id || "").trim();
    if (!nodeId) {
      issues.push({
        severity: "error",
        file,
        code: "plot.missing_id",
        message: "存在缺少 id 的 plot node。",
      });
      continue;
    }

    for (const nextId of Array.isArray(node?.nextPoints) ? node.nextPoints : []) {
      const normalizedNextId = String(nextId || "").trim();
      if (!plotNodeIds.has(normalizedNextId)) {
        issues.push({
          severity: "error",
          file,
          code: "plot.unknown_next_point",
          message: `Plot node ${nodeId} 引用了不存在的 nextPoints: ${normalizedNextId}`,
        });
        continue;
      }
      incomingCounts.set(
        normalizedNextId,
        (incomingCounts.get(normalizedNextId) || 0) + 1,
      );
    }

    for (const prerequisiteId of Array.isArray(node?.prerequisites) ? node.prerequisites : []) {
      const normalizedPrerequisiteId = String(prerequisiteId || "").trim();
      if (!plotNodeIds.has(normalizedPrerequisiteId)) {
        issues.push({
          severity: "error",
          file,
          code: "plot.unknown_prerequisite",
          message: `Plot node ${nodeId} 引用了不存在的 prerequisite: ${normalizedPrerequisiteId}`,
        });
      }
    }

    if ("trigger" in (node || {})) {
      issues.push({
        severity: "warning",
        file,
        code: "plot.dead_trigger_field",
        message: `Plot node ${nodeId} 仍带有 trigger 字段，但当前引擎并不会消费它。`,
      });
    }
  }

  for (const node of plotNodes) {
    const nodeId = String(node?.id || "").trim();
    const status = String(node?.status || "").trim().toLowerCase();
    const prerequisites = Array.isArray(node?.prerequisites) ? node.prerequisites : [];
    if (
      status === "not started" &&
      prerequisites.length === 0 &&
      (incomingCounts.get(nodeId) || 0) === 0
    ) {
      issues.push({
        severity: "warning",
        file,
        code: "plot.unconstrained_node",
        message: `Plot node ${nodeId} 没有 prerequisites，也没有上游 nextPoints；按当前引擎逻辑它会过早可达。`,
      });
    }
  }

  return issues;
}

function validateAreas(
  areas: any[],
  knownSceneIds: Set<string>,
  plotNodeIds: Set<string>,
  globalVariableKeys: Set<string>,
): ModuleContractIssue[] {
  const issues: ModuleContractIssue[] = [];

  for (const area of Array.isArray(areas) ? areas : []) {
    const areaId = String(area?.areaId || "").trim();
    const file = buildAreaFileLabel(areaId);

    issues.push(
      ...validateEmbeddedActions(
        String(area?.dmInstructions || ""),
        {
          file,
          areaId,
          locationId: "",
          connections: new Set<string>(),
          encounterIds: new Set<string>(),
          itemNames: new Set<string>(),
          plotNodeIds,
          globalVariableKeys,
        },
        knownSceneIds,
        "area.dmInstructions",
      ),
    );

    for (const location of Array.isArray(area?.locations) ? area.locations : []) {
      const locationId = String(location?.id || "").trim();
      const sceneContext: SceneContext = {
        file,
        areaId,
        locationId,
        connections: new Set(
          (Array.isArray(location?.connections) ? location.connections : [])
            .map((entry: unknown) => parseLocationRef(String(entry || ""), areaId).sceneId),
        ),
        encounterIds: new Set(normalizeStringList(location?.encounters)),
        itemNames: new Set(normalizeStringList(location?.items)),
        plotNodeIds,
        globalVariableKeys,
      };

      issues.push(...validateSceneActions(location?.actions, sceneContext));
      issues.push(...validateSceneTriggers(location?.triggers, sceneContext));
      issues.push(
        ...validateEmbeddedActions(
          String(location?.dmNotes || ""),
          sceneContext,
          knownSceneIds,
          `${locationId}.dmNotes`,
        ),
      );
    }
  }

  return issues;
}

function validateSceneTriggers(
  triggers: unknown,
  sceneContext: SceneContext,
): ModuleContractIssue[] {
  const issues: ModuleContractIssue[] = [];

  for (const trigger of Array.isArray(triggers) ? triggers : []) {
    const triggerId = String(trigger?.id || "").trim();
    const successBranch = trigger?.branches?.success;
    const failureBranch = trigger?.branches?.failure;

    if (!triggerId || trigger?.when !== "check_resolved") {
      issues.push({
        severity: "error",
        file: sceneContext.file,
        code: "trigger.invalid_shape",
        message: `${sceneContext.locationId} 存在无法识别的 trigger 定义。`,
      });
      continue;
    }

    issues.push(
      ...validateTriggerBranch(
        successBranch?.deployable,
        triggerId,
        "success",
        sceneContext,
      ),
    );

    if (failureBranch) {
      issues.push(
        ...validateTriggerBranch(
          failureBranch?.deployable,
          triggerId,
          "failure",
          sceneContext,
        ),
      );
    }
  }

  return issues;
}

function validateSceneActions(
  actions: unknown,
  sceneContext: SceneContext,
): ModuleContractIssue[] {
  const issues: ModuleContractIssue[] = [];

  for (const actionTag of Array.isArray(actions) ? actions : []) {
    const rawTag = String(actionTag || "").trim();
    if (!rawTag) {
      continue;
    }

    const normalizedTag = rawTag.startsWith("[@") ? rawTag : `[${rawTag}]`;
    const parsedActions = ActionProcessor.parse(normalizedTag);
    if (parsedActions.length !== 1) {
      issues.push({
        severity: "error",
        file: sceneContext.file,
        code: "scene.invalid_action_tag",
        message: `${sceneContext.locationId}.actions 包含无法解析的动作标签: ${rawTag}`,
      });
      continue;
    }

    const parsedAction = parsedActions[0];
    if (!parsedAction) {
      continue;
    }

    issues.push(...validateParsedAction(parsedAction, sceneContext, "scene.actions"));
  }

  return issues;
}

function validateEmbeddedActions(
  text: string,
  sceneContext: SceneContext,
  knownSceneIds: Set<string>,
  sourceLabel: string,
): ModuleContractIssue[] {
  const issues: ModuleContractIssue[] = [];
  const parsedActions = ActionProcessor.parse(text);

  for (const action of parsedActions) {
    issues.push(
      ...validateParsedAction(action, sceneContext, sourceLabel, knownSceneIds),
    );
  }

  return issues;
}

function validateParsedAction(
  action: ParsedAction,
  sceneContext: SceneContext,
  sourceLabel: string,
  knownSceneIds: Set<string> = new Set<string>(),
): ModuleContractIssue[] {
  const issues: ModuleContractIssue[] = [];

  if (!SUPPORTED_ACTION_TYPE_SET.has(action.type)) {
    issues.push({
      severity: "error",
      file: sceneContext.file,
      code: "action.unsupported_type",
      message: `${sourceLabel} 使用了当前引擎不支持的动作类型: ${action.type}`,
    });
    return issues;
  }

  switch (action.type) {
    case "@MOVE": {
      const targetSceneId = parseLocationRef(action.payload, sceneContext.areaId).sceneId;
      if (!knownSceneIds.has(targetSceneId)) {
        issues.push({
          severity: "error",
          file: sceneContext.file,
          code: "move.unknown_target",
          message: `${sourceLabel} 使用了不存在的移动目标: ${action.payload}`,
        });
      } else if (
        sceneContext.connections.size > 0 &&
        !sceneContext.connections.has(targetSceneId)
      ) {
        issues.push({
          severity: "error",
          file: sceneContext.file,
          code: "move.out_of_scene_connection",
          message: `${sourceLabel} 尝试移动到当前地点未连接的目标: ${action.payload}`,
        });
      }
      break;
    }
    case "@COMBAT_START":
    case "@INIT_COMBAT": {
      const encounterIds = parseListPayload(action.payload);
      if (encounterIds.length === 0) {
        issues.push(buildInvalidPayloadIssue(sceneContext.file, sourceLabel, action));
        break;
      }
      for (const encounterId of encounterIds) {
        if (
          sceneContext.encounterIds.size > 0 &&
          !sceneContext.encounterIds.has(encounterId)
        ) {
          issues.push({
            severity: "error",
            file: sceneContext.file,
            code: "combat.unknown_encounter",
            message: `${sourceLabel} 引用了当前场景未声明的 encounter: ${encounterId}`,
          });
        }
      }
      break;
    }
    case "@ITEM_ADD": {
      const itemName = String(action.payload || "").trim();
      if (
        !itemName ||
        (sceneContext.itemNames.size > 0 && !sceneContext.itemNames.has(itemName))
      ) {
        issues.push({
          severity: "error",
          file: sceneContext.file,
          code: "item.unknown_scene_item",
          message: `${sourceLabel} 引用了当前场景未声明的 item: ${action.payload}`,
        });
      }
      break;
    }
    case "@PLOT_UPDATE": {
      const plotNodeId = String(action.payload || "").trim();
      if (!sceneContext.plotNodeIds.has(plotNodeId)) {
        issues.push({
          severity: "error",
          file: sceneContext.file,
          code: "plot.unknown_node",
          message: `${sourceLabel} 引用了不存在的 plot node: ${action.payload}`,
        });
      }
      break;
    }
    case "@VAR_UPDATE": {
      if (!isValidVariableUpdate(action.payload)) {
        issues.push(buildInvalidPayloadIssue(sceneContext.file, sourceLabel, action));
        break;
      }

      const parsedPayload = parseKeyValuePayload(action.payload);
      if (
        parsedPayload &&
        sceneContext.globalVariableKeys.size > 0 &&
        !sceneContext.globalVariableKeys.has(parsedPayload.key)
      ) {
        issues.push({
          severity: "warning",
          file: sceneContext.file,
          code: "var.undeclared_key",
          message: `${sourceLabel} 更新了 manifest 中未声明的变量: ${parsedPayload.key}`,
        });
      }
      break;
    }
    case "@CHECK":
      if (!isValidCheckPayload(action.payload)) {
        issues.push(buildInvalidPayloadIssue(sceneContext.file, sourceLabel, action));
      }
      break;
    case "@CHECK_SET":
      if (!isValidCheckSetPayload(action.payload)) {
        issues.push(buildInvalidPayloadIssue(sceneContext.file, sourceLabel, action));
      }
      break;
    case "@ROLL":
      if (!isValidFormulaRoll(action.payload)) {
        issues.push(buildInvalidPayloadIssue(sceneContext.file, sourceLabel, action));
      }
      break;
    default:
      break;
  }

  return issues;
}

function validateTriggerBranch(
  deployable: unknown,
  triggerId: string,
  branch: string,
  sceneContext: SceneContext,
): ModuleContractIssue[] {
  const issues: ModuleContractIssue[] = [];
  const encounterIds = normalizeStringList((deployable as any)?.encounterIds);
  const plotNodeIds = normalizeStringList((deployable as any)?.plotNodeIds);
  const itemIds = normalizeStringList((deployable as any)?.itemIds);

  for (const encounterId of encounterIds) {
    if (!sceneContext.encounterIds.has(encounterId)) {
      issues.push({
        severity: "error",
        file: sceneContext.file,
        code: "trigger.unknown_encounter",
        message: `Trigger ${triggerId}.${branch} 引用了当前场景未声明的 encounter: ${encounterId}`,
      });
    }
  }

  for (const plotNodeId of plotNodeIds) {
    if (!sceneContext.plotNodeIds.has(plotNodeId)) {
      issues.push({
        severity: "error",
        file: sceneContext.file,
        code: "trigger.unknown_plot_node",
        message: `Trigger ${triggerId}.${branch} 引用了不存在的 plot node: ${plotNodeId}`,
      });
    }
  }

  for (const itemId of itemIds) {
    if (!sceneContext.itemNames.has(itemId)) {
      issues.push({
        severity: "error",
        file: sceneContext.file,
        code: "trigger.unknown_item",
        message: `Trigger ${triggerId}.${branch} 引用了当前场景未声明的 item: ${itemId}`,
      });
    }
  }

  return issues;
}

function buildInvalidPayloadIssue(
  file: string,
  sourceLabel: string,
  action: ParsedAction,
): ModuleContractIssue {
  return {
    severity: "error",
    file,
    code: "action.invalid_payload",
    message: `${sourceLabel} 中的 ${action.originalTag} payload 不合法。`,
  };
}

function collectKnownSceneIds(areas: any[]): Set<string> {
  const sceneIds = new Set<string>();

  for (const area of Array.isArray(areas) ? areas : []) {
    const areaId = String(area?.areaId || "").trim();
    for (const location of Array.isArray(area?.locations) ? area.locations : []) {
      const locationId = String(location?.id || "").trim();
      if (areaId && locationId) {
        sceneIds.add(`${areaId}:${locationId}`);
      }
    }
  }

  return sceneIds;
}

function buildAreaFileLabel(areaId: string): string {
  return `data/modules/*/areas/${areaId || "UNKNOWN"}.json`;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}
