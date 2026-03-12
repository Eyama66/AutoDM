export function SessionStatePanel({
  isSessionCompleted,
  sessionEndReason,
  isTerminalLocked,
  isThinking,
  handleResetSession,
  handleResolveEndgame,
}) {
  if (isSessionCompleted) {
    return (
      <div className="rounded border border-primary-500/30 bg-surface/80 px-5 py-4 text-sm text-parchment-300 shadow-[0_15px_30px_rgba(0,0,0,0.5)]">
        <p>本局已经结束。当前会话已正式封盘，不再接受新的玩家输入。</p>
        {sessionEndReason && <p className="mt-2 text-parchment-500">结局判定：{sessionEndReason}</p>}
        <button
          onClick={handleResetSession}
          className="mt-4 rounded border border-primary-500/50 px-4 py-2 text-parchment-100 transition-all hover:border-primary-400 hover:bg-primary-500/10"
        >
          重新开局
        </button>
      </div>
    )
  }

  if (!isTerminalLocked) {
    return null
  }

  return (
    <div className="rounded border border-parchment-800 bg-surface/70 px-5 py-4 text-sm text-parchment-300 shadow-[0_15px_30px_rgba(0,0,0,0.5)]">
      <p>终局处理中。此时不需要你继续输入。</p>
      <p className="mt-2">如果 DM 还没完成裁定，点下面的按钮继续推动这次终局结算。</p>
      <button
        onClick={handleResolveEndgame}
        disabled={isThinking}
        className="mt-4 rounded border border-primary-500/50 px-4 py-2 text-parchment-100 transition-all hover:border-primary-400 hover:bg-primary-500/10 disabled:opacity-50"
      >
        继续结算
      </button>
    </div>
  )
}
