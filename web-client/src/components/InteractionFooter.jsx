import { Send } from 'lucide-react'
import clsx from 'clsx'

import { SessionStatePanel } from './interaction/SessionStatePanel'

function renderCombatTracker(initiativeOrder, characterId) {
  return (
    <div className="space-y-4">
      <div className="rounded border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-parchment-200">
        战斗进行中。继续用文字描述你的行动；如果 DM 要求检定，在下方面板里补充说明后掷骰即可。
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {initiativeOrder.map((creature) => (
          <div
            key={creature.id}
            className={clsx(
              'px-4 py-2 rounded border flex flex-col min-w-[120px]',
              creature.id === characterId
                ? 'border-primary-500 bg-primary-500/10'
                : 'border-parchment-800 bg-surface/40',
              creature.isDead && 'opacity-40 grayscale',
            )}
          >
            <span className="text-[10px] uppercase tracking-tighter text-parchment-500">
              先攻 {creature.initiative}
            </span>
            <span className="font-serif text-sm">{creature.name}</span>
            <span className="text-[9px] text-primary-400">
              HP: {creature.hp.current}/{creature.hp.max}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderDefaultInput({
  inputValue,
  setInputValue,
  isThinking,
  isCharacterDowned,
  hasPendingDiceAction,
  handleInputKeyDown,
  setIsInputComposing,
  handleSubmitInput,
}) {
  const isBlocked = isThinking || hasPendingDiceAction
  return (
    <div className={clsx(
      'flex items-center gap-4 bg-surface border rounded shadow-[0_15px_30px_rgba(0,0,0,0.5)] transition-all',
      isBlocked ? 'border-parchment-800/40 opacity-60' : 'border-parchment-800 focus-within:ring-1 focus-within:ring-primary-600/50',
    )}>
      <input
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onCompositionStart={() => setIsInputComposing(true)}
        onCompositionEnd={() => setIsInputComposing(false)}
        onKeyDown={handleInputKeyDown}
        placeholder={
          hasPendingDiceAction
            ? '请先在左侧面板完成检定...'
            : isThinking
              ? '深渊正在低语...'
              : isCharacterDowned
                ? '你已倒地，可描述求援、意识中的最后判断，或等待 DM 继续裁定...'
                : '通过言语或动作来改写命运...'
        }
        disabled={isBlocked}
        className={clsx(
          'flex-1 bg-transparent border-none focus:ring-0 text-parchment-100 placeholder:text-parchment-900 text-lg px-6 py-4',
          isThinking && 'animate-pulse',
        )}
      />
      <button
        onClick={handleSubmitInput}
        disabled={isBlocked}
        className={clsx(
          'p-4 transition-all transform active:scale-95',
          isBlocked
            ? 'bg-parchment-800 text-parchment-900'
            : 'bg-primary-600 hover:bg-primary-500 text-background rounded-r',
        )}
      >
        <Send
          size={22}
          strokeWidth={2.5}
          className={isThinking ? 'animate-spin' : ''}
        />
      </button>
    </div>
  )
}

export function InteractionFooter(props) {
  const {
    isCombatActive,
    initiativeOrder,
    characterId,
    isThinking,
    isCharacterDowned,
    isTerminalLocked,
    isSessionCompleted,
    sessionEndReason,
    rescueWindowOpen,
    hasPendingDiceAction,
    inputValue,
    setInputValue,
    setIsInputComposing,
    handleInputKeyDown,
    handleSubmitInput,
    handleResolveEndgame,
    handleResetSession,
  } = props

  return (
    <footer className="px-6 py-4">
      <div className="max-w-4xl mx-auto space-y-3">
        {isCharacterDowned && (
          <div className="rounded border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-parchment-200">
            {rescueWindowOpen
              ? '你当前 HP 已归零，但 DM 明确开放了一次救援窗口。只有当前这次检定仍可继续，其他普通输入仍然关闭。'
              : '你当前 HP 已归零，已进入终局裁定。系统不会再等待你的普通输入；接下来应由 DM 继续判断你是否彻底死亡，或是否仍有一线生机。'}
          </div>
        )}

        {isCombatActive && renderCombatTracker(initiativeOrder, characterId)}

        {isSessionCompleted || isTerminalLocked ? (
          <SessionStatePanel
            isSessionCompleted={isSessionCompleted}
            sessionEndReason={sessionEndReason}
            isTerminalLocked={isTerminalLocked}
            isThinking={isThinking}
            handleResetSession={handleResetSession}
            handleResolveEndgame={handleResolveEndgame}
          />
        ) : (
          renderDefaultInput({
            inputValue,
            setInputValue,
            isThinking,
            isCharacterDowned,
            hasPendingDiceAction,
            handleInputKeyDown,
            setIsInputComposing,
            handleSubmitInput,
          })
        )}
      </div>
    </footer>
  )
}
