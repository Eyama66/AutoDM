import { Dices } from 'lucide-react'
import { getCheckPreview } from '../../checkResolution'

function getCheckReasonLabel(reason) {
  return reason || 'DM 未提供额外判定说明。'
}

function renderCheckCard(character, check, actionNode) {
  const preview = getCheckPreview(character, check)

  return (
    <div
      key={`${check.skill}-${check.dc}-${check.reason}`}
      className="rounded border border-parchment-800/80 bg-background/40 px-4 py-3"
    >
      <div className="text-sm font-semibold text-parchment-100">
        {check.skill} / DC {check.dc}
      </div>
      <p className="mt-2 text-sm text-parchment-300">
        判定依据：{getCheckReasonLabel(check.reason)}
      </p>
      <div className="mt-3 rounded border border-parchment-800/70 bg-background/30 px-3 py-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-parchment-500">
          投骰拆解
        </div>
        <p className="mt-2 font-mono text-sm text-parchment-100">{preview.previewExpression}</p>
        <ul className="mt-3 space-y-1 text-xs text-parchment-400">
          <li>基础投掷：1d20</li>
          {preview.parts.map((part) => (
            <li key={`${check.skill}-${part.kind}-${part.label}`}>
              {part.label}：{part.value >= 0 ? `+${part.value}` : part.value}
            </li>
          ))}
        </ul>
      </div>
      {actionNode}
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

  return (
    <div className="space-y-3">
      <div className="rounded border border-primary-500/40 bg-surface/70 px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.25em] text-primary-400">
          {isChooseOne ? '检定组等待中' : '多重检定等待中'}
        </div>
        <p className="mt-2 text-sm text-parchment-100">{pendingCheckSet.label}</p>
        <p className="mt-2 text-sm text-parchment-300">
          {pendingCheckSet.explanation ||
            (isChooseOne
              ? 'DM 要求你从下列几种解法中选择一种来结算。'
              : '这组检定需要全部结算，系统会把成功与失败一并交回给 DM。')}
        </p>
        <p className="mt-2 text-xs text-parchment-500">
          普通检定只按总值是否达到 DC 结算。原始 d20 点数会一并记录，但不会自动变成大成功或大失败。
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
              !isChooseOne &&
              (event.metaKey || event.ctrlKey) &&
              event.key === 'Enter' &&
              !isInputComposing &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              handleRollCheckSet(pendingCheckSet, null, inputValue)
            }
          }}
          placeholder={
            isChooseOne
              ? '可选：先补充你准备如何尝试，然后从下方选一种解法来掷骰...'
              : '可选：先补充你这次整体怎么做，系统会一次结算下面所有检定...'
          }
          disabled={isThinking}
          rows={3}
          className="w-full resize-none bg-transparent border-none focus:ring-0 text-parchment-100 placeholder:text-parchment-700 text-base px-5 py-4"
        />
        <div className="space-y-3 border-t border-parchment-800/70 px-4 py-4">
          {pendingCheckSet.checks.map((check) =>
            renderCheckCard(
              character,
              check,
              isChooseOne ? (
                <button
                  onClick={() => handleRollCheckSet(pendingCheckSet, check, inputValue)}
                  disabled={isThinking}
                  className="mt-3 rounded border border-primary-500/50 px-4 py-2 text-parchment-100 transition-all hover:border-primary-400 hover:bg-primary-500/10 disabled:opacity-50"
                >
                  用 {check.skill} 掷骰
                </button>
              ) : null,
            ),
          )}
        </div>
        {!isChooseOne && (
          <div className="flex items-center justify-between gap-3 border-t border-parchment-800/70 px-4 py-3">
            <span className="text-[11px] text-parchment-600">
              `Ctrl/Cmd + Enter` 也可以直接结算整组检定
            </span>
            <button
              onClick={() => handleRollCheckSet(pendingCheckSet, null, inputValue)}
              disabled={isThinking}
              className="flex items-center justify-center px-5 py-2 bg-gradient-to-r from-accent to-red-900 border border-primary-500 rounded text-background font-serif font-black tracking-widest shadow-[0_0_20px_rgba(255,59,48,0.25)] transition-all hover:scale-[1.02] active:scale-95 group disabled:opacity-50"
            >
              <Dices size={20} className="mr-2 group-hover:animate-bounce" />
              结算全部检定
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
