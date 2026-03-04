import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

interface SectionCardProps {
  title: string
  action?: ReactNode
  children: ReactNode
}

export default function SectionCard({ title, action, children }: SectionCardProps) {
  return (
    <Card elevation={2}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography component="h2" variant="h6">
              {title}
            </Typography>
            {action}
          </Stack>
          {children}
        </Stack>
      </CardContent>
    </Card>
  )
}
