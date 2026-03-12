export function summarizeInventory(inventory, options = {}) {
  const { equippedOnly = false } = options
  const items = Array.isArray(inventory) ? inventory : []

  const filteredItems = items.filter((item) => {
    if (equippedOnly) {
      return Boolean(item?.equipped)
    }

    return true
  })

  const summary = filteredItems
    .map((item) => {
      if (!item?.name) {
        return null
      }

      const quantityLabel = item.quantity > 1 ? ` x${item.quantity}` : ''
      const stateLabel = item.equipped ? '已装备' : '携带中'
      return `${item.name}${quantityLabel}（${item.type || '未知类型'}，${stateLabel}）`
    })
    .filter(Boolean)
    .join('；')

  return summary || '无'
}

export function summarizeNpcDmNotes(npcs) {
  return (Array.isArray(npcs) ? npcs : [])
    .map((npc) => npc?.dmNotes)
    .filter(Boolean)
}
