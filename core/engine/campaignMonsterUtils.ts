export function cloneMonsterInstance(
  monster: any,
  requestedId: string,
  index: number,
): any {
  const clonedMonster = JSON.parse(JSON.stringify(monster));
  clonedMonster.id = `${monster.id}__${index + 1}`;
  clonedMonster.templateId = monster.id;
  clonedMonster.requestedId = requestedId;
  return clonedMonster;
}

export function resolveMonsterDefinition(
  monsterLibrary: any[],
  id: string,
): any | undefined {
  const singularId = id.endsWith("s") ? id.slice(0, -1) : id;
  return (
    monsterLibrary.find((monster) => monster.id === id) ||
    monsterLibrary.find((monster) => monster.id === singularId)
  );
}

export function hasMonsterDefinition(monsterLibrary: any[], id: string): boolean {
  return !!resolveMonsterDefinition(monsterLibrary, id);
}

export function fetchMonsters(monsterLibrary: any[], ids: string[]): any[] {
  return ids.map((id, index) => {
    const trimmedId = id.trim();
    const monster = resolveMonsterDefinition(monsterLibrary, trimmedId);

    if (!monster) {
      console.warn(`[Campaign] 找不到怪物数据: ${id}`);
      return {
        id: `${trimmedId || "unknown"}__${index + 1}`,
        name: "未知生物",
        hp: { current: 10, max: 10 },
        ac: 10,
        attacks: [],
      };
    }

    return cloneMonsterInstance(monster, trimmedId, index);
  });
}
