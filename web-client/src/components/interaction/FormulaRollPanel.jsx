import { Dices } from 'lucide-react'

export function FormulaRollPanel({
  pendingFormulaRoll,
  pendingRollAction,
  isThinking,
  handleFormulaRoll,
}) {
  return (
    <div className="space-y-3">
      <div className="rounded border border-primary-500/40 bg-surface/70 px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary-400">
          系统掷骰等待中
        </div>
        <p className="mt-2 text-sm text-parchment-300">
          这次需要结算 <span className="font-semibold text-parchment-100">{pendingFormulaRoll.label}</span>。
          系统会代掷 <span className="font-mono text-primary-400">{pendingFormulaRoll.formula}</span>，
          不接受手动报点数。
        </p>
      </div>
      <div className="rounded border border-parchment-800 bg-surface shadow-[0_15px_30px_rgba(0,0,0,0.5)]">
        <div className="px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-parchment-600">
            掷骰公式
          </div>
          <p className="mt-2 font-mono text-lg text-parchment-100">
            {pendingFormulaRoll.formula}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-parchment-800/70 px-4 py-3">
          <span className="text-[11px] text-parchment-600">
            命中后的伤害、治疗或其他数值骰都在这里由系统结算
          </span>
          <button
            onClick={() => handleFormulaRoll(pendingRollAction)}
            disabled={isThinking}
            className="flex items-center justify-center px-5 py-2 bg-gradient-to-r from-accent to-red-900 border border-primary-500 rounded text-background font-serif font-black tracking-widest shadow-[0_0_20px_rgba(255,59,48,0.25)] transition-all hover:scale-[1.02] active:scale-95 group disabled:opacity-50"
          >
            <Dices size={20} className="mr-2 group-hover:animate-bounce" />
            掷出 {pendingFormulaRoll.label}
          </button>
        </div>
      </div>
    </div>
  )
}
