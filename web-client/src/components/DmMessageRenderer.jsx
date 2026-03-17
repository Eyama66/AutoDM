import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Lightbulb, MessageSquareQuote } from 'lucide-react'
import clsx from 'clsx'
import { parseAIResponse } from '@core/ai/AIResponseParser'

const MotionDiv = motion.div

const NarrationBlock = ({ content, isFirst }) => (
  <div
    className="chat-bubble-dm dm-narration select-text selection:bg-primary-500/40"
    data-testid="dm-narration"
  >
    <p className={clsx('whitespace-pre-wrap', isFirst && 'drop-cap')}>{content}</p>
  </div>
)

const DialogueBubble = ({ speaker, content }) => (
  <div className="dm-dialogue" data-testid="dm-dialogue">
    <div className="dm-dialogue__avatar">
      <MessageSquareQuote size={14} className="text-primary-400" />
    </div>
    <div className="dm-dialogue__body">
      <span className="dm-dialogue__speaker" data-testid="dm-dialogue-speaker">
        {speaker}
      </span>
      <div className="dm-dialogue__bubble" data-testid="dm-dialogue-bubble">
        <p className="dm-dialogue__content">
          {content}
        </p>
        <div className="dm-dialogue__pointer" />
      </div>
    </div>
  </div>
)

const HintBlock = ({ content }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-6 mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-sm text-[11px] font-mono uppercase tracking-widest transition-all',
          isOpen
            ? 'bg-primary/10 text-primary-400 border border-primary/30'
            : 'text-parchment-700 hover:text-parchment-500 border border-parchment-800/40 hover:border-parchment-700/60',
        )}
      >
        <Lightbulb size={13} />
        <span>提示 / Hints</span>
        <ChevronDown
          size={13}
          className={clsx('transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <MotionDiv
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-4 border-l border-parchment-800/30 text-parchment-600 text-sm leading-relaxed whitespace-pre-wrap">
              {content}
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  )
}

export const DmMessageRenderer = ({ content }) => {
  const { renderEnvelope } = parseAIResponse(content)
  const segments = renderEnvelope.narrative.segments
  const firstNarrationIndex = segments.findIndex((segment) => segment.type === 'narration')

  return (
    <div
      className="dm-message-stack w-full select-text selection:bg-primary-500/40"
      data-testid="dm-message-renderer"
    >
      {segments.map((segment, index) => {
        switch (segment.type) {
          case 'narration': {
            const isFirst = index === firstNarrationIndex
            return <NarrationBlock key={index} content={segment.content} isFirst={isFirst} />
          }
          case 'dialogue':
            return <DialogueBubble key={index} speaker={segment.speaker} content={segment.content} />
          case 'hint':
            return <HintBlock key={index} content={segment.content} />
          default:
            return null
        }
      })}
    </div>
  )
}
