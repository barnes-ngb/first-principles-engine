// Main composition — Design Canvas with phone-framed artboards for Shelly + Lincoln.

const { useState: useStateApp } = React;

function App() {
  return (
    <DesignCanvas>
      {/* ===== HERO INTRO ===== */}
      <DCSection
        id="intro"
        title="Principles Foundry"
        subtitle="A homeschool app for Shelly and the boys — collect for state, grow heroes, never judge."
      >
        <DCArtboard id="intro-card" label="" width={760} height={420}>
          <IntroCard />
        </DCArtboard>
      </DCSection>

      {/* ===== SHELLY ===== */}
      <DCSection
        id="shelly"
        title="Shelly — Parent mode"
        subtitle="Indigo / Inter · the calm side of the house. Today, plan, log, records, AI co-pilot."
      >
        <DCArtboard id="s-today" label="01 · Today" width={410} height={864}>
          <Phone><ShellyToday /></Phone>
        </DCArtboard>
        <DCArtboard id="s-plan" label="02 · Plan My Week" width={410} height={864}>
          <Phone><ShellyPlan /></Phone>
        </DCArtboard>
        <DCArtboard id="s-log" label="03 · Behavior Log" width={410} height={864}>
          <Phone><ShellyLog /></Phone>
        </DCArtboard>
        <DCArtboard id="s-records" label="04 · Records (state-ready)" width={410} height={864}>
          <Phone><ShellyRecords /></Phone>
        </DCArtboard>
        <DCArtboard id="s-ai" label="05 · Shelly AI" width={410} height={864}>
          <Phone><ShellyAI /></Phone>
        </DCArtboard>
      </DCSection>

      {/* ===== LINCOLN ===== */}
      <DCSection
        id="lincoln"
        title="Lincoln — Hero mode"
        subtitle="Pixel / Press Start 2P · the Minecraft world of Stonebridge. Suit up, mine, grow."
      >
        <DCArtboard id="l-hub" label="01 · Hero Hub" width={410} height={864}>
          <Phone dark><LincolnHub /></Phone>
        </DCArtboard>
        <DCArtboard id="l-mission" label="02 · Daily Mission" width={410} height={864}>
          <Phone dark><LincolnMission /></Phone>
        </DCArtboard>
        <DCArtboard id="l-mine" label="03 · Knowledge Mine" width={410} height={864}>
          <Phone dark><LincolnMine /></Phone>
        </DCArtboard>
        <DCArtboard id="l-forge" label="04 · Armor Forge" width={410} height={864}>
          <Phone dark><LincolnForge /></Phone>
        </DCArtboard>
        <DCArtboard id="l-test" label="05 · Quest Complete" width={410} height={864}>
          <Phone dark><LincolnTest /></Phone>
        </DCArtboard>
      </DCSection>

      {/* ===== TABLET ===== */}
      <DCSection
        id="tablet"
        title="Tablet — landscape iPad"
        subtitle="Same flows reflowed for 1180×820. Sidebar nav lives; two-pane patterns where the surface earns it."
      >
        <DCArtboard id="t-s-today" label="Shelly · Today (both kids side-by-side)" width={1200} height={840}>
          <Tablet><TabletShellyToday /></Tablet>
        </DCArtboard>
        <DCArtboard id="t-s-plan" label="Shelly · Plan + Chat split" width={1200} height={840}>
          <Tablet><TabletShellyPlan /></Tablet>
        </DCArtboard>
        <DCArtboard id="t-s-records" label="Shelly · Records (table + state checklist)" width={1200} height={840}>
          <Tablet><TabletShellyRecords /></Tablet>
        </DCArtboard>
        <DCArtboard id="t-l-hub" label="Lincoln · Hero Hub (big scene)" width={1200} height={840}>
          <Tablet dark><TabletLincolnHub /></Tablet>
        </DCArtboard>
        <DCArtboard id="t-l-forge" label="Lincoln · Armor Forge (hero + grid + stats)" width={1200} height={840}>
          <Tablet dark><TabletLincolnForge /></Tablet>
        </DCArtboard>
        <DCArtboard id="t-l-mine" label="Lincoln · Knowledge Mine (depth + ore + AI quest)" width={1200} height={840}>
          <Tablet dark><TabletLincolnMine /></Tablet>
        </DCArtboard>
      </DCSection>

      {/* ===== POSTITS ===== */}
      <DCSection
        id="notes"
        title="Working notes"
        subtitle="Open questions, principles, anti-patterns."
      >
        <DCArtboard id="note-1" label="Principle" width={300} height={320}>
          <NoteCard
            tag="PRINCIPLE"
            tagColor="#1f9d55"
            title="No judge. Mine and grow."
            body={[
              "Shelly's logs use 'noticed', 'flow', 'stuck', 'joy'. Never 'failed' or 'behind'.",
              "Lincoln's misses are 'what to mine next' — the world is always there to dig.",
              "Tests are gentle: 2 re-tries, audio cues, no red.",
            ]}
          />
        </DCArtboard>
        <DCArtboard id="note-2" label="Open Q" width={300} height={320}>
          <NoteCard
            tag="OPEN Q"
            tagColor="#b45309"
            title="London (Mario mode) — next?"
            body={[
              "Lincoln's pixel world is locked in.",
              "London's Mario palette is in theme.ts but no screens here yet.",
              "Want a parallel Mario flow, or simpler / different metaphor for her?",
            ]}
          />
        </DCArtboard>
        <DCArtboard id="note-3" label="Anti-pattern" width={300} height={320}>
          <NoteCard
            tag="ANTI-PATTERN"
            tagColor="#be3a47"
            title="Don't gamify the wrong thing."
            body={[
              "XP for SHOWING UP, not for being right. The 'Quest Complete' screen rewards effort + mastery separately.",
              "Mom's note > the number. Always.",
            ]}
          />
        </DCArtboard>
        <DCArtboard id="note-4" label="For state" width={300} height={320}>
          <NoteCard
            tag="FOR STATE"
            tagColor="#5c6bc0"
            title="Records auto-collect from every screen."
            body={[
              "Reading Eggs sessions → attendance hours.",
              "Photos taken in Dad Lab → portfolio with date stamp.",
              "Voice notes & evaluations → quarterly PDF, one tap.",
            ]}
          />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

function IntroCard() {
  return (
    <div style={{
      width: "100%", height: "100%",
      background: "linear-gradient(135deg, #fffbf2 0%, #f0eee9 100%)",
      padding: 40, boxSizing: "border-box",
      display: "grid", gridTemplateColumns: "1fr 220px", gap: 28, alignItems: "center",
      border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12,
    }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#7e57c2", letterSpacing: 2, textTransform: "uppercase" }}>Design pass · v1</div>
        <h1 style={{ fontSize: 44, fontWeight: 800, margin: "6px 0 12px", letterSpacing: -1, lineHeight: 1.05, textWrap: "balance" }}>
          Two worlds, one homeschool.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: "#5e616c", maxWidth: 540, margin: 0, textWrap: "pretty" }}>
          Shelly gets a calm, indigo planner that quietly collects everything the state needs.
          Lincoln gets a pixel hero he grows — armor, XP, gentle AI tests. No judge. Just mine
          and grow.
        </p>
        <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            ["10 mobile screens", "#5c6bc0"],
            ["6 tablet layouts", "#7e57c2"],
            ["No-judge framing", "#1f9d55"],
            ["State-ready exports", "#b45309"],
            ["Armor of God", "#5DECF5"],
          ].map(([l, c]) => (
            <span key={l} style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, background: "#fff", color: c, border: `1.5px solid ${c}33`, letterSpacing: 0.3 }}>{l}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ height: 90, borderRadius: 14, background: "linear-gradient(135deg, #5c6bc0, #7e57c2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: 0.4 }}>
          PARENT · Shelly
        </div>
        <div style={{ height: 90, borderRadius: 0, background: "#0f1614", border: "2px solid #284035", display: "flex", alignItems: "center", justifyContent: "center", color: "#7EFC20", fontFamily: '"Press Start 2P", monospace', fontSize: 10, letterSpacing: 1, boxShadow: "4px 4px 0 0 rgba(0,0,0,0.3)" }}>
          HERO · Lincoln
        </div>
      </div>
    </div>
  );
}

function NoteCard({ tag, tagColor, title, body }) {
  return (
    <div style={{
      width: "100%", height: "100%", padding: 18, boxSizing: "border-box",
      background: "#fef4a8", color: "#5a4a2a",
      boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
      display: "flex", flexDirection: "column", gap: 10,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: tagColor, letterSpacing: 1.2, textTransform: "uppercase" }}>{tag}</div>
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25, color: "#3a2f15", textWrap: "balance" }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {body.map((b, i) => (
          <div key={i} style={{ fontSize: 12.5, lineHeight: 1.5, textWrap: "pretty" }}>· {b}</div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
