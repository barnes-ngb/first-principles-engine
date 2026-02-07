import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import type { ReactNode } from 'react'

interface PageProps {
  children: ReactNode
}

export default function Page({ children }: PageProps) {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Stack spacing={{ xs: 3, md: 4 }}>{children}</Stack>
    </Container>
  )
}
