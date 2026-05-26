// Shelly's parent-mode screens. Clean indigo/purple, Inter, mobile.
// All screens are 390x844 phone-frame children of <Phone>.

const SH = {
  bg: "#f5f5f7",
  paper: "#ffffff",
  ink: "#1c1d22",
  ink2: "#5e616c",
  ink3: "#9094a0",
  line: "rgba(20,22,30,0.08)",
  indigo: "#5c6bc0",
  indigoSoft: "#eef0fa",
  violet: "#7e57c2",
  green: "#1f9d55",
  greenSoft: "#e7f5ec",
  amber: "#b45309",
  amberSoft: "#fef3c7",
  rose: "#be3a47",
  roseSoft: "#fde8ea",
};

// Reusable: child pill
function KidPill({ name, color, active, sub }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px 6px 6px",
      background: active ? SH.indigo : "#fff",
      color: active ? "#fff" : SH.ink,
      borderRadius: 999,
      border: active ? "none" : `1px solid ${SH.line}`,
      fontSize: 13, fontWeight: 600,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: color, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700,
      }}>{name[0]}</div>
      {name}
      {sub && <span style={{ opacity: 0.6, fontWeight: 500, fontSize: 12 }}>· {sub}</span>}
    </div>
  );
}

// ===================== TODAY =====================
function ShellyToday() {
  return (
    <div className="screen" style={{ background: SH.bg }}>
      {/* page header */}
      <div style={{ padding: "16px 20px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: SH.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>Tue · May 26</div>
          <div style={{ display: "flex", gap: 8, color: SH.ink2 }}>
            {Icon.cal}{Icon.more}
          </div>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0 0", color: SH.ink, letterSpacing: -0.4 }}>Today</h1>
      </div>

      {/* kids selector */}
      <div style={{ padding: "10px 20px", display: "flex", gap: 8 }}>
        <KidPill name="Lincoln" color="#5A8C32" active />
        <KidPill name="London" color="#E52521" />
        <button style={{
          background: "#fff", border: `1px dashed ${SH.line}`, borderRadius: 999,
          padding: "6px 12px", fontSize: 13, color: SH.ink2, display: "inline-flex", gap: 4, alignItems: "center",
        }}>{Icon.plus} Add</button>
      </div>

      {/* day log saved banner */}
      <div style={{ margin: "6px 20px 14px", display: "flex", alignItems: "center", gap: 10,
        background: SH.greenSoft, color: SH.green, padding: "10px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600,
      }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: SH.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.check}</div>
        Daily Log saved · 2:24 PM
        <span style={{ marginLeft: "auto", opacity: 0.7, fontWeight: 500, fontSize: 12 }}>Auto</span>
      </div>

      {/* energy row */}
      <div style={{ margin: "0 20px 14px", background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${SH.line}` }}>
        <div style={{ fontSize: 13, color: SH.ink2, marginBottom: 10 }}>How's Lincoln's energy?</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {[
            { l: "Normal", on: true },
            { l: "Low" },
            { l: "Overwhelmed" },
          ].map((x) => (
            <div key={x.l} style={{
              padding: "10px 0", textAlign: "center",
              borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: x.on ? SH.indigo : SH.indigoSoft,
              color: x.on ? "#fff" : SH.indigo,
            }}>{x.l}</div>
          ))}
        </div>
      </div>

      {/* block sections */}
      <div style={{ padding: "0 20px", display: "grid", gap: 10 }}>
        <Section title="Language Arts" sub="3 blocks" right="0/3" hue="indigo">
          <Block label="Initial sounds — set 3" mins={15} done />
          <Block label="Long-A pattern: ai/ay" mins={20} />
          <Block label="Rhyming word ladder" mins={10} />
        </Section>

        <Section title="Reading" sub="2 blocks" right="0/2" hue="violet">
          <Block label="Reading Eggs" mins={15} ext="app" />
          <Block label="Chapter: The Lion, the Witch &amp; the Wardrobe — Ch. 14" mins={20} ext="read-aloud" />
        </Section>

        <Section title="Math &amp; Other" sub="2 blocks" right="0/2" hue="amber">
          <Block label="Bedtime Math · place value" mins={15} />
          <Block label="Typing club · home row drill" mins={15} ext="app" />
        </Section>
      </div>

      {/* this week */}
      <div style={{ margin: "20px 20px 0", background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${SH.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 700, color: SH.ink }}>This week</div>
          <div style={{ fontSize: 12, color: SH.ink2 }}>0 / 12.6 hrs</div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => {
            const pct = [0.7, 0.0, 0, 0, 0][i];
            const isToday = i === 1;
            return (
              <div key={d} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: 56, borderRadius: 8, background: SH.bg, position: "relative", overflow: "hidden", border: isToday ? `1.5px solid ${SH.indigo}` : "none" }}>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${pct * 100}%`, background: SH.indigo, opacity: pct ? 1 : 0 }} />
                </div>
                <div style={{ fontSize: 11, color: isToday ? SH.indigo : SH.ink3, marginTop: 4, fontWeight: 600 }}>{d}</div>
              </div>
            );
          })}
        </div>
      </div>

      <ParentTabBar active="today" />
    </div>
  );
}

function Section({ title, sub, right, hue, children }) {
  const c = hue === "indigo" ? SH.indigo : hue === "violet" ? SH.violet : SH.amber;
  return (
    <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${SH.line}`, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${SH.line}` }}>
        <span style={{ width: 4, height: 16, borderRadius: 2, background: c }} />
        <div style={{ fontWeight: 700, color: SH.ink, fontSize: 14 }}>{title}</div>
        <div style={{ fontSize: 12, color: SH.ink3 }}>{sub}</div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: SH.ink2, fontWeight: 600 }}>{right}</div>
      </div>
      <div style={{ padding: 6 }}>{children}</div>
    </div>
  );
}

function Block({ label, mins, done, ext }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 10px", borderRadius: 10,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6,
        border: `1.5px solid ${done ? SH.green : SH.line}`,
        background: done ? SH.green : "#fff",
        color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>{done ? Icon.check : null}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: done ? SH.ink3 : SH.ink, textDecoration: done ? "line-through" : "none" }} dangerouslySetInnerHTML={{ __html: label }} />
        <div style={{ fontSize: 11, color: SH.ink3, marginTop: 2, display: "flex", gap: 6, alignItems: "center" }}>
          {mins} min{ext && <><span>·</span><span>{ext}</span></>}
        </div>
      </div>
    </div>
  );
}

// ===================== PLAN MY WEEK =====================
function ShellyPlan() {
  return (
    <div className="screen" style={{ background: SH.bg }}>
      <div style={{ padding: "16px 20px 6px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: SH.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>This week · Week 22</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0 4px", color: SH.ink, letterSpacing: -0.4 }}>Plan My Week</h1>
        <div style={{ fontSize: 14, color: SH.ink2 }}>Set up your week, review, you're done.</div>
      </div>

      <div style={{ padding: "12px 20px", display: "flex", gap: 8 }}>
        <KidPill name="Lincoln" color="#5A8C32" active />
        <KidPill name="London" color="#E52521" />
      </div>

      {/* coverage card */}
      <div style={{ margin: "0 20px 14px", background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${SH.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ width: 4, height: 16, borderRadius: 2, background: SH.indigo }} />
          <div style={{ fontWeight: 700, color: SH.ink, fontSize: 14 }}>Lincoln's plan</div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: SH.ink2, background: SH.indigoSoft, padding: "3px 9px", borderRadius: 999, fontWeight: 600 }}>3.1h/day</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {["Reading Eggs 15m", "Math app / Typing 15m", "Read-aloud nightly"].map((c) => (
            <span key={c} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 999, background: SH.bg, color: SH.ink2, fontWeight: 500 }}>{c}</span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: SH.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>Coverage</div>
        <div style={{ display: "grid", gap: 6 }}>
          {[
            { l: "Language Arts", v: "12 blocks · initial 3x, long-a 2x, rhyming 1x", c: SH.green },
            { l: "Reading", v: "16 blocks · wh-questions 2x", c: SH.indigo },
            { l: "Math", v: "8 blocks", c: SH.violet },
            { l: "Other (typing, science)", v: "4 blocks", c: SH.amber },
          ].map((x) => (
            <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: x.c, flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: SH.ink }}>{x.l}</div>
              <div style={{ fontSize: 12, color: SH.ink2, marginLeft: "auto", textAlign: "right" }}>{x.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* plan applied banner */}
      <div style={{ margin: "0 20px 14px", padding: 14, background: SH.greenSoft, border: `1px solid ${SH.green}22`, borderRadius: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: SH.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: SH.green }}>Plan applied</div>
          <div style={{ fontSize: 12, color: "#256e3d" }}>Lincoln's week is ready.</div>
        </div>
        <button style={{ background: SH.green, color: "#fff", border: "none", borderRadius: 999, padding: "8px 14px", fontWeight: 600, fontSize: 13 }}>Open Today</button>
      </div>

      {/* read aloud */}
      <div style={{ margin: "0 20px 14px", background: "#fff", borderRadius: 16, border: `1px solid ${SH.line}`, overflow: "hidden" }}>
        <div style={{ padding: 14, display: "flex", gap: 12 }}>
          <div style={{ width: 56, height: 76, borderRadius: 6, background: "linear-gradient(135deg,#7c3a1f,#3d1d10)", color: "#f3d997", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 6, fontSize: 9, fontWeight: 700, lineHeight: 1.1 }}>
            <div style={{ opacity: 0.7 }}>C.S. LEWIS</div>
            <div>The Lion, the Witch &amp; the Wardrobe</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: SH.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Read-aloud book</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: SH.ink, margin: "2px 0" }}>Lion, Witch &amp; Wardrobe</div>
            <div style={{ fontSize: 12, color: SH.ink2 }}>Ch 14 tonight · 13/17 chapter questions answered</div>
            <div style={{ marginTop: 8, height: 6, background: SH.bg, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(13 / 17) * 100}%`, background: SH.indigo }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px 8px", fontSize: 11, color: SH.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Adjust</div>
      <div style={{ padding: "0 20px", display: "grid", gap: 8 }}>
        {[
          ["More phonics, less math this week", "tap to apply"],
          ["Light week — 2h/day cap", "tap to apply"],
          ["Free-form: tell Shelly anything", "advanced"],
        ].map(([l, r]) => (
          <button key={l} style={{ textAlign: "left", padding: "12px 14px", background: "#fff", border: `1px solid ${SH.line}`, borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: SH.ink }}>{l}</div>
            <div style={{ fontSize: 11, color: SH.ink3 }}>{r}</div>
            <div style={{ color: SH.ink3 }}>{Icon.chevron}</div>
          </button>
        ))}
      </div>

      <ParentTabBar active="plan" />
    </div>
  );
}

// ===================== BEHAVIOR LOG =====================
function ShellyLog() {
  const notes = [
    { t: "8:42 AM", k: "noticed", c: SH.indigo, txt: "Asked unprompted about how rainbows work during breakfast. Showed me a drawing." },
    { t: "10:15 AM", k: "flow", c: SH.green, txt: "30 min on Reading Eggs without breaks. Wanted to keep going." },
    { t: "11:30 AM", k: "stuck", c: SH.amber, txt: "Got frustrated with the long-A worksheet. We took a movement break, came back, finished 4 of 6." },
    { t: "2:05 PM", k: "joy", c: SH.violet, txt: "Built a 'water test' with Dad's lab materials. Predicted, observed, revised. Said 'I want to do more science tomorrow.'" },
  ];
  const moods = [
    { l: "Focused", on: true },
    { l: "Curious", on: true },
    { l: "Restless" },
    { l: "Overwhelmed" },
    { l: "Playful", on: true },
    { l: "Tender" },
  ];
  return (
    <div className="screen" style={{ background: SH.bg }}>
      <div style={{ padding: "16px 20px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: SH.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>Lincoln · Tue May 26</div>
          <div style={{ display: "flex", gap: 8, color: SH.ink2 }}>{Icon.cal}{Icon.more}</div>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0 4px", color: SH.ink, letterSpacing: -0.4 }}>What I noticed</h1>
        <div style={{ fontSize: 13, color: SH.ink2 }}>No judge zone — just what's true today.</div>
      </div>

      {/* mood chips */}
      <div style={{ padding: "12px 20px 14px" }}>
        <div style={{ fontSize: 11, color: SH.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>How was he?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {moods.map((m) => (
            <div key={m.l} style={{
              padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600,
              background: m.on ? SH.indigo : "#fff",
              color: m.on ? "#fff" : SH.ink2,
              border: m.on ? "none" : `1px solid ${SH.line}`,
            }}>{m.l}</div>
          ))}
        </div>
      </div>

      {/* timeline */}
      <div style={{ padding: "0 20px", display: "grid", gap: 8 }}>
        {notes.map((n, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 14, padding: 12, border: `1px solid ${SH.line}`, display: "flex", gap: 12 }}>
            <div style={{ flexShrink: 0, width: 64 }}>
              <div style={{ fontSize: 11, color: SH.ink3, fontWeight: 600 }}>{n.t}</div>
              <div style={{ marginTop: 4, fontSize: 11, padding: "2px 8px", borderRadius: 999, background: n.c + "16", color: n.c, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, display: "inline-block" }}>{n.k}</div>
            </div>
            <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5, color: SH.ink, textWrap: "pretty" }}>{n.txt}</div>
          </div>
        ))}

        {/* add note */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: `1.5px dashed ${SH.line}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: SH.ink3 }}>Add a note…</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["noticed", "flow", "stuck", "joy", "rest"].map((k) => (
              <span key={k} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 999, background: SH.bg, color: SH.ink2, fontWeight: 600 }}>{k}</span>
            ))}
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, color: SH.indigo, fontSize: 12, fontWeight: 600 }}>{Icon.mic} Voice</span>
          </div>
        </div>
      </div>

      {/* shelly insight */}
      <div style={{ margin: "16px 20px 0", padding: 14, borderRadius: 16, background: `linear-gradient(135deg, ${SH.indigoSoft}, #f5eef9)`, border: `1px solid ${SH.indigo}22` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ color: SH.indigo }}>{Icon.sparkles}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: SH.indigo, letterSpacing: 0.4, textTransform: "uppercase" }}>Shelly noticed</div>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.55, color: SH.ink, textWrap: "pretty" }}>
          Lincoln has had 3 "flow" entries this week tied to reading apps with timers. Want me to weight Reading Eggs earlier in the day next week?
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button style={{ background: SH.indigo, color: "#fff", border: "none", borderRadius: 999, padding: "7px 14px", fontWeight: 600, fontSize: 13 }}>Yes, adjust</button>
          <button style={{ background: "transparent", color: SH.ink2, border: `1px solid ${SH.line}`, borderRadius: 999, padding: "7px 14px", fontWeight: 600, fontSize: 13 }}>Not yet</button>
        </div>
      </div>

      <ParentTabBar active="log" />
    </div>
  );
}

// ===================== RECORDS (for State) =====================
function ShellyRecords() {
  return (
    <div className="screen" style={{ background: SH.bg }}>
      <div style={{ padding: "16px 20px 6px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: SH.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>Portfolio · Q4 2025-26</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0 4px", color: SH.ink, letterSpacing: -0.4 }}>Records</h1>
        <div style={{ fontSize: 13, color: SH.ink2 }}>Everything the state needs, gathered as you go.</div>
      </div>

      {/* tabs */}
      <div style={{ padding: "8px 20px 12px", display: "flex", gap: 6 }}>
        {[
          ["Portfolio", true],
          ["Attendance", false],
          ["Evaluations", false],
        ].map(([l, on], i) => (
          <div key={i} style={{
            padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
            background: on ? SH.ink : "#fff", color: on ? "#fff" : SH.ink2, border: on ? "none" : `1px solid ${SH.line}`,
          }}>{l}</div>
        ))}
      </div>

      {/* metrics */}
      <div style={{ margin: "0 20px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { v: "247", l: "Work samples", c: SH.indigo },
          { v: "182", l: "Hours logged", c: SH.violet },
          { v: "3 / 3", l: "Quarterly evals", c: SH.green },
        ].map((m) => (
          <div key={m.l} style={{ background: "#fff", borderRadius: 14, padding: "12px 10px", border: `1px solid ${SH.line}`, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.c, letterSpacing: -0.4 }}>{m.v}</div>
            <div style={{ fontSize: 11, color: SH.ink2, fontWeight: 600, marginTop: 2 }}>{m.l}</div>
          </div>
        ))}
      </div>

      {/* filter row */}
      <div style={{ padding: "0 20px 10px", display: "flex", gap: 6, alignItems: "center" }}>
        <button style={{ background: "#fff", border: `1px solid ${SH.line}`, borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: SH.ink, display: "inline-flex", gap: 6, alignItems: "center" }}>
          {Icon.filter} All subjects
        </button>
        <button style={{ background: "#fff", border: `1px solid ${SH.line}`, borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 600, color: SH.ink2 }}>This quarter</button>
        <button style={{ marginLeft: "auto", background: SH.ink, color: "#fff", border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 700, display: "inline-flex", gap: 6, alignItems: "center" }}>
          {Icon.download} Export PDF
        </button>
      </div>

      {/* artifact list */}
      <div style={{ padding: "0 20px", display: "grid", gap: 8 }}>
        {[
          { d: "May 26", subj: "Science", c: SH.green, t: "Water containers — same volume?", k: "photo + reflection", pages: "3 pages", aut: true },
          { d: "May 24", subj: "LangArts", c: SH.indigo, t: "Sight word book — Set 6 mastered", k: "audio + worksheet", pages: "2 pages" },
          { d: "May 23", subj: "Math", c: SH.violet, t: "Place value — tens & ones", k: "photo of work", pages: "1 page" },
          { d: "May 22", subj: "Reading", c: SH.violet, t: "Chapter Q: Why does Edmund lie?", k: "transcribed answer", pages: "1 page" },
          { d: "May 21", subj: "Science", c: SH.green, t: "Egg Fortress — design log", k: "photos + drawings", pages: "5 pages" },
        ].map((a, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 14, padding: 12, border: `1px solid ${SH.line}`, display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: a.c + "18", color: a.c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11 }}>
              {a.subj.slice(0, 3).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: SH.ink, lineHeight: 1.3 }}>{a.t}</div>
              <div style={{ fontSize: 11, color: SH.ink3, marginTop: 3, display: "flex", gap: 6, alignItems: "center" }}>
                <span>{a.d}</span><span>·</span><span>{a.k}</span><span>·</span><span>{a.pages}</span>
                {a.aut && <span style={{ background: SH.greenSoft, color: SH.green, padding: "1px 6px", borderRadius: 4, fontWeight: 700, marginLeft: 4 }}>AUTO</span>}
              </div>
            </div>
            <div style={{ color: SH.ink3 }}>{Icon.chevron}</div>
          </div>
        ))}
      </div>

      <ParentTabBar active="records" />
    </div>
  );
}

// ===================== SHELLY AI CHAT =====================
function ShellyAI() {
  return (
    <div className="screen" style={{ background: SH.bg }}>
      <div style={{ padding: "16px 20px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg, ${SH.indigo}, ${SH.violet})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.sparkles}</div>
          <div>
            <div style={{ fontSize: 11, color: SH.ink3, fontWeight: 600 }}>Your homeschool co-pilot</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: SH.ink, letterSpacing: -0.2 }}>Shelly AI</div>
          </div>
          <div style={{ marginLeft: "auto", color: SH.ink2 }}>{Icon.more}</div>
        </div>
      </div>

      <div style={{ padding: "10px 20px 6px", display: "grid", gap: 10 }}>
        {/* Shelly msg */}
        <Bubble dir="bot">
          <div style={{ fontSize: 13.5, lineHeight: 1.55, textWrap: "pretty" }}>
            Lincoln finished 4 of 6 long-A items today. He hit flow on Reading Eggs again — that's 3 weeks running. Want a 5-minute test to see if long-A is sticking?
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <Mini>Build the test</Mini>
            <Mini ghost>Not today</Mini>
          </div>
        </Bubble>

        {/* user */}
        <Bubble dir="me">Build it. Make it gentle, audio for the words.</Bubble>

        <Bubble dir="bot">
          <div style={{ fontSize: 13.5, lineHeight: 1.55, textWrap: "pretty" }}>
            Built. 8 items, audio prompts, two re-tries each. Lincoln will see it tomorrow on Today as <b>"Long-A check"</b>. Want me to alert you when he's done?
          </div>
          <div style={{ marginTop: 10, padding: 10, background: "#f7f5fb", borderRadius: 10, border: `1px solid ${SH.line}` }}>
            <div style={{ fontSize: 11, color: SH.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>Preview</div>
            <div style={{ marginTop: 6, fontSize: 13, color: SH.ink, fontWeight: 600 }}>"Tap the picture that says the long-a sound."</div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {["rain", "rake", "rat", "ram"].map((w) => (
                <div key={w} style={{ flex: 1, padding: "12px 0", textAlign: "center", background: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${SH.line}` }}>{w}</div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <Mini>Yes, alert me</Mini>
            <Mini ghost>Edit questions</Mini>
          </div>
        </Bubble>

        <Bubble dir="bot" insight>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ color: SH.violet }}>{Icon.sparkles}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: SH.violet, letterSpacing: 0.4, textTransform: "uppercase" }}>Pattern · last 14 days</div>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6, color: SH.ink, textWrap: "pretty" }}>
            Mornings before 10am: 89% completion. After 2pm: 41%. I'll suggest schedule shifts.
          </div>
        </Bubble>
      </div>

      {/* composer */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 84, padding: "10px 14px", background: "rgba(245,245,247,0.85)", backdropFilter: "blur(20px)", borderTop: `1px solid ${SH.line}` }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#fff", borderRadius: 999, padding: "8px 14px", border: `1px solid ${SH.line}` }}>
          <span style={{ flex: 1, fontSize: 13.5, color: SH.ink3 }}>Ask Shelly anything…</span>
          <div style={{ color: SH.ink2 }}>{Icon.mic}</div>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: SH.indigo, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l14-7-5 14-2-7z" /></svg>
          </div>
        </div>
      </div>

      <ParentTabBar active="ai" />
    </div>
  );
}

function Bubble({ dir, children, insight }) {
  if (dir === "me") {
    return (
      <div style={{ alignSelf: "flex-end", maxWidth: "78%", marginLeft: "auto", background: SH.indigo, color: "#fff", padding: "10px 14px", borderRadius: 16, borderBottomRightRadius: 6, fontSize: 13.5, lineHeight: 1.5 }}>{children}</div>
    );
  }
  const bg = insight ? `linear-gradient(135deg, ${SH.indigoSoft}, #f5eef9)` : "#fff";
  return (
    <div style={{ maxWidth: "92%", background: bg, color: SH.ink, padding: 12, borderRadius: 16, borderBottomLeftRadius: 6, border: `1px solid ${SH.line}` }}>{children}</div>
  );
}

function Mini({ children, ghost }) {
  return (
    <span style={{
      padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
      background: ghost ? "transparent" : SH.indigo, color: ghost ? SH.ink2 : "#fff",
      border: ghost ? `1px solid ${SH.line}` : "none", cursor: "pointer",
    }}>{children}</span>
  );
}

Object.assign(window, {
  ShellyToday, ShellyPlan, ShellyLog, ShellyRecords, ShellyAI,
  SH, KidPill, Section, Block, Bubble, Mini,
});
