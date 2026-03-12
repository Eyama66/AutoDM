import type { CharacterSheet } from "../schemas/CharacterSheet.js";
import { calculateModifier } from "../rules/CoreRules.js";

export interface CombatCreature {
  id: string;
  name: string;
  type: "player" | "monster" | "npc";
  hp: { current: number; max: number };
  ac: number;
  initiative: number;
  isDead: boolean;
  data: any; // Original source data (CharacterSheet or Monster data)
}

/**
 * CombatEngine: 战斗引擎
 * 核心：Initiative Tracking, Attack resolution, Damage parsing
 */
export class CombatEngine {
  private creatures: CombatCreature[] = [];
  private currentTurnIndex: number = 0;
  private isActive: boolean = false;
  private logs: string[] = [];

  /**
   * 启动战斗：对齐先攻
   */
  startCombat(player: CharacterSheet, monsters: any[]) {
    this.isActive = true;
    this.creatures = [];

    // 1. 添加玩家，掷先攻 (1d20 + DEX Mod)
    const playerDexMod = calculateModifier(player.abilities.dex);
    const playerInit = Math.floor(Math.random() * 20) + 1 + playerDexMod;

    this.creatures.push({
      id: player.id,
      name: player.name,
      type: "player",
      hp: player.hp,
      ac: player.ac,
      initiative: playerInit,
      isDead: false,
      data: player,
    });

    // 2. 添加怪物，掷先攻
    monsters.forEach((m) => {
      const dexMod = m.abilities ? calculateModifier(m.abilities.dex || 10) : 0;
      const init = Math.floor(Math.random() * 20) + 1 + dexMod;

      this.creatures.push({
        id: m.id,
        name: m.name,
        type: "monster",
        hp: m.hp,
        ac: m.ac,
        initiative: init,
        isDead: false,
        data: m,
      });
    });

    // 3. 排序先攻
    this.creatures.sort((a, b) => b.initiative - a.initiative);
    this.currentTurnIndex = 0;
    this.logs.push(
      `战斗开始！先攻顺序为：${this.creatures.map((c) => c.name).join(" -> ")}`,
    );
  }

  /**
   * 攻击判定核心逻辑
   * @param attackerId 攻击者 ID
   * @param targetId 目标 ID
   * @param attackName 攻击名称 (用于查找加值)
   */
  resolveAttack(
    attackerId: string,
    targetId: string,
    attackName?: string,
  ): {
    hit: boolean;
    roll: number;
    total: number;
    damage: number;
    log: string;
  } {
    const attacker = this.creatures.find((c) => c.id === attackerId);
    const target = this.creatures.find((c) => c.id === targetId);

    if (!attacker || !target)
      throw new Error("Attack: Invalid attacker or target");

    // 1. 查找攻击加值与伤害骰子
    let bonus = 0;
    let damageDice = "1d4"; // Fallback

    if (attacker.type === "player") {
      const char = attacker.data as CharacterSheet;
      const weaponName =
        attackName ||
        char.inventory.find((i) => i.equipped && i.type === "weapon")?.name ||
        "";
      const weapon = char.inventory.find(
        (i) => i.name === weaponName && i.equipped,
      );
      const strMod = calculateModifier(char.abilities.str);
      const dexMod = calculateModifier(char.abilities.dex);

      // 简化逻辑：如果是远程武器则用敏捷，否则力量
      bonus =
        weapon?.type === "weapon" && weapon.name.toLowerCase().includes("bow")
          ? dexMod
          : strMod;
      bonus += char.proficiencyBonus;
      damageDice = (weapon?.properties?.damage as string) || "1d4";
    } else {
      const monsterAttacks = attacker.data.attacks || [];
      const monsterAttack = monsterAttacks.find(
        (a: any) => a.name === attackName,
      ) ||
        monsterAttacks[0] || { attackBonus: 0, damageDice: "1d4" };
      bonus = monsterAttack.attackBonus;
      damageDice = monsterAttack.damageDice;
    }

    // 2. 掷骰命中
    const d20 = Math.floor(Math.random() * 20) + 1;
    const totalAttack = d20 + bonus;
    const isHit = totalAttack >= target.ac;

    // 3. 计算伤害
    let damageTotal = 0;
    if (isHit) {
      damageTotal = this.rollDice(damageDice);
      target.hp.current = Math.max(0, target.hp.current - damageTotal);
      if (target.hp.current === 0) target.isDead = true;
    }

    if (target.type === "monster" && this.getLivingMonsters().length === 0) {
      this.endCombat();
    }

    const log = `${attacker.name} 使用 ${attackName || "普通攻击"} 对 ${target.name} 掷出 ${d20}+${bonus}=${totalAttack} (${isHit ? "击中" : "落空"})，造成 ${damageTotal} 点伤害。`;
    this.logs.push(log);

    return {
      hit: isHit,
      roll: d20,
      total: totalAttack,
      damage: damageTotal,
      log,
    };
  }

  /**
   * 工具：解析并投掷类似 "1d8+3" 的字符串
   */
  private rollDice(diceStr: string): number {
    const match = diceStr.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!match || !match[1] || !match[2]) return 0;

    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    const mod = parseInt(match[3] || "0");

    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += Math.floor(Math.random() * sides) + 1;
    }
    return Math.max(0, sum + mod);
  }

  getInitiativeOrder() {
    return this.creatures;
  }
  getCurrentTurnCreature(): CombatCreature | undefined {
    return this.creatures[this.currentTurnIndex];
  }
  nextTurn() {
    if (this.creatures.length === 0) return;
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.creatures.length;
    // Skip dead creatures
    let attempts = 0;
    while (
      this.creatures[this.currentTurnIndex]?.isDead &&
      attempts < this.creatures.length
    ) {
      this.currentTurnIndex =
        (this.currentTurnIndex + 1) % this.creatures.length;
      attempts++;
    }
  }

  getLog() {
    return this.logs;
  }
  getCombatStatus() {
    return this.isActive;
  }
  endCombat() {
    this.isActive = false;
  }

  private getLivingMonsters() {
    return this.creatures.filter(
      (creature) => creature.type === "monster" && !creature.isDead,
    );
  }
}
