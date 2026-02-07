import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

interface SectionCardProps {
  title: string
  children: ReactNode
}

export default function SectionCard({ title, children }: SectionCardProps) {
  return (
    <Card elevation={2}>
      <CardContent>
        <Stack spacing={2}>
          <Typography component="h2" variant="h6">
            {title}
          </Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  )
}
