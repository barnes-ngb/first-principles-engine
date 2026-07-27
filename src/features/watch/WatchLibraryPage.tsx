import Page from '../../components/Page'
import SectionCard from '../../components/SectionCard'
import SectionErrorBoundary from '../../components/SectionErrorBoundary'
import WatchLibraryTab from './WatchLibraryTab'

/**
 * The Watch Library's own home (FEAT-132), at `/watch`.
 *
 * FEAT-100 shipped the library as the 4th tab inside Settings, which is where
 * device testing found it: *"I can't even remember where the video library is."*
 * Curation is a recurring job — vet a video in, retire one, check what's on the
 * shelf — not a setting you configure once, so it gets a top-level parent nav
 * entry alongside the other things a parent goes to *do*.
 *
 * Deliberately a thin shell. `WatchLibraryTab` moved here unchanged — it already
 * carries its own `canEdit` capability gate above its data hooks, so mounting it
 * on a route costs a non-parent zero Firestore reads even before `RequireParent`
 * is considered. Moving the library is not a licence to redesign it.
 */
export default function WatchLibraryPage() {
  return (
    <Page>
      <SectionCard title="Watch Library">
        <SectionErrorBoundary section="watch-library">
          <WatchLibraryTab />
        </SectionErrorBoundary>
      </SectionCard>
    </Page>
  )
}
