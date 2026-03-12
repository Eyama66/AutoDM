import { motion as Motion } from 'framer-motion'
import clsx from 'clsx'
import { calculateModifier } from '@core/rules/CoreRules'

const StatBox = ({ label, val, mod }) => (
  <div className="p-2 border border-parchment-800/50 rounded flex flex-col">
    <span className="text-[9px] text-parchment-700">{label}</span>
    <span className="text-sm font-serif text-parchment-200">
      {val}{' '}
      <span className="text-[10px] text-primary-500">({mod >= 0 ? `+${mod}` : mod})</span>
    </span>
  </div>
)

export const CharacterSidebar = ({ character }) => (
  <div className="fixed right-12 bottom-36 z-30 hidden xl:block w-80 bg-surface/90 border border-primary-500/20 rounded shadow-2xl backdrop-blur-xl overflow-hidden group">
    <div className="p-6">
      <div className="h-56 rounded bg-background/50 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1542385151-efd9000785a0?q=80&w=600"
          className="w-full h-full object-cover grayscale opacity-40 mix-blend-color-dodge transition-all duration-1000 group-hover:scale-105"
          alt="portrait"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
        <div className="absolute bottom-4 left-4">
          <h3 className="text-2xl font-serif font-black text-parchment-100 tracking-wider">
            {character.name}
          </h3>
          <p className="text-[10px] font-mono text-primary-500 tracking-tighter uppercase">
            {character.race} {character.class} | 等级 {character.level}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h4 className="text-[10px] text-parchment-700 font-bold uppercase tracking-widest mb-3">
          当前档案 ( Active Profile )
        </h4>
        <div className="space-y-2">
          <div className="w-full p-3 border border-primary-500 bg-primary-500/10 rounded text-left">
            <p className="text-sm font-serif text-parchment-200">{character.name}</p>
            <p className="text-[9px] text-parchment-600 uppercase">
              {character.race} {character.class} | Lv.{character.level}
            </p>
          </div>
          <div className="w-full p-3 border border-dashed border-parchment-800 rounded text-[10px] text-parchment-600 uppercase tracking-widest">
            当前故事进行中，暂不允许切换人物
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        <div className="flex justify-between text-[10px] text-parchment-600 font-bold uppercase tracking-widest">
          <span>生命力 ( Vitality )</span>
          <span>
            {character.hp.current} / {character.hp.max}
          </span>
        </div>
        <div className="w-full h-2 bg-background rounded-full p-[2px] border border-parchment-900">
          <Motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(character.hp.current / character.hp.max) * 100}%` }}
            className={clsx(
              'h-full rounded-full shadow-[0_0_15px_rgba(163,132,91,0.5)]',
              character.hp.current / character.hp.max < 0.3 ? 'bg-accent' : 'bg-primary-500',
            )}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        <StatBox label="力量" val={character.abilities.str} mod={calculateModifier(character.abilities.str)} />
        <StatBox label="敏捷" val={character.abilities.dex} mod={calculateModifier(character.abilities.dex)} />
        <StatBox label="体质" val={character.abilities.con} mod={calculateModifier(character.abilities.con)} />
        <StatBox label="智力" val={character.abilities.int} mod={calculateModifier(character.abilities.int)} />
        <StatBox label="感知" val={character.abilities.wis} mod={calculateModifier(character.abilities.wis)} />
        <StatBox label="魅力" val={character.abilities.cha} mod={calculateModifier(character.abilities.cha)} />
      </div>
    </div>
  </div>
)
