import type { ArmorPiece } from '../../../core/types'

// ── Tier color scheme ──────────────────────────────────────────────

export const TIER_COLORS = {
  wood:       { fill: '#8B6914', stroke: '#6B4F12', glow: 'none' },
  stone:      { fill: '#8B7355', stroke: '#5C4A2A', glow: 'none' },
  iron:       { fill: '#6E6E6E', stroke: '#4E4E4E', glow: 'none' },
  gold:       { fill: '#DAA520', stroke: '#B8860B', glow: '#332200' },
  diamond:    { fill: '#4FC3F7', stroke: '#FFD700', glow: '#4FC3F7' },
  netherite:  { fill: '#2C2C3E', stroke: '#9C27B0', glow: '#7B1FA2' },
  basic:      { fill: '#FF9EBC', stroke: '#FF6B9D', glow: 'none' },
  powerup:    { fill: '#FFD700', stroke: '#FF9800', glow: '#FFD700' },
  champion:   { fill: '#E040FB', stroke: '#AA00FF', glow: '#CE93D8' },
} as const

export type ArmorTierColor = keyof typeof TIER_COLORS

export interface ArmorIconProps {
  size?: number
  tier?: ArmorTierColor
  locked?: boolean
  applied?: boolean
}

// ── Lock badge ─────────────────────────────────────────────────────

function LockBadge() {
  return (
    <g transform="translate(44, 44)">
      {/* Body */}
      <rect x="0" y="4" width="14" height="10" rx="2" fill="#555" stroke="#333" strokeWidth="1.5" />
      {/* Shackle */}
      <path d="M3 4 V2 A4 4 0 0 1 11 2 V4" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" />
      {/* Keyhole */}
      <circle cx="7" cy="9" r="1.5" fill="#888" />
      <rect x="6" y="9.5" width="2" height="2" rx="0.5" fill="#888" />
    </g>
  )
}

// ── Applied checkmark badge ────────────────────────────────────────

function AppliedBadge() {
  return (
    <g transform="translate(42, 0)">
      <circle cx="11" cy="11" r="10" fill="#2e7d32" stroke="#fff" strokeWidth="1.5" />
      <path d="M6 11 L9.5 14.5 L16 8" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  )
}

// ── Belt of Truth ──────────────────────────────────────────────────

export function BeltIcon({ size = 64, tier = 'stone', locked = false, applied = false }: ArmorIconProps) {
  const { fill, stroke } = TIER_COLORS[tier]
  const opacity = locked ? 0.3 : 1
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      {/* Strap */}
      <rect x="4" y="22" width="56" height="20" rx="4" fill={fill} stroke={stroke} strokeWidth="2.5" />
      {/* Buckle frame */}
      <rect x="22" y="18" width="20" height="28" rx="3" fill={fill} stroke={stroke} strokeWidth="2.5" />
      {/* Buckle inner */}
      <rect x="25" y="21" width="14" height="22" rx="2" fill={stroke} opacity="0.25" />
      {/* Cross cut-out */}
      <line x1="32" y1="23" x2="32" y2="41" stroke={fill} strokeWidth="2.5" />
      <line x1="27" y1="32" x2="37" y2="32" stroke={fill} strokeWidth="2.5" />
      {locked && <LockBadge />}
      {applied && <AppliedBadge />}
    </svg>
  )
}

// ── Breastplate of Righteousness ───────────────────────────────────

export function BreastplateIcon({ size = 64, tier = 'stone', locked = false, applied = false }: ArmorIconProps) {
  const { fill, stroke } = TIER_COLORS[tier]
  const opacity = locked ? 0.3 : 1
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      {/* Body */}
      <path d="M10 8 H54 V38 L32 56 L10 38 Z" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Shoulder notches */}
      <path d="M10 8 C10 4 17 4 17 8" fill={fill} stroke={stroke} strokeWidth="2" />
      <path d="M54 8 C54 4 47 4 47 8" fill={fill} stroke={stroke} strokeWidth="2" />
      {/* Inner shading */}
      <path d="M14 12 H50 V36 L32 50 L14 36 Z" fill={stroke} opacity="0.15" />
      {/* Cross */}
      <line x1="32" y1="16" x2="32" y2="44" stroke={fill} strokeWidth="3.5" strokeLinecap="round" />
      <line x1="22" y1="26" x2="42" y2="26" stroke={fill} strokeWidth="3.5" strokeLinecap="round" />
      {locked && <LockBadge />}
      {applied && <AppliedBadge />}
    </svg>
  )
}

// ── Shoes of Peace ─────────────────────────────────────────────────

export function ShoesIcon({ size = 64, tier = 'stone', locked = false, applied = false }: ArmorIconProps) {
  const { fill, stroke } = TIER_COLORS[tier]
  const opacity = locked ? 0.3 : 1
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      {/* Left shoe */}
      <path d="M4 52 H22 L26 44 V30 C26 27 22 27 22 30 V42 H4 Z" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Left sole */}
      <rect x="2" y="50" width="22" height="4" rx="2" fill={stroke} opacity="0.5" />
      {/* Left wing accent */}
      <path d="M22 32 C18 28 16 24 18 20" stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Right shoe */}
      <path d="M60 52 H42 L38 44 V30 C38 27 42 27 42 30 V42 H60 Z" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Right sole */}
      <rect x="40" y="50" width="22" height="4" rx="2" fill={stroke} opacity="0.5" />
      {/* Right wing accent */}
      <path d="M42 32 C46 28 48 24 46 20" stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {locked && <LockBadge />}
      {applied && <AppliedBadge />}
    </svg>
  )
}

// ── Shield of Faith ────────────────────────────────────────────────

export function ShieldIcon({ size = 64, tier = 'stone', locked = false, applied = false }: ArmorIconProps) {
  const { fill, stroke } = TIER_COLORS[tier]
  const opacity = locked ? 0.3 : 1
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      {/* Shield */}
      <path d="M8 8 H56 V40 L32 60 L8 40 Z" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Inner bevel */}
      <path d="M12 12 H52 V38 L32 54 L12 38 Z" fill={fill} stroke={stroke} strokeWidth="1" opacity="0.3" />
      {/* Cross */}
      <line x1="32" y1="14" x2="32" y2="52" stroke={fill} strokeWidth="3.5" strokeLinecap="round" />
      <line x1="16" y1="28" x2="48" y2="28" stroke={fill} strokeWidth="3.5" strokeLinecap="round" />
      {/* Rays at 45° */}
      <line x1="32" y1="28" x2="40" y2="20" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="32" y1="28" x2="24" y2="20" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="32" y1="28" x2="40" y2="36" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <line x1="32" y1="28" x2="24" y2="36" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      {locked && <LockBadge />}
      {applied && <AppliedBadge />}
    </svg>
  )
}

// ── Helmet of Salvation ────────────────────────────────────────────

export function HelmetIcon({ size = 64, tier = 'stone', locked = false, applied = false }: ArmorIconProps) {
  const { fill, stroke } = TIER_COLORS[tier]
  const opacity = locked ? 0.3 : 1
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      {/* Dome */}
      <path d="M12 40 V22 A20 20 0 0 1 52 22 V40 Z" fill={fill} stroke={stroke} strokeWidth="2.5" />
      {/* Brim */}
      <rect x="8" y="38" width="48" height="6" rx="3" fill={fill} stroke={stroke} strokeWidth="2.5" />
      {/* Left cheek guard */}
      <path d="M12 26 H8 V44 H12" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Right cheek guard */}
      <path d="M52 26 H56 V44 H52" fill={fill} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Visor */}
      <rect x="18" y="30" width="28" height="8" rx="2" fill={stroke} opacity="0.6" />
      {/* Visor slot highlight */}
      <rect x="18" y="30" width="28" height="2" rx="1" fill={fill} opacity="0.3" />
      {locked && <LockBadge />}
      {applied && <AppliedBadge />}
    </svg>
  )
}

// ── Sword of the Spirit ────────────────────────────────────────────

export function SwordIcon({ size = 64, tier = 'stone', locked = false, applied = false }: ArmorIconProps) {
  const { fill, stroke } = TIER_COLORS[tier]
  const opacity = locked ? 0.3 : 1
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity }}>
      {/* Blade */}
      <rect x="29" y="4" width="6" height="36" rx="2" fill={fill} stroke={stroke} strokeWidth="2" />
      {/* Blade tip taper */}
      <path d="M29 36 L32 44 L35 36 Z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      {/* Edge line */}
      <line x1="32" y1="6" x2="32" y2="38" stroke={fill} strokeWidth="1" opacity="0.4" />
      {/* Guard */}
      <rect x="16" y="38" width="32" height="6" rx="3" fill={fill} stroke={stroke} strokeWidth="2.5" />
      {/* Grip */}
      <rect x="28" y="44" width="8" height="14" rx="2" fill={stroke} opacity="0.7" stroke={stroke} strokeWidth="1.5" />
      {/* Grip wrap lines */}
      <line x1="28" y1="48" x2="36" y2="48" stroke={fill} strokeWidth="1" opacity="0.5" />
      <line x1="28" y1="52" x2="36" y2="52" stroke={fill} strokeWidth="1" opacity="0.5" />
      {/* Pommel */}
      <circle cx="32" cy="61" r="4.5" fill={fill} stroke={stroke} strokeWidth="2" />
      {locked && <LockBadge />}
      {applied && <AppliedBadge />}
    </svg>
  )
}

// ── ArmorIcon dispatch ─────────────────────────────────────────────

const ICON_MAP: Record<ArmorPiece, React.FC<ArmorIconProps>> = {
  belt_of_truth:                BeltIcon,
  breastplate_of_righteousness: BreastplateIcon,
  shoes_of_peace:               ShoesIcon,
  shield_of_faith:              ShieldIcon,
  helmet_of_salvation:          HelmetIcon,
  sword_of_the_spirit:          SwordIcon,
}

interface ArmorIconDispatchProps extends ArmorIconProps {
  pieceId: ArmorPiece
}

export function ArmorIcon({ pieceId, ...props }: ArmorIconDispatchProps) {
  const Icon = ICON_MAP[pieceId]
  return <Icon {...props} />
}
