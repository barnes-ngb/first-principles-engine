import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import SettingsIcon from '@mui/icons-material/Settings'
import { useProfile } from '../core/profile/useProfile'
import { UserProfile } from '../core/types/enums'

const profileMeta: Record<
  UserProfile,
  { label: string; color: string; initial: string }
> = {
  [UserProfile.Lincoln]: { label: 'Lincoln', color: '#5A8C32', initial: 'L' },
  [UserProfile.London]: { label: 'London', color: '#E52521', initial: 'L' },
  [UserProfile.Parents]: { label: 'Parents', color: '#5c6bc0', initial: 'P' },
}

export default function ProfileMenu() {
  const { profile, selectProfile } = useProfile()
  const navigate = useNavigate()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  if (!profile) return null

  const current = profileMeta[profile]

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleSwitch = (p: UserProfile) => {
    selectProfile(p)
    handleClose()
  }

  const handleSettings = () => {
    handleClose()
    navigate('/settings')
  }

  return (
    <>
      <Box
        onClick={handleClick}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          borderRadius: 2,
          px: 1,
          py: 0.5,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: current.color,
            fontSize: '0.875rem',
            fontWeight: 700,
          }}
        >
          {current.initial}
        </Avatar>
        <Box
          component="span"
          sx={{
            fontWeight: 600,
            fontSize: '0.875rem',
            display: { xs: 'none', md: 'inline' },
          }}
        >
          {current.label}
        </Box>
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{
          paper: {
            sx: { minWidth: 180, mt: 1 },
          },
        }}
      >
        {Object.values(UserProfile).map((p) => {
          const meta = profileMeta[p]
          return (
            <MenuItem
              key={p}
              selected={p === profile}
              onClick={() => handleSwitch(p)}
            >
              <ListItemIcon>
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    bgcolor: meta.color,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {meta.initial}
                </Avatar>
              </ListItemIcon>
              <ListItemText>{meta.label}</ListItemText>
            </MenuItem>
          )
        })}
        <Divider />
        <MenuItem onClick={handleSettings}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Settings</ListItemText>
        </MenuItem>
      </Menu>
    </>
  )
}
