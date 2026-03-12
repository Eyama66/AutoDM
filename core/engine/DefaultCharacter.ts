import type { CharacterSheet } from "../schemas/CharacterSheet.js";

/**
 * 默认角色卡：半精灵游侠 (示例)
 */
export const DEFAULT_CHARACTER: CharacterSheet = {
  id: "char_default_001",
  name: "索隆·星影",
  race: "Half-Elf",
  class: "Ranger",
  level: 1,
  alignment: "Neutral Good",
  background: "Outlander",
  abilities: {
    str: 10,
    dex: 16,
    con: 14,
    int: 12,
    wis: 14,
    cha: 10,
  },
  hp: {
    current: 12,
    max: 12,
    temp: 0,
  },
  ac: 14, // 11(Leather) + 3(DEX)
  proficiencyBonus: 2,
  proficiencies: {
    skills: ["Perception", "Stealth", "Survival", "Athletics"],
    savingThrows: ["strength", "dexterity"],
    weapons: ["Shortsword", "Longbow"],
    armor: ["Light Armor", "Medium Armor", "Shields"],
  },
  inventory: [
    {
      id: "item_001",
      name: "Leather Armor",
      type: "armor",
      quantity: 1,
      equipped: true,
      properties: { ac_base: 11 },
    },
    {
      id: "item_002",
      name: "Shortsword",
      type: "weapon",
      quantity: 1,
      equipped: true,
      properties: { damage: "1d6" },
    },
    {
      id: "item_003",
      name: "Longbow",
      type: "weapon",
      quantity: 1,
      equipped: true,
      properties: { damage: "1d8" },
    },
  ],
  checkModifiers: [],
  currency: {
    gp: 10,
    sp: 5,
    cp: 0,
  },
  metadata: {
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  },
};
