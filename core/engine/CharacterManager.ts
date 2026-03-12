import type { CharacterSheet } from "../schemas/CharacterSheet.js";

/**
 * CharacterManager: 角色卡内阁
 * 负责角色的加载、保存、合法性校验以及“撕卡”逻辑。
 */
export class CharacterManager {
  private static readonly storagePrefix = "autodm_char_";

  /**
   * 校验角色卡是否符合当前剧本的规则 (例如：CoC 角色不能玩 D&D 剧本)
   */
  static validateForRuleset(
    character: CharacterSheet,
    ruleset: string,
  ): boolean {
    if (ruleset === "dnd5e") {
      // D&D 角色必须有六维
      return !!(character.abilities && character.abilities.str !== undefined);
    }
    // TODO: CoC 校验
    return true;
  }

  /**
   * 判定是否已倒地/失去正常行动能力
   *
   * 当前引擎还没实现正式的濒死与死亡豁免流程，因此暂时将 0 HP 视为
   * “已倒地，不能进行普通动作或普通检定”的状态。
   */
  static isDowned(character: CharacterSheet): boolean {
    return character.hp.current <= 0;
  }

  /**
   * 判定死亡
   *
   * 兼容旧调用点。当前行为与 isDowned 一致，后续若引入 death save
   * 可以再将“倒地”和“真正死亡”拆开。
   */
  static checkIfDeceased(character: CharacterSheet): boolean {
    return this.isDowned(character);
  }

  static canTakeNormalAction(character: CharacterSheet): boolean {
    return !this.isDowned(character);
  }

  /**
   * 模拟保存逻辑 (在 Web 环境下可存入 localStorage 或通过后端 API)
   */
  static async saveCharacter(character: CharacterSheet): Promise<void> {
    try {
      const updatedChar = {
        ...character,
        metadata: {
          ...character.metadata,
          lastUpdated: new Date().toISOString(),
        },
      };

      if (typeof localStorage !== "undefined") {
        localStorage.setItem(
          this.getStorageKey(character.id),
          JSON.stringify(updatedChar),
        );
      }
      console.log(`[CharacterManager] 角色 ${character.name} 已存档。`);
    } catch (e) {
      console.warn("[CharacterManager] 存档失败:", e);
    }
  }

  /**
   * 加载角色
   */
  static loadFromSource(data: any): CharacterSheet {
    // 这里可以进行 Schema 校验
    return data as CharacterSheet;
  }

  static loadSavedCharacter(characterId: string): CharacterSheet | null {
    try {
      if (typeof localStorage === "undefined") {
        return null;
      }

      const raw = localStorage.getItem(this.getStorageKey(characterId));
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as CharacterSheet;
    } catch (e) {
      console.warn(`[CharacterManager] 读取角色 ${characterId} 失败:`, e);
      return null;
    }
  }

  static clearSavedCharacter(characterId: string): void {
    try {
      if (typeof localStorage === "undefined") {
        return;
      }

      localStorage.removeItem(this.getStorageKey(characterId));
    } catch (e) {
      console.warn(`[CharacterManager] 清除角色 ${characterId} 存档失败:`, e);
    }
  }

  private static getStorageKey(characterId: string): string {
    return `${this.storagePrefix}${characterId}`;
  }
}
