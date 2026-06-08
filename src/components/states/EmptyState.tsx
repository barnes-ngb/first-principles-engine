import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  /** Optional muted icon shown above the title (e.g. `<MenuBookIcon />`). */
  icon?: ReactNode
  /** Short, inviting heading. Warm + no-shame per the charter. */
  title: string
  /** Optional supporting line beneath the title. */
  description?: string
  /** Optional call-to-action (typically a `<Button>`). */
  action?: ReactNode
}

/**
 * Shared empty-state — centered muted icon, title, optional description, and an
 * optional call-to-action. Default copy is warm and no-shame ("Nothing here
 * yet", never "No data"). Replaces the ad-hoc "No …" empties (migrated in UI
 * Batch 3b).
 */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Stack alignItems="center" spacing={1.5} sx={{ textAlign: 'center', py: 6, px: 2 }}>
      {icon && (
        <Box sx={{ color: 'text.disabled', fontSize: 64, display: 'flex', '& svg': { fontSize: 64 } }}>
          {icon}
        </Box>
      )}
      <Typography variant="h6" color="text.secondary">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1.5 }}>{action}</Box>}
    </Stack>
  )
}
