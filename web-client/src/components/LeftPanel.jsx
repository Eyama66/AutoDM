import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Dices, Shield, X } from 'lucide-react'
import clsx from 'clsx'
import { calculateModifier } from '@core/rules/CoreRules'
import { CheckSetPanel } from './interaction/CheckSetPanel'
import { FormulaRollPanel } from './interaction/FormulaRollPanel'
import { SingleCheckPanel } from './interaction/SingleCheckPanel'

const PANEL_WIDTH = 272
const MotionDiv = motion.div

// ─── Character Modal ──────────────────────────────────────────────────────────

function AbilityBlock({ label, val }) {
  const mod = calculateModifier(val)
  return (
    <div className="border border-parchment-800/50 rounded p-2 text-center">
      <div className="text-[9px] text-parchment-700 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-lg font-serif text-parchment-100">{val}</div>
      <div className={clsx('text-sm font-mono', mod >= 0 ? 'text-primary-400' : 'text-accent')}>
        {mod >= 0 ? `+${mod}` : mod}
      </div>
    </div>
  )
}

function CharacterModal({ character, onClose }) {
  const inventory = character.inventory || []
  const equipped = inventory.filter((i) => i.equipped)
  const unequipped = inventory.filter((i) => !i.equipped)
  const proficientSkills = character.proficiencies?.skills || []
  const conditions = character.conditions || []
  const hpPct = character.hp.max > 0 ? (character.hp.current / character.hp.max) * 100 : 0
  const hpLow = hpPct < 30

  return createPortal(
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <MotionDiv
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[80vh] overflow-y-auto scrollbar-hide bg-surface border border-parchment-800/60 rounded-lg shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-surface border-b border-parchment-800/40">
          <div className="flex items-center gap-3">
            <Shield size={16} className="text-primary-400 flex-shrink-0" />
            <div>
              <div className="text-base font-serif text-parchment-100">{character.name}</div>
              <div className="text-[11px] text-parchment-600 uppercase tracking-wider">
                {character.race} {character.class} · Lv.{character.level}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-parchment-800/20 rounded transition-colors"
          >
            <X size={16} className="text-parchment-500" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* HP + Combat stats */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs uppercase tracking-widest mb-1">
              <span className="text-parchment-700">HP</span>
              <span className={hpLow ? 'text-accent' : 'text-parchment-500'}>
                {character.hp.current} / {character.hp.max}
                {character.hp.temp > 0 && (
                  <span className="text-parchment-700"> (+{character.hp.temp} 临时)</span>
                )}
              </span>
            </div>
            <div className="h-2 bg-background/60 rounded-full overflow-hidden">
              <MotionDiv
                animate={{ width: `${Math.max(0, Math.min(100, hpPct))}%` }}
                transition={{ duration: 0.4 }}
                className={clsx('h-full rounded-full', hpLow ? 'bg-accent' : 'bg-primary-500')}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                ['AC', character.ac],
                ['熟练', `+${character.proficiencyBonus}`],
                [
                  '先攻',
                  (calculateModifier(character.abilities.dex) >= 0 ? '+' : '') +
                    calculateModifier(character.abilities.dex),
                ],
              ].map(([label, val]) => (
                <div key={label} className="border border-parchment-800/40 rounded px-2 py-2 text-center">
                  <div className="text-[9px] text-parchment-700 uppercase tracking-wider">{label}</div>
                  <div className="text-lg font-mono text-parchment-100">{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Active conditions */}
          {conditions.length > 0 && (
            <div>
              <div className="text-[10px] text-parchment-700 uppercase tracking-widest mb-2">当前状态</div>
              <div className="flex flex-wrap gap-1.5">
                {conditions.map((c) => (
                  <span
                    key={c}
                    className="text-xs px-2 py-0.5 rounded border border-accent/50 bg-accent/10 text-accent/80"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ability scores */}
          <div>
            <div className="text-[10px] text-parchment-700 uppercase tracking-widest mb-2">属性值</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['力量', 'str'],
                ['敏捷', 'dex'],
                ['体质', 'con'],
                ['智力', 'int'],
                ['感知', 'wis'],
                ['魅力', 'cha'],
              ].map(([label, key]) => (
                <AbilityBlock key={key} label={label} val={character.abilities[key]} />
              ))}
            </div>
          </div>

          {/* Proficient skills */}
          {proficientSkills.length > 0 && (
            <div>
              <div className="text-[10px] text-parchment-700 uppercase tracking-widest mb-2">擅长技能</div>
              <div className="flex flex-wrap gap-1.5">
                {proficientSkills.map((skill) => (
                  <span
                    key={skill}
                    className="text-xs px-2 py-0.5 border border-parchment-800/50 rounded text-parchment-400"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Equipped items */}
          {equipped.length > 0 && (
            <div>
              <div className="text-[10px] text-parchment-700 uppercase tracking-widest mb-2">已装备</div>
              <div className="space-y-1.5">
                {equipped.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-sm px-2 py-1.5 bg-parchment-800/10 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-500 flex-shrink-0" />
                      <span className="text-parchment-200">{item.name}</span>
                    </div>
                    {item.quantity > 1 && (
                      <span className="text-xs text-parchment-600">×{item.quantity}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Backpack */}
          {unequipped.length > 0 && (
            <div>
              <div className="text-[10px] text-parchment-700 uppercase tracking-widest mb-2">背包</div>
              <div className="space-y-1">
                {unequipped.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-sm px-2 py-1 text-parchment-500"
                  >
                    <span>{item.name}</span>
                    {item.quantity > 1 && (
                      <span className="text-xs text-parchment-700">×{item.quantity}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </MotionDiv>
    </MotionDiv>,
    document.body,
  )
}

// ─── Character Card ──────────────────────────────────────────────────────────

function HpBar({ current, max }) {
  const pct = max > 0 ? (current / max) * 100 : 0
  const low = pct < 30
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-parchment-700 uppercase tracking-widest">HP</span>
        <span className={low ? 'text-accent' : 'text-parchment-500'}>
          {current} / {max}
        </span>
      </div>
      <div className="h-1.5 bg-background/60 rounded-full overflow-hidden">
        <MotionDiv
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4 }}
          className={clsx('h-full rounded-full', low ? 'bg-accent' : 'bg-primary-500')}
        />
      </div>
    </div>
  )
}

function CharacterCard({ character, onOpenModal }) {
  const conditions = character.conditions || []
  return (
    <button
      onClick={onOpenModal}
      className="w-full bg-surface/80 border border-parchment-800/40 rounded backdrop-blur-sm overflow-hidden text-left hover:border-parchment-700/60 hover:bg-surface/90 transition-all"
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Shield size={14} className="text-primary-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-serif text-parchment-100 truncate">{character.name}</div>
          <div className="text-[10px] text-parchment-600 uppercase tracking-wider">
            {character.race} {character.class} · Lv.{character.level}
          </div>
        </div>
        <span className="text-[10px] text-parchment-700">详情</span>
      </div>
      <div className="px-3 pb-2.5 space-y-2">
        <HpBar current={character.hp.current} max={character.hp.max} />
        {conditions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {conditions.map((c) => (
              <span
                key={c}
                className="text-[10px] px-1.5 py-0.5 rounded border border-accent/50 bg-accent/10 text-accent/80"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Dice Section ─────────────────────────────────────────────────────────────

function DiceIdle() {
  return (
    <div className="border border-parchment-800/20 rounded px-3 py-2.5 flex items-center gap-2.5 opacity-40">
      <Dices size={13} className="text-parchment-700" />
      <span className="text-[10px] text-parchment-700 uppercase tracking-widest">无待处理检定</span>
    </div>
  )
}

function DiceActive({
  character,
  isThinking,
  pendingCheck,
  pendingCheckSet,
  pendingFormulaRoll,
  pendingRollAction,
  inputValue,
  setInputValue,
  isInputComposing,
  setIsInputComposing,
  handleRollCheck,
  handleRollCheckSet,
  handleFormulaRoll,
}) {
  return (
    <div className="border border-primary-500/30 rounded bg-surface/60 backdrop-blur-sm shadow-[0_0_24px_rgba(255,59,48,0.08)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-primary-500/20">
        <Dices size={13} className="text-primary-400" />
        <span className="text-[10px] text-primary-400 uppercase tracking-widest">检定待处理</span>
      </div>
      <div className="p-3">
        {pendingCheckSet ? (
          <CheckSetPanel
            character={character}
            pendingCheckSet={pendingCheckSet}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isThinking={isThinking}
            isInputComposing={isInputComposing}
            setIsInputComposing={setIsInputComposing}
            handleRollCheckSet={handleRollCheckSet}
          />
        ) : pendingCheck ? (
          <SingleCheckPanel
            character={character}
            pendingCheck={pendingCheck}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isThinking={isThinking}
            isInputComposing={isInputComposing}
            setIsInputComposing={setIsInputComposing}
            handleRollCheck={handleRollCheck}
          />
        ) : (
          <FormulaRollPanel
            pendingFormulaRoll={pendingFormulaRoll}
            pendingRollAction={pendingRollAction}
            isThinking={isThinking}
            handleFormulaRoll={handleFormulaRoll}
          />
        )}
      </div>
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function LeftPanel({
  character,
  isThinking,
  pendingCheck,
  pendingCheckSet,
  pendingFormulaRoll,
  pendingRollAction,
  inputValue,
  setInputValue,
  isInputComposing,
  setIsInputComposing,
  handleRollCheck,
  handleRollCheckSet,
  handleFormulaRoll,
}) {
  const [showModal, setShowModal] = useState(false)
  const hasPending = !!(pendingCheck || pendingCheckSet || pendingFormulaRoll)

  return (
    <>
      <aside
        className="relative z-20 flex h-full flex-col gap-3 p-3 border-r border-parchment-800/30 bg-surface/30 overflow-y-auto scrollbar-hide"
        style={{ width: PANEL_WIDTH, flexShrink: 0 }}
      >
        <CharacterCard character={character} onOpenModal={() => setShowModal(true)} />

        {hasPending ? (
          <DiceActive
            character={character}
            isThinking={isThinking}
            pendingCheck={pendingCheck}
            pendingCheckSet={pendingCheckSet}
            pendingFormulaRoll={pendingFormulaRoll}
            pendingRollAction={pendingRollAction}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isInputComposing={isInputComposing}
            setIsInputComposing={setIsInputComposing}
            handleRollCheck={handleRollCheck}
            handleRollCheckSet={handleRollCheckSet}
            handleFormulaRoll={handleFormulaRoll}
          />
        ) : (
          <DiceIdle />
        )}
      </aside>

      <AnimatePresence>
        {showModal && (
          <CharacterModal character={character} onClose={() => setShowModal(false)} />
        )}
      </AnimatePresence>
    </>
  )
}
