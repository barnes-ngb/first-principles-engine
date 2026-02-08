import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Divider from '@mui/material/Divider'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useNavigate } from 'react-router-dom'

/* ------------------------------------------------------------------ */
/*  Data                                                                */
/* ------------------------------------------------------------------ */

const flywheelStages = [
  {
    label: 'Wonder',
    description: 'Spark curiosity. Ask the question that pulls them forward.',
    icon: '?',
  },
  {
    label: 'Build',
    description: 'Get hands dirty. Make something real.',
    icon: '!',
  },
  {
    label: 'Explain',
    description: 'Narrate what happened. Teaching is the deepest learning.',
    icon: 'E',
  },
  {
    label: 'Reflect',
    description: 'What worked? What surprised us? What changed?',
    icon: 'R',
  },
  {
    label: 'Share',
    description: 'Show it off. Demo night. The audience makes it matter.',
    icon: 'S',
  },
] as const

const features = [
  {
    title: 'Plan A / Plan B',
    subtitle: 'Daily execution that flexes with real life',
    body: 'Check in with energy levels each morning. Normal day? Full plan. Low energy? Lighter sessions to keep momentum. Overwhelmed? Formation only. No guilt, no lost streaks — just the right amount for today.',
  },
  {
    title: 'Ladders & Rungs',
    subtitle: 'Visible, concrete skill progression',
    body: 'Every skill is a ladder. Every milestone is a rung. Kids see exactly where they are and what comes next. Three hits in a row triggers a level-up candidate. Progress is never invisible.',
  },
  {
    title: 'Artifact Capture',
    subtitle: 'Evidence in seconds, not hours',
    body: 'Snap a photo. Record a 30-second narration. Jot a quick note. Each artifact gets tagged with engine stage, subject, and ladder rung automatically. Small artifacts beat perfect documentation every time.',
  },
  {
    title: 'The Weekly Scoreboard',
    subtitle: 'Reflection built into the rhythm',
    body: 'Every week surfaces what worked, what caused friction, and one tweak for next time. Stream progress tracked as hits, nears, and misses. Weekly goals reviewed. No surprises at the end of the year.',
  },
  {
    title: 'Dad Lab',
    subtitle: 'Project-based learning with a build cycle',
    body: 'Plan, Build, Test, Improve. Real projects with real phases. Kids track iterations and write teach-backs that prove understanding deeper than any worksheet.',
  },
  {
    title: 'Records & Export',
    subtitle: 'Compliance-ready in one click',
    body: 'Hours tracked by subject. Day logs exportable as CSV. Monthly evaluations with wins, struggles, and next steps. Portfolio highlights auto-suggested from your best artifacts. Download everything when you need it.',
  },
] as const

const principles = [
  'Small artifacts > perfect documentation',
  'Narration counts — especially for early learners',
  'Tags power everything — stage, subject, location, rung',
  'Default templates reduce decision fatigue',
  'Make it phone-fast — big buttons, minimal typing',
] as const

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function AppCopyPage() {
  const navigate = useNavigate()

  return (
    <Box sx={{ pb: 8 }}>
      {/* ---- Hero ---- */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #5c6bc0 0%, #7e57c2 100%)',
          color: '#fff',
          py: { xs: 8, md: 12 },
          px: 2,
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography
            variant="h2"
            sx={{ fontWeight: 800, mb: 2, fontSize: { xs: '2rem', md: '3rem' } }}
          >
            First Principles Engine
          </Typography>
          <Typography
            variant="h5"
            sx={{ fontWeight: 400, mb: 4, opacity: 0.92, fontSize: { xs: '1.1rem', md: '1.4rem' } }}
          >
            A family learning notebook that makes the right thing easy.
          </Typography>
          <Typography
            variant="body1"
            sx={{ maxWidth: 600, mx: 'auto', mb: 5, opacity: 0.85, lineHeight: 1.7 }}
          >
            Track real learning. Capture evidence in seconds. See progress on
            every skill. Export compliance records whenever you need them.
            Built for families who teach at home and refuse to fly blind.
          </Typography>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/dashboard')}
            sx={{
              bgcolor: '#fff',
              color: '#5c6bc0',
              fontWeight: 700,
              px: 4,
              py: 1.5,
              fontSize: '1rem',
              '&:hover': { bgcolor: '#f5f5f7' },
            }}
          >
            Open Dashboard
          </Button>
        </Container>
      </Box>

      {/* ---- The Problem ---- */}
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 3, textAlign: 'center' }}>
          The problem with homeschool tracking
        </Typography>
        <Typography
          variant="body1"
          sx={{ maxWidth: 640, mx: 'auto', textAlign: 'center', color: 'text.secondary', lineHeight: 1.8 }}
        >
          Most tools are either a spreadsheet pretending to be an app, or a
          curriculum platform that doesn't match how your family actually
          learns. You end up with scattered photos, forgotten logs, and a
          scramble every time someone asks "how many hours?"
        </Typography>
        <Typography
          variant="body1"
          sx={{ maxWidth: 640, mx: 'auto', mt: 2, textAlign: 'center', color: 'text.secondary', lineHeight: 1.8 }}
        >
          First Principles Engine replaces the scramble with a system.
          One notebook where daily plans, evidence, skill ladders, and
          compliance records live together — and stay current without extra
          effort.
        </Typography>
      </Container>

      <Divider />

      {/* ---- The Flywheel ---- */}
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, textAlign: 'center' }}>
          The Learning Flywheel
        </Typography>
        <Typography
          variant="body2"
          sx={{ textAlign: 'center', color: 'text.secondary', mb: 5 }}
        >
          Five stages. One repeating cycle. The engine that drives everything.
        </Typography>

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ justifyContent: 'center', flexWrap: 'wrap' }}
          useFlexGap
        >
          {flywheelStages.map((stage, i) => (
            <Card
              key={stage.label}
              elevation={1}
              sx={{
                flex: { sm: '1 1 170px' },
                maxWidth: { sm: 200 },
                textAlign: 'center',
              }}
            >
              <CardContent>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '1.2rem',
                    mx: 'auto',
                    mb: 1.5,
                  }}
                >
                  {i + 1}
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {stage.label}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                  {stage.description}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Container>

      <Divider />

      {/* ---- Features ---- */}
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, textAlign: 'center' }}>
          What you get
        </Typography>
        <Typography
          variant="body2"
          sx={{ textAlign: 'center', color: 'text.secondary', mb: 5 }}
        >
          Every feature exists to make daily execution frictionless and
          progress visible.
        </Typography>

        <Stack spacing={4}>
          {features.map((f) => (
            <Card key={f.title} elevation={1}>
              <CardContent sx={{ py: 3, px: { xs: 2, md: 3 } }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {f.title}
                </Typography>
                <Typography
                  variant="subtitle2"
                  sx={{ color: 'primary.main', mb: 1.5 }}
                >
                  {f.subtitle}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  {f.body}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Container>

      <Divider />

      {/* ---- Design Principles ---- */}
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 4, textAlign: 'center' }}>
          Design principles
        </Typography>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ flexWrap: 'wrap', justifyContent: 'center' }}
          useFlexGap
        >
          {principles.map((p) => (
            <Chip
              key={p}
              label={p}
              variant="outlined"
              sx={{ fontSize: '0.85rem', py: 2.5, height: 'auto' }}
            />
          ))}
        </Stack>
      </Container>

      <Divider />

      {/* ---- Who it's for ---- */}
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 3, textAlign: 'center' }}>
          Built for families who teach at home
        </Typography>
        <Stack spacing={2} sx={{ maxWidth: 640, mx: 'auto' }}>
          <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.8 }}>
            First Principles Engine is opinionated. It's not a generic LMS.
            It's a notebook designed for a specific kind of family: one that
            values wonder-driven learning, wants evidence without busywork,
            and needs compliance records that are always current.
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.8 }}>
            Parents get full control — daily plans, weekly reflections, engine
            stats, records, and exports. Kids get their own dashboard with
            ladders, streaks, and session runners. Everyone sees progress.
            Nobody does extra paperwork.
          </Typography>
        </Stack>
      </Container>

      <Divider />

      {/* ---- Profiles ---- */}
      <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, textAlign: 'center' }}>
          One app, three views
        </Typography>
        <Typography
          variant="body2"
          sx={{ textAlign: 'center', color: 'text.secondary', mb: 4 }}
        >
          Each family member sees what matters to them.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ justifyContent: 'center' }}>
          {[
            {
              name: 'Lincoln',
              color: '#43a047',
              bg: '#e8f5e9',
              desc: 'Personal dashboard, ladders, session runner, and streaks. The view that makes progress feel real.',
            },
            {
              name: 'London',
              color: '#e91e63',
              bg: '#fce4ec',
              desc: 'Same tools, her own theme. Rounded edges, warm colors, and a space that feels like hers.',
            },
            {
              name: 'Parents',
              color: '#5c6bc0',
              bg: '#e8eaf6',
              desc: 'Full access. Day logs, weekly plans, engine stats, records, evaluations, and exports.',
            },
          ].map((p) => (
            <Card
              key={p.name}
              elevation={1}
              sx={{ flex: 1, borderTop: `4px solid ${p.color}`, bgcolor: p.bg }}
            >
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, color: p.color, mb: 1 }}>
                  {p.name}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                  {p.desc}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Container>

      <Divider />

      {/* ---- CTA ---- */}
      <Box sx={{ textAlign: 'center', py: { xs: 6, md: 8 } }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
          Start where you are
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: 'text.secondary', mb: 4, maxWidth: 480, mx: 'auto' }}
        >
          Pick a profile. Log today's first artifact. The flywheel starts
          turning the moment you capture something real.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/dashboard')}
          sx={{ px: 5, py: 1.5, fontWeight: 700, fontSize: '1rem' }}
        >
          Go to Dashboard
        </Button>
      </Box>
    </Box>
  )
}
