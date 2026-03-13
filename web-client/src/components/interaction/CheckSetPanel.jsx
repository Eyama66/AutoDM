import { useState } from 'react'
import { Dices } from 'lucide-react'
import clsx from 'clsx'
import { getCheckPreview } from '../../checkResolution'

function CheckDetail({ character, check }) {
  const preview = getCheckPreview(character, check)
  return (
    <div className="space-y-2">
      {check.reason && (
        <p className="text-sm text-parchment-200 leading-relaxed">{check.reason}</p>
      )}
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
    </div>
  )
}

export function CheckSetPanel({
  character,
  pendingCheckSet,
  inputValue,
  setInputValue,
  isThinking,
  isInputComposing,
  setIsInputComposing,
  handleRollCheckSet,
}) {
  const isChooseOne = pendingCheckSet.mode === 'choose_one'
  const [selectedIdx, setSelectedIdx] = useState(0)
  const selectedCheck = pendingCheckSet.checks[selectedIdx]

  return (
    <div className="space-y-2.5">
      {/* Label + explanation */}
      {pendingCheckSet.label && (
        <p className="text-sm text-parchment-200 leading-relaxed">{pendingCheckSet.label}</p>
      )}
      {pendingCheckSet.explanation && (
        <p className="text-xs text-parchment-500">{pendingCheckSet.explanation}</p>
      )}

      {isChooseOne ? (
        <>
          {/* Tab buttons */}
          <div className="flex flex-wrap gap-1.5">
            {pendingCheckSet.checks.map((check, i) => (
              <button
                key={`${check.skill}-${i}`}
                onClick={() => setSelectedIdx(i)}
                className={clsx(
                  'px-2.5 py-1 rounded text-xs border transition-all',
                  selectedIdx === i
                    ? 'border-primary-500 text-primary-300 bg-primary-500/10'
                    : 'border-parchment-800/50 text-parchment-500 hover:border-parchment-600 hover:text-parchment-400',
                )}
              >
                {check.skill}
                <span className="ml-1.5 text-[10px] opacity-60">DC{check.dc}</span>
              </button>
            ))}
          </div>

          {/* Selected check detail */}
          <CheckDetail character={character} check={selectedCheck} />

          {/* Optional context textarea */}
          <div className="rounded border border-parchment-800/60 bg-surface/50">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onCompositionStart={() => setIsInputComposing(true)}
              onCompositionEnd={() => setIsInputComposing(false)}
              placeholder="可选：描述你的行动或姿态..."
              disabled={isThinking}
              rows={2}
              className="w-full resize-none bg-transparent border-none focus:ring-0 text-parchment-100 placeholder:text-parchment-800 text-sm px-3 py-2.5"
            />
            <div className="flex justify-end border-t border-parchment-800/40 px-3 py-2">
              <button
                onClick={() => handleRollCheckSet(pendingCheckSet, selectedCheck, inputValue)}
                disabled={isThinking}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-accent to-red-900 border border-primary-500 rounded text-background text-xs font-bold tracking-wider shadow-[0_0_16px_rgba(255,59,48,0.2)] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                <Dices size={14} />
                用 {selectedCheck.skill} 掷骰
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* All mode: compact check list */}
          <div className="space-y-1.5">
            {pendingCheckSet.checks.map((check, i) => (
              <CheckDetail key={`${check.skill}-${i}`} character={character} check={check} />
            ))}
          </div>

          {/* Textarea + roll all */}
          <div className="rounded border border-parchment-800/60 bg-surface/50">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onCompositionStart={() => setIsInputComposing(true)}
              onCompositionEnd={() => setIsInputComposing(false)}
              onKeyDown={(e) => {
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key === 'Enter' &&
                  !isInputComposing &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault()
                  handleRollCheckSet(pendingCheckSet, null, inputValue)
                }
              }}
              placeholder="可选：描述你的整体行动方式..."
              disabled={isThinking}
              rows={2}
              className="w-full resize-none bg-transparent border-none focus:ring-0 text-parchment-100 placeholder:text-parchment-800 text-sm px-3 py-2.5"
            />
            <div className="flex justify-end border-t border-parchment-800/40 px-3 py-2">
              <button
                onClick={() => handleRollCheckSet(pendingCheckSet, null, inputValue)}
                disabled={isThinking}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-accent to-red-900 border border-primary-500 rounded text-background text-xs font-bold tracking-wider shadow-[0_0_16px_rgba(255,59,48,0.2)] transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                <Dices size={14} />
                结算全部检定
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
