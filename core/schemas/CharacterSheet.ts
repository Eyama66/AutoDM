import type { Abilities, CheckModifier } from "../rules/CoreRules.js";

/**
 * 角色卡数据结构的 TypeScript 定义
 */
export interface Item {
  id: string;
  name: string;
  type: "weapon" | "armor" | "item" | "consumable";
  quantity: number;
  equipped: boolean;
  properties?: Record<string, any>;
}

export interface CharacterSheet {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  alignment: string;
  background: string;
  abilities: Abilities;
  hp: {
    current: number;
    max: number;
    temp: number;
  };
  ac: number;
  proficiencyBonus: number;
  proficiencies: {
    skills: string[];
    savingThrows: string[];
    weapons: string[];
    armor: string[];
  };
  inventory: Item[];
  checkModifiers?: CheckModifier[];
  currency: {
    gp: number;
    sp: number;
    cp: number;
  };
  metadata: {
    createdAt: string;
    lastUpdated: string;
    status?: string;
  };
}
