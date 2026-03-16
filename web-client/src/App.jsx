import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import { DmMessageRenderer } from './components/DmMessageRenderer'
import { InteractionFooter } from './components/InteractionFooter'
import { LeftPanel } from './components/LeftPanel'
import { NavSidebar } from './components/NavSidebar'
import { UserMessageBubble } from './components/UserMessageBubble'
import {
  buildCheckDisplayLabel,
  buildCheckSetDisplayLabel,
  resolveCheckOutcome,
} from './checkResolution'
import {
  aiEngine,
  buildDefaultGameState,
  buildPromptContext,
  campaign,
  clearPersistedSession,
  cloneData,
  getAreaById,
  INITIAL_DM_MESSAGE,
  initialSession,
  manifest,
  persistSession,
} from './gameRuntime'
import {
  MESSAGE_SOURCE,
  buildAiTransportMessage,
  buildEngineActionTags,
  buildSceneIntentOptions,
  buildSessionUiState,
  buildSystemTurnResolutionPrompt,
  deriveSystemActionFromNarrative,
  parseCheckAction,
  parseRollAction,
  resolveTurnIntent,
  rollFormula,
  serializeEngineActions,
  stripResolvedActionTags,
} from './gameUiUtils'
import {
  buildEndgameResolutionPrompt,
  buildSystemCheckResultPrompt,
  buildSystemCheckSetResultPrompt,
  buildSystemRollResultPrompt,
} from './systemResultPrompts'
import { CharacterManager } from '@core/engine/CharacterManager'

const MotionDiv = motion.div

function buildLoggedPlayerMessage(content) {
  return {
    id: Date.now() + Math.random(),
    role: 'user',
    content,
    meta: { source: MESSAGE_SOURCE.PLAYER },
  }
}

function buildLiveSceneContext() {
  const state = campaign.getState()
  const currentArea = campaign.getCurrentAreaData()
  const currentLocation = currentArea?.locations?.find(
    (location) => location.id === state.currentLocationId,
  )

  return {
    state,
    currentArea,
    currentLocation,
    context: buildPromptContext(state, currentArea, currentLocation),
  }
}

function buildLiveRuntimeSnapshot(messages, isThinking) {
  const liveScene = buildLiveSceneContext()

  return {
    ...liveScene,
    sessionUiState: buildSessionUiState(liveScene.state, messages, isThinking),
  }
}

const App = () => {
  const [messages, setMessages] = useState(initialSession.messages)
  const [inputValue, setInputValue] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [character, setCharacter] = useState(initialSession.gameState.characterSheet)
  const [isCombatActive, setIsCombatActive] = useState(initialSession.gameState.isCombatActive)
  const [isThinking, setIsThinking] = useState(false)
  const [isInputComposing, setIsInputComposing] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (character) {
      void CharacterManager.saveCharacter(character)
    }
  }, [character])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    persistSession(messages, campaign.getState())
  }, [messages, character, isCombatActive])

  const handleSubmitInput = () => {
    handleSend()
  }

  const resetSession = () => {
    clearPersistedSession()

    const nextState = buildDefaultGameState({ ignoreSaved: true })
    campaign.replaceState(nextState)
    campaign.initialize(manifest, getAreaById(nextState.currentAreaId))

    setMessages([INITIAL_DM_MESSAGE])
    setInputValue('')
    setCharacter(cloneData(nextState.characterSheet))
    setIsCombatActive(nextState.isCombatActive)
    setIsThinking(false)
    setIsInputComposing(false)
  }

  const handleInputKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || isInputComposing || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    handleSubmitInput()
  }

  const handleSend = async (
    overrideInput = null,
    displayMsg = null,
    messageMeta = null,
    options = {},
  ) => {
    const prependedMessages = Array.isArray(options.prependedMessages)
      ? options.prependedMessages
      : []
    const liveState = campaign.getState()
    const isSystemMessage =
      messageMeta?.source === MESSAGE_SOURCE.SYSTEM_CHECK ||
      messageMeta?.source === MESSAGE_SOURCE.SYSTEM_ROLL ||
      messageMeta?.source === MESSAGE_SOURCE.SYSTEM_DIRECTIVE
    const resolvedActionTags = Array.isArray(messageMeta?.resolvedActionTags)
      ? messageMeta.resolvedActionTags.filter(Boolean)
      : []
    const isTerminalLocked =
      liveState.phase === 'endgame' && liveState.variables?.last_chance_available !== true
    const isSessionCompleted = liveState.phase === 'completed'

    const textToSend = overrideInput || inputValue
    if (!textToSend.trim() || isThinking || ((isTerminalLocked || isSessionCompleted) && !isSystemMessage)) return

    const textToDisplay = displayMsg || textToSend
    const outgoingMeta = messageMeta || { source: MESSAGE_SOURCE.PLAYER }
    const shouldLogInput = outgoingMeta.hiddenFromLog !== true
    const userMsg = shouldLogInput
      ? {
          id: Date.now(),
          role: 'user',
          content: textToDisplay,
          meta: outgoingMeta,
        }
      : null
    if (prependedMessages.length || userMsg) {
      setMessages((prev) => [
        ...prev,
        ...prependedMessages,
        ...(userMsg ? [userMsg] : []),
      ])
    }

    if (!overrideInput) {
      setInputValue('')
    }

    setIsThinking(true)

    try {
      const { context } = buildLiveSceneContext()
      const aiHistory = [...messages, ...prependedMessages].map(buildAiTransportMessage)
      const aiInput =
        messageMeta?.source === MESSAGE_SOURCE.SYSTEM_CHECK ||
        messageMeta?.source === MESSAGE_SOURCE.SYSTEM_ROLL ||
        messageMeta?.source === MESSAGE_SOURCE.SYSTEM_DIRECTIVE
          ? textToSend
          : userMsg
            ? buildAiTransportMessage(userMsg).content
            : textToSend
      const aiInputRole =
        messageMeta?.source === MESSAGE_SOURCE.SYSTEM_CHECK ||
        messageMeta?.source === MESSAGE_SOURCE.SYSTEM_ROLL ||
        messageMeta?.source === MESSAGE_SOURCE.SYSTEM_DIRECTIVE
          ? 'system'
          : 'user'
      const rawAiResponse = await aiEngine.generateStrictResponse(aiInput, context, aiHistory, {
        inputRole: aiInputRole,
      })
      const effectiveAiResponse = stripResolvedActionTags(rawAiResponse, resolvedActionTags)
      const processedResult = campaign.processAiResponse(effectiveAiResponse)
      const explicitActionTags = processedResult.validatedActions.map((action) => action.originalTag)
      const nextState = campaign.getState()
      const derivedSystemActionCandidate = deriveSystemActionFromNarrative(
        processedResult.cleanText,
        explicitActionTags,
      )
      const shouldSuppressDerivedAction =
        (derivedSystemActionCandidate?.startsWith('[@CHECK(') &&
          CharacterManager.isDowned(nextState.characterSheet) &&
          nextState.variables?.last_chance_available !== true) ||
        nextState.phase === 'completed'
      const derivedSystemAction =
        shouldSuppressDerivedAction ? null : derivedSystemActionCandidate
      const dmMsg = {
        id: Date.now() + 1,
        role: 'dm',
        content: processedResult.cleanText,
        actions: derivedSystemAction ? [...explicitActionTags, derivedSystemAction] : explicitActionTags,
      }

      setMessages((prev) => [...prev, dmMsg])

      setCharacter(cloneData(nextState.characterSheet))
      setIsCombatActive(nextState.isCombatActive)
    } catch (error) {
      console.error(error)
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'dm',
          content: '死寂笼罩了四周... (逻辑解析失败)',
          actions: [],
        },
      ])
    } finally {
      setIsThinking(false)
    }
  }

  const handleSceneIntent = async (intentOption) => {
    const { context, sessionUiState } = buildLiveRuntimeSnapshot(messages, isThinking)

    if (
      !intentOption ||
      isThinking ||
      isCombatActive ||
      sessionUiState.isTerminalLocked ||
      sessionUiState.isSessionCompleted ||
      sessionUiState.hasPendingDiceAction
    ) {
      return
    }

    const resolution = resolveTurnIntent(intentOption, context)
    const serializedActions = serializeEngineActions(resolution.engineActions)
    const resolvedActionTags = buildEngineActionTags(resolution.engineActions)

    if (serializedActions) {
      campaign.processAiResponse(serializedActions)
    }

    const { context: nextContext } = buildLiveSceneContext()
    const hiddenPrompt = buildSystemTurnResolutionPrompt(intentOption, resolution, nextContext)

    setInputValue('')
    await handleSend(
      hiddenPrompt,
      null,
      {
        source: MESSAGE_SOURCE.SYSTEM_DIRECTIVE,
        hiddenFromLog: true,
        aiContent: hiddenPrompt,
        resolvedActionTags,
      },
      {
        prependedMessages: [
          buildLoggedPlayerMessage(
            resolution.playerPrompt || intentOption.playerPrompt || intentOption.label,
          ),
        ],
      },
    )
  }

  const handleRollCheck = (pendingCheck, playerContext = '') => {
    const liveState = campaign.getState()
    const rescueWindowOpen = liveState.variables?.last_chance_available === true
    if (!pendingCheck || (CharacterManager.isDowned(character) && !rescueWindowOpen)) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'dm',
          content: '你的生命已归零，终局裁定已接管流程。除非 DM 明确开放一次救援窗口，否则你不需要继续输入。',
          actions: [],
        },
      ])
      return
    }

    const parsedCheck =
      typeof pendingCheck === 'string' ? parseCheckAction(pendingCheck) : pendingCheck
    if (!parsedCheck) {
      return
    }

    const outcome = resolveCheckOutcome(character, parsedCheck)
    campaign.applyCheckResult(outcome)
    const trimmedContext = playerContext.trim()
    const hiddenPrompt = buildSystemCheckResultPrompt(outcome, trimmedContext)
    const displayLabel = buildCheckDisplayLabel(character, outcome)
    const prependedMessages = trimmedContext ? [buildLoggedPlayerMessage(trimmedContext)] : []

    setInputValue('')
    handleSend(hiddenPrompt, displayLabel, {
      source: MESSAGE_SOURCE.SYSTEM_CHECK,
      aiContent: hiddenPrompt,
    }, { prependedMessages })
  }

  const handleRollCheckSet = (checkSet, selectedCheck = null, playerContext = '') => {
    const liveState = campaign.getState()
    const rescueWindowOpen = liveState.variables?.last_chance_available === true
    if (!checkSet || (CharacterManager.isDowned(character) && !rescueWindowOpen)) {
      return
    }

    const trimmedContext = playerContext.trim()
    const checksToResolve =
      checkSet.mode === 'choose_one'
        ? checkSet.checks
            .filter(
              (check) =>
                check.skill === selectedCheck?.skill &&
                check.dc === selectedCheck?.dc &&
                check.reason === selectedCheck?.reason,
            )
            .slice(0, 1)
        : checkSet.checks

    if (!checksToResolve.length) {
      return
    }

    const outcomes = checksToResolve.map((check) => resolveCheckOutcome(character, check))
    const hiddenPrompt = buildSystemCheckSetResultPrompt(checkSet, outcomes, trimmedContext)
    const displayLabel =
      checkSet.mode === 'choose_one'
        ? buildCheckDisplayLabel(character, outcomes[0])
        : buildCheckSetDisplayLabel(character, checkSet, outcomes)
    const prependedMessages = trimmedContext ? [buildLoggedPlayerMessage(trimmedContext)] : []

    setInputValue('')
    handleSend(hiddenPrompt, displayLabel, {
      source: MESSAGE_SOURCE.SYSTEM_CHECK,
      aiContent: hiddenPrompt,
    }, { prependedMessages })
  }

  const handleFormulaRoll = (actionTag) => {
    const parsedAction = parseRollAction(actionTag)
    if (!parsedAction) {
      return
    }

    const rollResult = rollFormula(parsedAction.formula, character)
    if (!rollResult) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'dm',
          content: `系统未能解析这次掷骰公式：${parsedAction.formula}`,
          actions: [],
        },
      ])
      return
    }

    const hiddenPrompt = buildSystemRollResultPrompt(parsedAction, rollResult)
    const displayLabel = `🎲 ${parsedAction.label} 掷出 ${rollResult.total} (${rollResult.breakdown})`

    setInputValue('')
    handleSend(hiddenPrompt, displayLabel, {
      source: MESSAGE_SOURCE.SYSTEM_ROLL,
      aiContent: hiddenPrompt,
    })
  }

  const handleResolveEndgame = () => {
    const liveState = campaign.getState()
    const isPendingEndgame =
      liveState.phase === 'endgame' && liveState.variables?.last_chance_available !== true

    if (!isPendingEndgame || isThinking) {
      return
    }

    const hiddenPrompt = buildEndgameResolutionPrompt()

    void handleSend(hiddenPrompt, null, {
      source: MESSAGE_SOURCE.SYSTEM_DIRECTIVE,
      hiddenFromLog: true,
    })
  }

  const {
    state: currentState,
    currentArea,
    currentLocation,
    sessionUiState,
  } = buildLiveRuntimeSnapshot(messages, isThinking)
  const sceneIntentOptions = buildSceneIntentOptions(
    buildPromptContext(currentState, currentArea, currentLocation),
  )

  return (
    <div
      className="game-shell relative flex h-screen w-full overflow-hidden bg-background font-sans text-parchment-200"
      data-testid="game-shell"
    >
      <div className="absolute inset-0 bg-paper-texture opacity-10 pointer-events-none z-0" />

      <NavSidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />

      <LeftPanel
        character={character}
        isThinking={isThinking}
        pendingCheck={sessionUiState.pendingCheck}
        pendingCheckSet={sessionUiState.pendingCheckSet}
        pendingFormulaRoll={sessionUiState.pendingFormulaRoll}
        pendingRollAction={sessionUiState.pendingRollAction}
        inputValue={inputValue}
        setInputValue={setInputValue}
        isInputComposing={isInputComposing}
        setIsInputComposing={setIsInputComposing}
        handleRollCheck={handleRollCheck}
        handleRollCheckSet={handleRollCheckSet}
        handleFormulaRoll={handleFormulaRoll}
      />

      <main
        className="game-main relative z-10 flex h-full flex-1 flex-col bg-gradient-to-b from-background to-background/95"
        data-testid="game-main"
      >
        <header
          className="game-header flex h-16 items-center justify-between border-b border-parchment-800/20 px-8 backdrop-blur-sm"
          data-testid="game-header"
        >
          <div className="flex flex-col">
            <h1 className="text-xl font-serif font-black tracking-widest text-parchment-50">
              影子迷宫 //{' '}
              <span className="text-sm font-sans text-primary-500 italic opacity-80 uppercase tracking-tighter">
                Shadow Labyrinth
              </span>
            </h1>
            <span className="text-[10px] text-parchment-500 uppercase tracking-[0.25em]">
              {currentArea?.name || '未知区域'} / {currentLocation?.name || '未知地点'}
            </span>
          </div>
          <div className="flex gap-6 items-center">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] text-parchment-500 uppercase font-mono tracking-widest">
                第 32 日 // 傍晚
              </span>
            </div>
          </div>
        </header>

        <div
          className="scrollbar-hide flex-1 overflow-y-auto"
          data-testid="message-thread"
        >
          <div className="w-full max-w-4xl space-y-12 px-6 py-10 sm:px-12" data-testid="message-thread-inner">
            <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <MotionDiv
                  key={msg.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className={clsx(
                    'flex flex-col',
                    msg.role === 'dm' ? 'w-full' : 'items-end opacity-80',
                  )}
                  data-testid={msg.role === 'dm' ? 'message-row-dm' : 'message-row-user'}
                >
                  {msg.role === 'dm' ? (
                    <DmMessageRenderer content={msg.content} />
                  ) : (
                    <UserMessageBubble message={msg} />
                  )}
                </MotionDiv>
              ))}
            </AnimatePresence>
          </div>
          <div ref={chatEndRef} />
        </div>

        <InteractionFooter
          isCombatActive={isCombatActive}
          initiativeOrder={campaign.getCombatEngine().getInitiativeOrder()}
          characterId={character.id}
          isThinking={isThinking}
          isCharacterDowned={sessionUiState.isCharacterDowned}
          isTerminalLocked={sessionUiState.isTerminalLocked}
          isSessionCompleted={sessionUiState.isSessionCompleted}
          sessionEndReason={sessionUiState.sessionEndReason}
          rescueWindowOpen={sessionUiState.rescueWindowOpen}
          hasPendingDiceAction={sessionUiState.hasPendingDiceAction}
          inputValue={inputValue}
          setInputValue={setInputValue}
          isInputComposing={isInputComposing}
          setIsInputComposing={setIsInputComposing}
          handleInputKeyDown={handleInputKeyDown}
          handleSubmitInput={handleSubmitInput}
          handleSceneIntent={handleSceneIntent}
          handleResolveEndgame={handleResolveEndgame}
          handleResetSession={resetSession}
          sceneIntentOptions={sceneIntentOptions}
        />
      </main>

    </div>
  )
}

export default App
