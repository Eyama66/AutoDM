import type { ParsedAction } from "./ActionProcessor.js";
import { CharacterManager } from "./CharacterManager.js";
import { fetchMonsters } from "./campaignMonsterUtils.js";
import {
  parseCheckPayload,
  parseCheckSetPayload,
  parseKeyValuePayload,
  parseListPayload,
} from "./campaignPayloadUtils.js";
import { buildActiveScene } from "./campaignStateUtils.js";
import { CombatEngine } from "./CombatEngine.js";
import type { EngineState } from "../session/EngineState.js";
import type { EventSource, KnownEngineEvent } from "../session/EngineEvent.js";

export interface CampaignEventFactory {
  <TType extends KnownEngineEvent["type"]>(
    type: TType,
    payload: Extract<KnownEngineEvent, { type: TType }>["payload"],
    source?: EventSource,
  ): Extract<KnownEngineEvent, { type: TType }>;
}

interface CampaignActionEffectContext {
  action: ParsedAction;
  state: EngineState;
  combatEngine: CombatEngine;
  monsterLibrary: any[];
  loadArea: (areaId: string) => void;
  buildCombatId: () => string;
  createEvent: CampaignEventFactory;
}

export function applyCampaignAction({
  action,
  state,
  combatEngine,
  monsterLibrary,
  loadArea,
  buildCombatId,
  createEvent,
}: CampaignActionEffectContext): KnownEngineEvent[] {
  const emittedEvents: KnownEngineEvent[] = [];

  switch (action.type) {
    case "@MOVE": {
      const fromAreaId = state.currentAreaId;
      const fromLocationId = state.currentLocationId;
      const moveTarget = action.payload;

      if (moveTarget.includes(":")) {
        const [areaId, locId] = moveTarget.split(":");
        if (areaId && locId && areaId !== state.currentAreaId) {
          console.log(`[Campaign] 跨区域移动: ${state.currentAreaId} -> ${areaId}`);
          state.currentAreaId = areaId;
          loadArea(areaId);
        }
        state.currentLocationId = locId || "";
      } else {
        state.currentLocationId = action.payload;
      }

      state.activeScene = buildActiveScene(state);
      emittedEvents.push(
        createEvent("MOVE_RESOLVED", {
          fromAreaId,
          fromLocationId,
          toAreaId: state.currentAreaId,
          toLocationId: state.currentLocationId,
        }),
      );
      return emittedEvents;
    }

    case "@ATTR_UPDATE": {
      const parts = action.payload.split(":");
      if (parts.length !== 2 || !parts[0]) {
        return emittedEvents;
      }

      const attr = parts[0].toUpperCase();
      const val = parseInt(parts[1] || "0", 10);
      if (attr !== "HP" || Number.isNaN(val)) {
        return emittedEvents;
      }

      const previousHp = state.characterSheet.hp.current;
      const newHp = Math.max(
        0,
        Math.min(state.characterSheet.hp.max, previousHp + val),
      );
      state.characterSheet.hp.current = newHp;
      const delta = newHp - previousHp;

      emittedEvents.push(
        createEvent("ATTRIBUTE_UPDATED", {
          attribute: "HP",
          previousValue: previousHp,
          newValue: newHp,
          delta,
        }),
      );

      if (delta < 0) {
        emittedEvents.push(
          createEvent("DAMAGE_APPLIED", {
            targetId: state.characterSheet.id,
            amount: Math.abs(delta),
          }),
        );
      }

      if (newHp <= 0) {
        state.phase = "endgame";
        state.variables.last_chance_available = false;
      } else if (state.phase === "endgame") {
        state.phase = state.isCombatActive ? "combat" : "resolution";
        state.variables.last_chance_available = false;
      }

      return emittedEvents;
    }

    case "@PLOT_UPDATE": {
      const plotPointId = action.payload.trim();
      state.plotProgress.push(plotPointId);
      emittedEvents.push(
        createEvent("PLOT_UPDATED", {
          plotPointId,
        }),
      );
      return emittedEvents;
    }

    case "@INIT_COMBAT":
    case "@COMBAT_START": {
      console.log(`[Combat] 遭遇敌袭: ${action.payload}`);
      state.isCombatActive = true;
      state.phase = "combat";

      const monsterIds = parseListPayload(action.payload);
      const monstersToInit = fetchMonsters(monsterLibrary, monsterIds);
      combatEngine.startCombat(state.characterSheet, monstersToInit);

      const initiativeOrder = combatEngine
        .getInitiativeOrder()
        .map((creature) => creature.id);
      const activeTurnParticipantId =
        combatEngine.getCurrentTurnCreature()?.id;
      const combatId = buildCombatId();

      state.combat = {
        combatId,
        initiativeOrder,
        ...(monsterIds[0] ? { activeEncounterId: monsterIds[0] } : {}),
        ...(activeTurnParticipantId ? { activeTurnParticipantId } : {}),
      };

      emittedEvents.push(
        createEvent("COMBAT_STARTED", {
          combatId,
          participantIds: initiativeOrder,
          encounterIds: monsterIds,
        }),
      );
      return emittedEvents;
    }

    case "@COMBAT_END": {
      const endingCombatId = state.combat?.combatId;
      state.isCombatActive = false;
      state.phase = "resolution";
      combatEngine.endCombat();
      delete state.combat;
      emittedEvents.push(
        createEvent(
          "COMBAT_ENDED",
          endingCombatId ? { combatId: endingCombatId } : {},
        ),
      );
      return emittedEvents;
    }

    case "@SESSION_END": {
      const sessionEndReason = action.payload.trim();
      state.phase = "completed";
      state.isCombatActive = false;
      state.variables.last_chance_available = false;
      state.variables.session_end_reason = sessionEndReason;
      combatEngine.endCombat();
      delete state.combat;
      emittedEvents.push(
        createEvent("SESSION_ENDED", {
          reason: sessionEndReason,
          finalPhase: "completed",
        }),
      );
      return emittedEvents;
    }

    case "@STATUS_ADD": {
      const condition = action.payload.trim();
      if (!condition) return emittedEvents;
      if (!state.characterSheet.conditions) {
        state.characterSheet.conditions = [];
      }
      if (!state.characterSheet.conditions.includes(condition)) {
        state.characterSheet.conditions.push(condition);
      }
      emittedEvents.push(
        createEvent("CONDITION_UPDATED", {
          op: "add",
          condition,
          conditions: [...state.characterSheet.conditions],
        }),
      );
      return emittedEvents;
    }

    case "@STATUS_REMOVE": {
      const condition = action.payload.trim();
      if (!condition) return emittedEvents;
      if (state.characterSheet.conditions) {
        state.characterSheet.conditions = state.characterSheet.conditions.filter(
          (c) => c !== condition,
        );
      }
      emittedEvents.push(
        createEvent("CONDITION_UPDATED", {
          op: "remove",
          condition,
          conditions: [...(state.characterSheet.conditions ?? [])],
        }),
      );
      return emittedEvents;
    }

    case "@VAR_UPDATE": {
      const parsedVariableUpdate = parseKeyValuePayload(action.payload);
      if (!parsedVariableUpdate) {
        return emittedEvents;
      }

      const { key, value } = parsedVariableUpdate;
      const normalizedKey = key.trim();
      const previousValue = state.variables[normalizedKey];
      const hasPreviousValue = Object.prototype.hasOwnProperty.call(
        state.variables,
        normalizedKey,
      );
      const parsedValue = parseVariableValue(value);

      state.variables[normalizedKey] = parsedValue;
      if (normalizedKey === "last_chance_available") {
        if (parsedValue === true && CharacterManager.isDowned(state.characterSheet)) {
          state.phase = "endgame";
        } else if (parsedValue === false && state.phase === "endgame") {
          state.variables.last_chance_available = false;
        }
      }

      emittedEvents.push(
        createEvent("VARIABLE_UPDATED", {
          key: normalizedKey,
          ...(hasPreviousValue ? { previousValue } : {}),
          newValue: parsedValue,
        }),
      );
      console.log(`[Campaign] 变量更新: ${normalizedKey} = ${parsedValue}`);
      return emittedEvents;
    }

    case "@CHECK": {
      const parsedCheck = parseCheckPayload(action.payload);
      if (!parsedCheck) {
        return emittedEvents;
      }

      emittedEvents.push(
        createEvent("CHECK_REQUESTED", {
          mode: "single",
          checks: [
            {
              skill: parsedCheck.skill,
              dc: parsedCheck.dc,
              ...(parsedCheck.reason ? { reason: parsedCheck.reason } : {}),
            },
          ],
        }),
      );
      return emittedEvents;
    }

    case "@CHECK_SET": {
      const parsedCheckSet = parseCheckSetPayload(action.payload);
      if (!parsedCheckSet) {
        return emittedEvents;
      }

      emittedEvents.push(
        createEvent("CHECK_REQUESTED", {
          mode: parsedCheckSet.mode,
          label: parsedCheckSet.label,
          ...(parsedCheckSet.explanation
            ? { explanation: parsedCheckSet.explanation }
            : {}),
          checks: parsedCheckSet.checks.map((check) => ({
            skill: check.skill,
            dc: check.dc,
            ...(check.reason ? { reason: check.reason } : {}),
          })),
        }),
      );
      return emittedEvents;
    }

    case "@ROLL": {
      const parsedRoll = parseKeyValuePayload(action.payload);
      if (!parsedRoll) {
        return emittedEvents;
      }

      emittedEvents.push(
        createEvent("ROLL_REQUESTED", {
          label: parsedRoll.key,
          formula: parsedRoll.value,
        }),
      );
      return emittedEvents;
    }

    case "@ITEM_ADD": {
      const itemName = action.payload.trim();
      if (!itemName) return emittedEvents;

      if (!state.characterSheet.inventory) {
        state.characterSheet.inventory = [];
      }

      const newItem = {
        id: `item_found_${Date.now()}`,
        name: itemName,
        type: "item",
        quantity: 1,
        equipped: false,
      };
      state.characterSheet.inventory.push(newItem);

      emittedEvents.push(
        createEvent("ITEM_ACQUIRED", {
          itemId: newItem.id,
          itemName,
        }),
      );
      return emittedEvents;
    }
  }

  return emittedEvents;
}

function parseVariableValue(rawValue: string): unknown {
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  if (!Number.isNaN(Number(rawValue))) {
    return Number(rawValue);
  }
  return rawValue;
}
