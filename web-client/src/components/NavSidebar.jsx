import { motion } from 'framer-motion'
import { Compass, Menu, Scroll, Settings, Shield, Swords, Users, X } from 'lucide-react'
import clsx from 'clsx'

const MotionAside = motion.aside

const NavIcon = ({ icon, label, expanded, active = false }) => (
  <div
    className={clsx(
      'flex items-center gap-4 transition-all py-3 rounded-sm cursor-pointer group px-4 mx-2',
      active
        ? 'bg-primary-500/10 text-primary-400 border-l-2 border-primary-500'
        : 'text-parchment-800 hover:bg-parchment-800/10 hover:text-parchment-400',
    )}
  >
    {icon}
    {expanded && <span className="text-sm font-bold tracking-widest">{label}</span>}
    {!expanded && (
      <div className="fixed left-20 bg-surface text-primary-400 px-3 py-1 rounded-sm text-xs opacity-0 group-hover:opacity-100 transition-opacity border border-primary-500/20 whitespace-nowrap z-50 pointer-events-none">
        {label}
      </div>
    )}
  </div>
)

export const NavSidebar = ({ isSidebarOpen, setIsSidebarOpen }) => (
  <MotionAside
    initial={false}
    animate={{ width: isSidebarOpen ? 260 : 64 }}
    className="relative z-30 h-full bg-surface border-r border-parchment-800/40 flex flex-col items-center transition-all duration-300 shadow-2xl"
  >
    <div className="p-4 flex items-center w-full">
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="p-2 hover:bg-parchment-800/20 rounded-sm text-primary-400"
      >
        {isSidebarOpen ? <X size={20} /> : <Menu size={24} />}
      </button>
      {isSidebarOpen && (
        <span className="ml-4 font-serif font-black tracking-widest text-primary-400">
          AUTO-DM
        </span>
      )}
    </div>

    <nav className="flex-1 w-full space-y-2 px-2 mt-12">
      <NavIcon icon={<Scroll size={20} />} label="编年史 (Logs)" expanded={isSidebarOpen} active />
      <NavIcon icon={<Users size={20} />} label="盟友 (NPC)" expanded={isSidebarOpen} />
      <NavIcon icon={<Compass size={20} />} label="探索 (Atlas)" expanded={isSidebarOpen} />
      <NavIcon icon={<Shield size={20} />} label="命理 (Stats)" expanded={isSidebarOpen} />
      <NavIcon icon={<Swords size={20} />} label="战技 (Abilities)" expanded={isSidebarOpen} />
    </nav>

    <div className="p-4 w-full mt-auto">
      <NavIcon icon={<Settings size={20} />} label="系统设置" expanded={isSidebarOpen} />
    </div>
  </MotionAside>
)
