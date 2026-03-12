/**
 * 核心规则基础库
 * 包含 5e 常用的计算逻辑：Modifier, AC, Proficiency, Saving Throw etc.
 */

export interface Abilities {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export type AbilityKey = keyof Abilities;

export interface CheckModifier {
  label: string;
  value: number;
  scope?: "all" | "skill" | "ability";
  target?: string;
}

export interface AppliedCheckModifier {
  label: string;
  value: number;
  scope: "all" | "skill" | "ability";
  target?: string;
}

export interface CheckBreakdownPart {
  kind:
    | "base_roll"
    | "ability_modifier"
    | "proficiency_bonus"
    | "situational_modifier";
  label: string;
  value: number;
}

export interface CheckSetup {
  abilityKey: AbilityKey;
  abilityLabel: string;
  abilityModifier: number;
  proficiencyApplied: boolean;
  proficiencyBonus: number;
  situationalModifiers: AppliedCheckModifier[];
  staticModifierTotal: number;
  parts: CheckBreakdownPart[];
  previewExpression: string;
}

export interface CheckResult {
  total: number;
  rollSignal: "normal" | "high" | "low";
  breakdown: CheckSetup & {
    baseRoll: number;
    expression: string;
  };
}

interface CheckContextOptions {
  checkModifiers?: CheckModifier[];
}

/**
 * 5e 计算规则：(Score - 10) / 2 向下取整
 */
export const calculateModifier = (score: number): number => {
  return Math.floor((score - 10) / 2);
};

/**
 * 等级对应的熟练加值
 */
export const calculateProficiencyBonus = (level: number): number => {
  return Math.floor((level - 1) / 4) + 2;
};

/**
 * 技能与属性的映射
 */
export const SKILL_ABILITY_MAP: Record<string, AbilityKey> = {
  Athletics: "str",
  Acrobatics: "dex",
  "Sleight of Hand": "dex",
  Stealth: "dex",
  Arcana: "int",
  History: "int",
  Investigation: "int",
  Nature: "int",
  Religion: "int",
  AnimalHandling: "wis",
  Insight: "wis",
  Medicine: "wis",
  Perception: "wis",
  Survival: "wis",
  Deception: "cha",
  Intimidation: "cha",
  Performance: "cha",
  Persuasion: "cha",
};

const SKILL_NAME_ALIASES: Record<string, string> = {
  athletics: "Athletics",
  acrobatics: "Acrobatics",
  "sleight of hand": "Sleight of Hand",
  stealth: "Stealth",
  arcana: "Arcana",
  history: "History",
  investigation: "Investigation",
  nature: "Nature",
  religion: "Religion",
  animalhandling: "AnimalHandling",
  "animal handling": "AnimalHandling",
  insight: "Insight",
  medicine: "Medicine",
  perception: "Perception",
  survival: "Survival",
  deception: "Deception",
  intimidation: "Intimidation",
  performance: "Performance",
  persuasion: "Persuasion",
  运动: "Athletics",
  体操: "Acrobatics",
  巧手: "Sleight of Hand",
  隐匿: "Stealth",
  奥法: "Arcana",
  历史: "History",
  调查: "Investigation",
  自然: "Nature",
  宗教: "Religion",
  驯兽: "AnimalHandling",
  洞悉: "Insight",
  医药: "Medicine",
  感知: "Perception",
  求生: "Survival",
  欺瞒: "Deception",
  威吓: "Intimidation",
  表演: "Performance",
  说服: "Persuasion",
  口才: "Persuasion",
  交涉: "Persuasion",
  游说: "Persuasion",
};

const ABILITY_CHECK_ALIASES: Record<string, AbilityKey> = {
  str: "str",
  strength: "str",
  力量: "str",
  dex: "dex",
  dexterity: "dex",
  敏捷: "dex",
  con: "con",
  constitution: "con",
  体质: "con",
  int: "int",
  intelligence: "int",
  智力: "int",
  wis: "wis",
  wisdom: "wis",
  感知豁免: "wis",
  cha: "cha",
  charisma: "cha",
  魅力: "cha",
};

const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "力量",
  dex: "敏捷",
  con: "体质",
  int: "智力",
  wis: "感知",
  cha: "魅力",
};

const normalizeLookupKey = (value: string): string => value.trim().toLowerCase();

const formatSignedNumber = (value: number): string =>
  value >= 0 ? `+${value}` : `${value}`;

const formatCheckExpression = (
  baseRoll: number | null,
  parts: CheckBreakdownPart[],
  total?: number,
): string => {
  const tokens: string[] = [];

  if (baseRoll !== null) {
    tokens.push(`1d20(${baseRoll})`);
  } else {
    tokens.push("1d20");
  }

  parts.forEach((part) => {
    tokens.push(`${part.label}(${formatSignedNumber(part.value)})`);
  });

  const expression = tokens.join(" + ").replace(/\+\s(-\d+)/g, "- $1");
  return typeof total === "number" ? `${expression} = ${total}` : expression;
};

export const normalizeSkillName = (skill: string): string | null => {
  return SKILL_NAME_ALIASES[normalizeLookupKey(skill)] || null;
};

const resolveCheckSource = (
  checkName: string,
): { abilityKey: AbilityKey; proficiencySkill: string | null } => {
  const normalizedName = normalizeLookupKey(checkName);
  const abilityKey = ABILITY_CHECK_ALIASES[normalizedName];

  if (abilityKey) {
    return { abilityKey, proficiencySkill: null };
  }

  const normalizedSkill = normalizeSkillName(checkName);
  if (normalizedSkill) {
    return {
      abilityKey: SKILL_ABILITY_MAP[normalizedSkill] || "str",
      proficiencySkill: normalizedSkill,
    };
  }

  return { abilityKey: "str", proficiencySkill: null };
};

const resolveAppliedCheckModifiers = (
  checkName: string,
  abilityKey: AbilityKey,
  checkModifiers: CheckModifier[] = [],
): AppliedCheckModifier[] => {
  const normalizedCheck = normalizeLookupKey(checkName);
  const normalizedSkill = normalizeSkillName(checkName);

  return checkModifiers
    .map((modifier) => {
      const target =
        typeof modifier?.target === "string" ? modifier.target.trim() : "";

      return {
        label: String(modifier?.label || "").trim(),
        value: Number(modifier?.value),
        scope: modifier?.scope || "all",
        ...(target ? { target } : {}),
      };
    })
    .filter(
      (modifier) =>
        modifier.label && Number.isFinite(modifier.value) && modifier.value !== 0,
    )
    .filter((modifier) => {
      if (modifier.scope === "all") {
        return true;
      }

      if (modifier.scope === "ability") {
        const modifierTarget = modifier.target
          ? ABILITY_CHECK_ALIASES[normalizeLookupKey(modifier.target)]
          : null;
        return modifierTarget === abilityKey;
      }

      const modifierTarget = modifier.target
        ? normalizeSkillName(modifier.target) || normalizeLookupKey(modifier.target)
        : null;

      return Boolean(
        modifierTarget &&
          (modifierTarget === normalizedSkill || modifierTarget === normalizedCheck),
      );
    });
};

export const resolveCheckSetup = (
  skill: string,
  abilities: Abilities,
  proficiencies: string[],
  level: number,
  options: CheckContextOptions = {},
): CheckSetup => {
  const { abilityKey, proficiencySkill } = resolveCheckSource(skill);
  const abilityModifier = calculateModifier(abilities[abilityKey]);
  const normalizedProficiencies = new Set(
    proficiencies.map((item) => normalizeSkillName(item)).filter(Boolean),
  );
  const proficiencyApplied = Boolean(
    proficiencySkill && normalizedProficiencies.has(proficiencySkill),
  );
  const proficiencyBonus = proficiencyApplied
    ? calculateProficiencyBonus(level)
    : 0;
  const situationalModifiers = resolveAppliedCheckModifiers(
    skill,
    abilityKey,
    options.checkModifiers || [],
  );

  const parts: CheckBreakdownPart[] = [
    {
      kind: "ability_modifier",
      label: `${ABILITY_LABELS[abilityKey]}调整值`,
      value: abilityModifier,
    },
  ];

  if (proficiencyApplied) {
    parts.push({
      kind: "proficiency_bonus",
      label: "熟练加值",
      value: proficiencyBonus,
    });
  }

  situationalModifiers.forEach((modifier) => {
    parts.push({
      kind: "situational_modifier",
      label: modifier.label,
      value: modifier.value,
    });
  });

  const staticModifierTotal = parts.reduce((sum, part) => sum + part.value, 0);

  return {
    abilityKey,
    abilityLabel: ABILITY_LABELS[abilityKey],
    abilityModifier,
    proficiencyApplied,
    proficiencyBonus,
    situationalModifiers,
    staticModifierTotal,
    parts,
    previewExpression: formatCheckExpression(null, parts),
  };
};

/**
 * 处理 @CHECK(Skill:DC) 的核心逻辑
 * @param roll D20 原始值
 * @param skill 技能名（如 "Perception" 或 "Athletics"）
 * @param abilities 角色属性
 * @param proficiencies 熟练列表
 * @param level 等级
 */
export const calculateCheckResult = (
  roll: number,
  skill: string,
  abilities: Abilities,
  proficiencies: string[],
  level: number,
  options: CheckContextOptions = {},
): CheckResult => {
  const setup = resolveCheckSetup(
    skill,
    abilities,
    proficiencies,
    level,
    options,
  );

  return {
    total: roll + setup.staticModifierTotal,
    rollSignal: roll >= 19 ? "high" : roll <= 1 ? "low" : "normal",
    breakdown: {
      ...setup,
      baseRoll: roll,
      expression: formatCheckExpression(
        roll,
        setup.parts,
        roll + setup.staticModifierTotal,
      ),
    },
  };
};
