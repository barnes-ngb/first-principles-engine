import BuildIcon from '@mui/icons-material/Build'
import CalculateIcon from '@mui/icons-material/Calculate'
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun'
import ExploreIcon from '@mui/icons-material/Explore'
import GroupsIcon from '@mui/icons-material/Groups'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver'
import WbSunnyIcon from '@mui/icons-material/WbSunny'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ReactElement } from 'react'

import { DayBlockType } from '../../core/types/enums'

interface BlockMeta {
  icon: ReactElement
  color: string
  label: string
}

const iconSx: SxProps<Theme> = { fontSize: 28 }

export const blockMeta: Record<DayBlockType, BlockMeta> = {
  [DayBlockType.Formation]: {
    icon: <WbSunnyIcon sx={iconSx} />,
    color: '#f59e0b',
    label: 'Formation',
  },
  [DayBlockType.Reading]: {
    icon: <MenuBookIcon sx={iconSx} />,
    color: '#3b82f6',
    label: 'Reading',
  },
  [DayBlockType.Speech]: {
    icon: <RecordVoiceOverIcon sx={iconSx} />,
    color: '#8b5cf6',
    label: 'Speech',
  },
  [DayBlockType.Math]: {
    icon: <CalculateIcon sx={iconSx} />,
    color: '#10b981',
    label: 'Math',
  },
  [DayBlockType.Together]: {
    icon: <GroupsIcon sx={iconSx} />,
    color: '#ec4899',
    label: 'Together',
  },
  [DayBlockType.Movement]: {
    icon: <DirectionsRunIcon sx={iconSx} />,
    color: '#f97316',
    label: 'Movement',
  },
  [DayBlockType.Project]: {
    icon: <BuildIcon sx={iconSx} />,
    color: '#14b8a6',
    label: 'Project',
  },
  [DayBlockType.FieldTrip]: {
    icon: <ExploreIcon sx={iconSx} />,
    color: '#6366f1',
    label: 'Field Trip',
  },
  [DayBlockType.Other]: {
    icon: <MoreHorizIcon sx={iconSx} />,
    color: '#6b7280',
    label: 'Other',
  },
}
