import { Dices } from 'lucide-react'
import { getCheckPreview } from '../../checkResolution'

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
    <div className="space-y-2.5">
      {/* Reason — primary, most prominent */}
      {pendingCheck.reason && (
        <p className="text-sm text-parchment-200 leading-relaxed">
          {pendingCheck.reason}
        </p>
      )}

      {/* Skill + DC badge row */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-parchment-100 bg-parchment-800/40 px-2 py-0.5 rounded">
          {pendingCheck.skill}
        </span>
        <span className="text-[10px] text-parchment-500 uppercase tracking-wider">DC</span>
        <span className="text-sm font-mono text-primary-400 font-bold">{pendingCheck.dc}</span>
      </div>

      {/* Roll breakdown */}
      <div className="rounded border border-parchment-800/50 bg-background/20 px-3 py-2 space-y-1">
        <p className="font-mono text-sm text-parchment-100">{preview.previewExpression}</p>
        <div className="text-xs text-parchment-600 space-y-0.5">
          <div>基础：1d20</div>
          {preview.parts.map((part) => (
            <div key={`${part.kind}-${part.label}`}>
              {part.label}：{part.value >= 0 ? `+${part.value}` : part.value}
            </div>
          ))}
        </div>
        {preview.criticalRule && (
          <p className="text-[10px] text-parchment-700 pt-0.5">{preview.criticalRule}</p>
        )}
      </div>

      {/* Optional context textarea */}
      <div className="rounded border border-parchment-800/60 bg-surface/50">
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
          placeholder="可选：描述你的行动或姿态..."
          disabled={isThinking}
          rows={2}
          className="w-full resize-none bg-transparent border-none focus:ring-0 text-parchment-100 placeholder:text-parchment-800 text-sm px-3 py-2.5"
        />
        <div className="flex justify-end gap-2 border-t border-parchment-800/40 px-3 py-2">
          <button
            onClick={() => handleRollCheck(pendingCheck)}
            disabled={isThinking}
            className="px-3 py-1.5 rounded border border-parchment-700 text-xs text-parchment-300 hover:border-parchment-500 transition-all disabled:opacity-50"
          >
            直接掷骰
          </button>
          <button
            onClick={() => handleRollCheck(pendingCheck, inputValue)}
            disabled={isThinking}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-accent to-red-900 border border-primary-500 rounded text-background text-xs font-bold tracking-wider shadow-[0_0_16px_rgba(255,59,48,0.2)] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <Dices size={14} />
            掷骰
          </button>
        </div>
      </div>
    </div>
  )
}
