import { Dices } from 'lucide-react'
import { getCheckPreview } from '../../checkResolution'

function getCheckReasonLabel(reason) {
  return reason || 'DM 未提供额外判定说明。'
}

export function SingleCheckPanel({
  character,
  pendingCheck,
  inputValue,
  setInputValue,
  isThinking,
  isInputComposing,
  setIsInputComposing,
  handleRollCheck,
}) {
  const preview = getCheckPreview(character, pendingCheck)

  return (
    <div className="space-y-3">
      <div className="rounded border border-primary-500/40 bg-surface/70 px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary-400">
          检定等待中
        </div>
        <p className="mt-2 text-sm text-parchment-100">
          当前检定：<span className="font-semibold">{pendingCheck.skill}</span> / DC {pendingCheck.dc}
        </p>
        <p className="mt-2 text-sm text-parchment-300">
          判定依据：{getCheckReasonLabel(pendingCheck.reason)}
        </p>
        <div className="mt-3 rounded border border-parchment-800/70 bg-background/30 px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.22em] text-parchment-500">
            投骰拆解
          </div>
          <p className="mt-2 font-mono text-sm text-parchment-100">{preview.previewExpression}</p>
          <ul className="mt-3 space-y-1 text-xs text-parchment-400">
            <li>基础投掷：1d20</li>
            {preview.parts.map((part) => (
              <li key={`${part.kind}-${part.label}`}>
                {part.label}：{part.value >= 0 ? `+${part.value}` : part.value}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-parchment-500">{preview.criticalRule}</p>
        </div>
        <p className="mt-2 text-sm text-parchment-300">
          你可以先补充动作、姿态或尝试方式，再一起掷骰。
        </p>
      </div>
      <div className="rounded border border-parchment-800 bg-surface shadow-[0_15px_30px_rgba(0,0,0,0.5)]">
        <textarea
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onCompositionStart={() => setIsInputComposing(true)}
          onCompositionEnd={() => setIsInputComposing(false)}
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key === 'Enter' &&
              !isInputComposing &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              handleRollCheck(pendingCheck, inputValue)
            }
          }}
          placeholder="可选：描述你此刻如何观察、移动、试探或施压，然后再掷骰..."
          disabled={isThinking}
          rows={3}
          className="w-full resize-none bg-transparent border-none focus:ring-0 text-parchment-100 placeholder:text-parchment-700 text-base px-5 py-4"
        />
        <div className="flex items-center justify-between gap-3 border-t border-parchment-800/70 px-4 py-3">
          <span className="text-[11px] text-parchment-600">
            `Ctrl/Cmd + Enter` 也可以直接提交检定
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => handleRollCheck(pendingCheck)}
              disabled={isThinking}
              className="px-4 py-2 rounded border border-parchment-700 text-parchment-300 hover:border-parchment-500 transition-all disabled:opacity-50"
            >
              直接掷骰
            </button>
            <button
              onClick={() => handleRollCheck(pendingCheck, inputValue)}
              disabled={isThinking}
              className="flex items-center justify-center px-5 py-2 bg-gradient-to-r from-accent to-red-900 border border-primary-500 rounded text-background font-serif font-black tracking-widest shadow-[0_0_20px_rgba(255,59,48,0.25)] transition-all hover:scale-[1.02] active:scale-95 group disabled:opacity-50"
            >
              <Dices size={20} className="mr-2 group-hover:animate-bounce" />
              描述并掷骰
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
