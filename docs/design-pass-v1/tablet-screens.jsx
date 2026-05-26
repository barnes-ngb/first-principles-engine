// Tablet layouts — landscape 1180×820. Takes the mobile screens and reflows
// them into the sidebar + multi-column patterns the existing AppShell uses.

// Tablet frame
function Tablet({ children, dark }) {
  return (
    <div style={{
      width: 1180, height: 820, background: "#0a0a0a",
      borderRadius: 32, padding: 14, boxSizing: "border-box",
      boxShadow: "0 40px 80px -20px rgba(0,0,0,0.3)",
      position: "relative",
    }}>
      {/* camera dot */}
      <div style={{ position: "absolute", top: 22, left: "50%", transform: "translateX(-50%)", width: 8, height: 8, borderRadius: "50%", background: "#1a1a1a", border: "1px solid #2a2a2a" }} />
      <div style={{
        width: "100%", height: "100%", overflow: "hidden",
        borderRadius: 22, position: "relative",
        background: dark ? "#0d120e" : SH.bg,
      }}>
        {children}
      </div>
    </div>
  );
}

// --- Shelly sidebar (matches app's AppShell) ---
function ShellySidebar({ active }) {
  const items = [
    "Today", "Plan My Week", "Weekly Review", "Progress", "Records",
    "Books", "Game Workshop", "Dad Lab", "Settings", "Ask AI",
  ];
  return (
    <aside style={{
      width: 220, height: "100%",
      borderRight: `1px solid ${SH.line}`, background: "#fff",
      padding: "20px 14px", boxSizing: "border-box",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      {/* profile row */}
      <div style={{ padding: "0 4px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: SH.indigo, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>P</div>
        <div style={{ fontWeight: 700, color: SH.ink, fontSize: 14 }}>Parents</div>
      </div>
      {/* kid pill */}
      <div style={{ padding: "0 4px 10px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px 3px 3px", border: `1px solid ${SH.line}`, borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#7e57c2", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>L</span>
          <span style={{ color: SH.indigo }}>Lincoln</span>
        </div>
      </div>
      {items.map((l) => {
        const on = l === active;
        return (
          <div key={l} style={{
            padding: "9px 12px", borderRadius: 10,
            background: on ? "rgba(0,0,0,0.06)" : "transparent",
            color: SH.ink, fontWeight: on ? 600 : 500, fontSize: 14,
          }}>{l}</div>
        );
      })}
    </aside>
  );
}

// --- Lincoln sidebar (pixel) ---
function LxSidebar({ active }) {
  const items = ["Today", "Knowledge Mine", "My Books", "Books About Me", "My Hero", "My Stuff", "Game Workshop", "Dad Lab"];
  return (
    <aside style={{
      width: 220, height: "100%",
      borderRight: `2px solid ${LX.border}`,
      background: "rgba(8,12,10,0.6)",
      padding: "20px 12px", boxSizing: "border-box",
      display: "flex", flexDirection: "column", gap: 4,
      fontFamily: monoFont,
    }}>
      <div style={{ padding: "0 4px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, background: "#7e57c2", color: "#fff", fontFamily: pixelFont, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${LX.border}` }}>?</div>
        <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.ink, letterSpacing: 1 }}>LINCOLN</div>
      </div>
      <div style={{ padding: "0 4px 10px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 4px", border: `2px solid ${LX.green}`, fontFamily: pixelFont, fontSize: 9, color: LX.green, letterSpacing: 1 }}>
          <span style={{ width: 18, height: 18, background: LX.green, color: "#000", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>L</span>
          LINCOLN
        </div>
      </div>
      {items.map((l) => {
        const on = l === active;
        return (
          <div key={l} style={{
            padding: "9px 10px",
            background: on ? "rgba(126,252,32,0.1)" : "transparent",
            borderLeft: on ? `3px solid ${LX.green}` : "3px solid transparent",
            color: on ? LX.green : LX.ink2,
            fontFamily: monoFont, fontSize: 13, fontWeight: on ? 700 : 400,
          }}>{l}</div>
        );
      })}
    </aside>
  );
}

// ===================== TABLET — Shelly Today =====================
function TabletShellyToday() {
  return (
    <div style={{ display: "flex", height: "100%", fontFamily: 'Inter, system-ui, sans-serif' }}>
      <ShellySidebar active="Today" />
      <main style={{ flex: 1, padding: "24px 28px", overflowY: "auto", background: SH.bg }}>
        {/* topbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: SH.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>Tuesday · May 26 · 2:24 PM</div>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: "4px 0 0", color: SH.ink, letterSpacing: -0.5 }}>Today</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ padding: "8px 14px", borderRadius: 999, background: SH.greenSoft, color: SH.green, fontWeight: 600, fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SH.green }} />
              Daily Log saved
            </div>
            <button style={{ padding: "8px 14px", background: "#fff", border: `1px solid ${SH.line}`, borderRadius: 999, fontWeight: 600, fontSize: 13, color: SH.ink2 }}>+ Add note</button>
          </div>
        </div>

        {/* week strip */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
          {[
            { d: "Mon 25", v: 2.4, on: false, done: 7, of: 7 },
            { d: "Tue 26", v: 0.6, on: true, done: 1, of: 7 },
            { d: "Wed 27", v: 0, on: false },
            { d: "Thu 28", v: 0, on: false },
            { d: "Fri 29", v: 0, on: false },
          ].map((d) => (
            <div key={d.d} style={{
              background: "#fff", borderRadius: 12, padding: "10px 12px",
              border: d.on ? `1.5px solid ${SH.indigo}` : `1px solid ${SH.line}`,
            }}>
              <div style={{ fontSize: 11, color: SH.ink3, fontWeight: 600 }}>{d.d.split(" ")[0]}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: SH.ink }}>{d.v}h</div>
              {d.done !== undefined && <div style={{ fontSize: 11, color: SH.ink2, marginTop: 2 }}>{d.done}/{d.of} blocks</div>}
              {d.done === undefined && <div style={{ fontSize: 11, color: SH.ink3, marginTop: 2 }}>planned</div>}
            </div>
          ))}
        </div>

        {/* two kid columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Lincoln */}
          <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${SH.line}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${SH.line}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#5A8C32", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>L</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: SH.ink, fontSize: 15 }}>Lincoln</div>
                <div style={{ fontSize: 12, color: SH.ink2 }}>3.1h planned · normal energy</div>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: SH.greenSoft, color: SH.green }}>1 / 7 done</div>
            </div>
            <div style={{ padding: 8 }}>
              {[
                { l: "Initial sounds — set 3", m: 15, d: true, t: "Language Arts", c: SH.indigo },
                { l: "Long-A pattern: ai/ay", m: 20, t: "Language Arts", c: SH.indigo },
                { l: "Rhyming word ladder", m: 10, t: "Language Arts", c: SH.indigo },
                { l: "Reading Eggs", m: 15, t: "Reading · app", c: SH.violet },
                { l: "Chapter 14 read-aloud", m: 20, t: "Reading", c: SH.violet },
                { l: "Place value · tens & ones", m: 15, t: "Math", c: SH.amber },
                { l: "Typing club", m: 15, t: "Other · app", c: SH.amber },
              ].map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 10px", borderRadius: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${b.d ? SH.green : SH.line}`, background: b.d ? SH.green : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{b.d ? Icon.check : null}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: b.d ? SH.ink3 : SH.ink, textDecoration: b.d ? "line-through" : "none" }}>{b.l}</div>
                    <div style={{ fontSize: 11, color: SH.ink3, marginTop: 1 }}>
                      <span style={{ color: b.c, fontWeight: 600 }}>{b.t}</span> · {b.m} min
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* London */}
          <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${SH.line}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${SH.line}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#E52521", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>L</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: SH.ink, fontSize: 15 }}>London</div>
                <div style={{ fontSize: 12, color: SH.ink2 }}>1.8h planned · playful energy</div>
              </div>
              <div style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: SH.amberSoft, color: SH.amber }}>0 / 5 done</div>
            </div>
            <div style={{ padding: 8 }}>
              {[
                { l: "ABC scavenger hunt", m: 20, t: "Pre-reading", c: "#E52521" },
                { l: "Counting bears 1-20", m: 15, t: "Math", c: "#FBD000" },
                { l: "Story: Pete the Cat", m: 15, t: "Read-aloud", c: "#E52521" },
                { l: "Art: rainbow tape resist", m: 30, t: "Art", c: SH.violet },
                { l: "Outside time", m: 30, t: "Body", c: SH.green },
              ].map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 10px", borderRadius: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${SH.line}`, background: "#fff", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: SH.ink }}>{b.l}</div>
                    <div style={{ fontSize: 11, color: SH.ink3, marginTop: 1 }}>
                      <span style={{ color: b.c, fontWeight: 600 }}>{b.t}</span> · {b.m} min
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* shelly insight bottom */}
        <div style={{ marginTop: 16, padding: 16, borderRadius: 16, background: `linear-gradient(135deg, ${SH.indigoSoft}, #f5eef9)`, border: `1px solid ${SH.indigo}22`, display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ color: SH.indigo }}>{Icon.sparkles}</div>
          <div style={{ flex: 1, fontSize: 13.5, color: SH.ink, lineHeight: 1.5, textWrap: "pretty" }}>
            <b>Shelly:</b> Lincoln hit flow on Reading Eggs again today — 3 weeks running. Want a 5-minute long-A check tomorrow?
          </div>
          <button style={{ background: SH.indigo, color: "#fff", border: "none", borderRadius: 999, padding: "9px 16px", fontWeight: 600, fontSize: 13 }}>Build it</button>
          <button style={{ background: "transparent", color: SH.ink2, border: `1px solid ${SH.line}`, borderRadius: 999, padding: "9px 14px", fontWeight: 600, fontSize: 13 }}>Not yet</button>
        </div>
      </main>
    </div>
  );
}

// ===================== TABLET — Shelly Plan + chat =====================
function TabletShellyPlan() {
  return (
    <div style={{ display: "flex", height: "100%", fontFamily: 'Inter, system-ui, sans-serif' }}>
      <ShellySidebar active="Plan My Week" />
      <main style={{ flex: 1, display: "grid", gridTemplateColumns: "1.1fr 0.9fr", overflow: "hidden", background: SH.bg }}>
        {/* left: plan */}
        <div style={{ padding: "24px 24px", overflowY: "auto", borderRight: `1px solid ${SH.line}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: SH.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>Week 22 · May 25 – May 31</div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: "4px 0 14px", color: SH.ink, letterSpacing: -0.4 }}>Plan My Week</h1>

          {/* applied banner */}
          <div style={{ padding: 14, background: SH.greenSoft, border: `1px solid ${SH.green}22`, borderRadius: 14, display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: SH.green, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: SH.green }}>Plan applied · Lincoln's week is ready</div>
              <div style={{ fontSize: 12, color: "#256e3d" }}>3.1h/day · 32 blocks · 4 subjects</div>
            </div>
          </div>

          {/* coverage block */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 18, border: `1px solid ${SH.line}`, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: SH.ink3, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 12 }}>Coverage this week</div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { l: "Language Arts", v: 12, of: 12, c: SH.indigo, sub: "initial 3x · long-a 2x · rhyming 1x" },
                { l: "Reading", v: 16, of: 16, c: SH.violet, sub: "wh-questions 2x · sight words" },
                { l: "Math", v: 8, of: 10, c: SH.amber, sub: "place value · counting on" },
                { l: "Science / Other", v: 4, of: 4, c: SH.green, sub: "water shapes · typing" },
              ].map((s) => (
                <div key={s.l}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: SH.ink }}>{s.l}</div>
                    <div style={{ fontSize: 12, color: SH.ink2 }}>{s.v} / {s.of} blocks</div>
                  </div>
                  <div style={{ height: 8, background: SH.bg, borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(s.v / s.of) * 100}%`, background: s.c }} />
                  </div>
                  <div style={{ fontSize: 11, color: SH.ink3, marginTop: 4 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* read-aloud */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 14, border: `1px solid ${SH.line}`, display: "flex", gap: 12 }}>
            <div style={{ width: 60, height: 82, borderRadius: 6, background: "linear-gradient(135deg,#7c3a1f,#3d1d10)", color: "#f3d997", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 6, fontSize: 9, fontWeight: 700, lineHeight: 1.1 }}>
              <div style={{ opacity: 0.7 }}>C.S. LEWIS</div>
              <div>LWW</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: SH.ink3, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Read-aloud book</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: SH.ink, margin: "2px 0" }}>The Lion, the Witch &amp; the Wardrobe</div>
              <div style={{ fontSize: 12, color: SH.ink2, marginBottom: 6 }}>Chapter 14 tonight · 13 of 17 chapter questions answered</div>
              <div style={{ height: 6, background: SH.bg, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(13 / 17) * 100}%`, background: SH.indigo }} />
              </div>
            </div>
          </div>
        </div>

        {/* right: chat */}
        <div style={{ display: "flex", flexDirection: "column", background: "#fafafd" }}>
          <div style={{ padding: "20px 22px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${SH.line}` }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${SH.indigo}, ${SH.violet})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{Icon.sparkles}</div>
            <div>
              <div style={{ fontWeight: 700, color: SH.ink, fontSize: 15 }}>Plan with Shelly</div>
              <div style={{ fontSize: 11, color: SH.ink3 }}>Free-form · she'll do the math</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "grid", gap: 10 }}>
            <Bubble dir="bot">
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>Lincoln's plan looks balanced. Anything to tweak?</div>
            </Bubble>
            <Bubble dir="me">Light Wednesday — we have a doctor's appt at 10.</Bubble>
            <Bubble dir="bot">
              <div style={{ fontSize: 13.5, lineHeight: 1.55, textWrap: "pretty" }}>Capped Wed at 1.5h. Moved math &amp; typing to Thursday. Read-aloud still on for the evening.</div>
              <div style={{ marginTop: 10, padding: 10, background: "#fff", border: `1px solid ${SH.line}`, borderRadius: 10, fontSize: 12, color: SH.ink2 }}>
                <b style={{ color: SH.ink }}>Wed (1.5h)</b><br />Reading Eggs · Pete the Cat read-aloud · 10-min phonics
              </div>
            </Bubble>
            <Bubble dir="me">Perfect. And add a Dad Lab on Friday?</Bubble>
            <Bubble dir="bot">
              <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>Done. Picked <b>The Water Filter Challenge</b> from Dad Lab. Materials list went to your Notes.</div>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <Mini>Apply</Mini>
                <Mini ghost>See details</Mini>
              </div>
            </Bubble>
          </div>

          <div style={{ padding: 14, borderTop: `1px solid ${SH.line}` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#fff", borderRadius: 999, padding: "9px 14px", border: `1px solid ${SH.line}` }}>
              <span style={{ flex: 1, fontSize: 13.5, color: SH.ink3 }}>Tell Shelly anything…</span>
              <div style={{ color: SH.ink2 }}>{Icon.mic}</div>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: SH.indigo, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l14-7-5 14-2-7z" /></svg>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ===================== TABLET — Records table =====================
function TabletShellyRecords() {
  const rows = [
    { d: "May 26", s: "Science", c: SH.green, t: "Water containers — same volume?", k: "photo + reflection", p: "3 pp", aut: true, t2: "London", t2c: "#E52521" },
    { d: "May 26", s: "Reading", c: SH.violet, t: "Reading Eggs · Lesson 84", k: "auto-log · 15 min", p: "log", aut: true, t2: "Lincoln", t2c: "#5A8C32" },
    { d: "May 24", s: "LangArts", c: SH.indigo, t: "Sight word book — Set 6 mastered", k: "audio + worksheet", p: "2 pp", t2: "Lincoln", t2c: "#5A8C32" },
    { d: "May 23", s: "Math", c: SH.amber, t: "Place value — tens & ones", k: "photo of work", p: "1 p", t2: "Lincoln", t2c: "#5A8C32" },
    { d: "May 22", s: "Reading", c: SH.violet, t: "Chapter Q: Why does Edmund lie?", k: "transcribed answer", p: "1 p", t2: "Lincoln", t2c: "#5A8C32" },
    { d: "May 21", s: "Science", c: SH.green, t: "Egg Fortress — design log", k: "photos + drawings", p: "5 pp", t2: "Lincoln", t2c: "#5A8C32" },
    { d: "May 21", s: "Art", c: SH.violet, t: "Rainbow tape resist", k: "photo", p: "1 p", t2: "London", t2c: "#E52521" },
    { d: "May 20", s: "Reading", c: SH.violet, t: "Pete the Cat — narrative retell", k: "voice memo", p: "audio", t2: "London", t2c: "#E52521" },
  ];
  return (
    <div style={{ display: "flex", height: "100%", fontFamily: 'Inter, system-ui, sans-serif' }}>
      <ShellySidebar active="Records" />
      <main style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 280px", overflow: "hidden", background: SH.bg }}>
        <div style={{ padding: "24px 28px", overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: SH.ink3, letterSpacing: 0.6, textTransform: "uppercase" }}>Portfolio · Q4 2025-26</div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: "4px 0 14px", color: SH.ink, letterSpacing: -0.4 }}>Records</h1>

          {/* tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${SH.line}` }}>
            {[["Portfolio", true], ["Attendance", false], ["Evaluations", false], ["Books read", false]].map(([l, on], i) => (
              <div key={i} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: on ? SH.ink : SH.ink2, borderBottom: on ? `2px solid ${SH.indigo}` : "2px solid transparent", marginBottom: -1 }}>{l}</div>
            ))}
          </div>

          {/* metrics row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { v: "247", l: "Work samples", c: SH.indigo },
              { v: "182h", l: "Hours logged", c: SH.violet },
              { v: "3/3", l: "Quarterly evals", c: SH.green },
              { v: "18", l: "Books read", c: SH.amber },
            ].map((m) => (
              <div key={m.l} style={{ background: "#fff", borderRadius: 12, padding: "12px 14px", border: `1px solid ${SH.line}` }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: m.c, letterSpacing: -0.5 }}>{m.v}</div>
                <div style={{ fontSize: 12, color: SH.ink2, fontWeight: 600, marginTop: 2 }}>{m.l}</div>
              </div>
            ))}
          </div>

          {/* filter row */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
            {["All subjects", "Lincoln", "London", "This quarter", "Auto-collected"].map((l, i) => (
              <button key={l} style={{ background: i === 0 ? SH.ink : "#fff", color: i === 0 ? "#fff" : SH.ink2, border: `1px solid ${SH.line}`, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600 }}>{l}</button>
            ))}
          </div>

          {/* table */}
          <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${SH.line}`, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "70px 100px 1fr 160px 110px 60px 24px", gap: 12, padding: "10px 16px", fontSize: 11, color: SH.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", borderBottom: `1px solid ${SH.line}`, background: SH.bg }}>
              <div>Date</div><div>Subject</div><div>Sample</div><div>Type</div><div>Child</div><div>Size</div><div></div>
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 100px 1fr 160px 110px 60px 24px", gap: 12, padding: "12px 16px", fontSize: 13, color: SH.ink, alignItems: "center", borderBottom: i < rows.length - 1 ? `1px solid ${SH.line}` : "none" }}>
                <div style={{ color: SH.ink2, fontVariantNumeric: "tabular-nums" }}>{r.d}</div>
                <div><span style={{ padding: "3px 8px", borderRadius: 6, background: r.c + "18", color: r.c, fontSize: 11, fontWeight: 700 }}>{r.s}</span></div>
                <div style={{ fontWeight: 500 }}>{r.t}</div>
                <div style={{ color: SH.ink2, fontSize: 12 }}>{r.k} {r.aut && <span style={{ background: SH.greenSoft, color: SH.green, padding: "1px 5px", borderRadius: 4, fontWeight: 700, fontSize: 10, marginLeft: 4 }}>AUTO</span>}</div>
                <div style={{ fontSize: 12, color: r.t2c, fontWeight: 600 }}>{r.t2}</div>
                <div style={{ color: SH.ink3, fontSize: 12 }}>{r.p}</div>
                <div style={{ color: SH.ink3 }}>{Icon.chevron}</div>
              </div>
            ))}
          </div>
        </div>

        {/* sidebar right: export & required */}
        <aside style={{ padding: "24px 22px", borderLeft: `1px solid ${SH.line}`, background: "#fff", overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: SH.ink3, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 10 }}>State checklist · NY</div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              { l: "Quarterly report Q4", on: true },
              { l: "Attendance log (180d)", on: true, prog: 0.92 },
              { l: "Subject coverage", on: true },
              { l: "Annual evaluation", prog: 0.4 },
            ].map((c) => (
              <div key={c.l} style={{ padding: 10, borderRadius: 10, border: `1px solid ${SH.line}`, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: c.on ? SH.green : "#fff", border: `1.5px solid ${c.on ? SH.green : SH.line}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{c.on && Icon.check}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: SH.ink }}>{c.l}</div>
                  {c.prog !== undefined && (
                    <div style={{ marginTop: 4, height: 4, background: SH.bg, borderRadius: 999 }}>
                      <div style={{ height: "100%", width: `${c.prog * 100}%`, background: SH.indigo, borderRadius: 999 }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: `linear-gradient(135deg, ${SH.indigo}, ${SH.violet})`, color: "#fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.85 }}>Quarterly export</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6, lineHeight: 1.3 }}>Bundle everything Q4 in one PDF.</div>
            <button style={{ marginTop: 12, width: "100%", padding: "10px", borderRadius: 8, background: "#fff", color: SH.indigo, fontWeight: 700, fontSize: 13, border: "none", display: "flex", justifyContent: "center", gap: 6, alignItems: "center" }}>
              {Icon.download} Export PDF
            </button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: SH.ink2, lineHeight: 1.5, textWrap: "pretty" }}>
            We auto-pull from Today logs, app sessions (Reading Eggs, Typing Club), and Dad Lab photos. You only confirm.
          </div>
        </aside>
      </main>
    </div>
  );
}

// ===================== TABLET — Lincoln Hub =====================
function TabletLincolnHub() {
  return (
    <div style={{ display: "flex", height: "100%", background: LX.bg, color: LX.ink,
      backgroundImage: "linear-gradient(rgba(90,140,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,50,0.06) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    }}>
      <LxSidebar active="My Hero" />

      <main style={{ flex: 1, padding: "22px 26px", overflowY: "auto" }}>
        {/* topbar */}
        <div style={{ ...pixelBox(), padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, fontFamily: pixelFont, fontSize: 11, color: LX.green, letterSpacing: 1 }}>
          <span>HERO HUB · STONEBRIDGE</span>
          <span style={{ display: "flex", gap: 16 }}>
            <span style={{ color: LX.cyan }}>◆ 1,163 XP</span>
            <span style={{ color: LX.gold }}>◆ 27 GOLD</span>
            <span style={{ color: LX.cyan }}>IRON tier</span>
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 14 }}>
          {/* big hero scene */}
          <div style={{ ...pixelBox({ background: "linear-gradient(180deg, #1a1d3a 0%, #0a0d24 60%, #050818 100%)" }), height: 460, position: "relative", overflow: "hidden" }}>
            {/* stars */}
            {Array.from({ length: 30 }).map((_, i) => (
              <div key={i} style={{ position: "absolute", left: (i * 47) % 700, top: (i * 89) % 280, width: 2, height: 2, background: "#fff", opacity: 0.4 + (i % 3) * 0.2 }} />
            ))}
            {/* moon */}
            <div style={{ position: "absolute", right: 50, top: 36, width: 44, height: 44, background: LX.gold, boxShadow: `0 0 0 3px #b89530, 0 0 40px ${LX.gold}aa` }} />
            <div style={{ position: "absolute", right: 90, top: 60, width: 12, height: 12, background: "#0a0d24" }} />
            {/* ground */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 80, background: "linear-gradient(180deg, #2a2d4a, #1a1d34)", borderTop: `3px solid ${LX.borderHi}` }} />
            {/* pedestal */}
            <div style={{ position: "absolute", left: "50%", bottom: 60, transform: "translateX(-50%)", width: 90, height: 18, background: "#3a3d54", border: `2px solid ${LX.borderHi}` }} />
            {/* hero scaled up */}
            <div style={{ position: "absolute", left: "50%", bottom: 78, transform: "translateX(-50%) scale(2)", transformOrigin: "bottom center" }}>
              <PixelHero />
            </div>
            {/* tier badge */}
            <div style={{ position: "absolute", left: 16, top: 16, padding: "8px 14px", background: "rgba(0,0,0,0.7)", border: `2px solid ${LX.cyan}`, fontFamily: pixelFont, fontSize: 10, color: LX.cyan, letterSpacing: 1 }}>
              IRON ⚔ LV 27
            </div>
            {/* emote bar */}
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 12, display: "flex", gap: 6, justifyContent: "center" }}>
              {["⚔", "🛡", "🙏", "👋", "🤜", "😎"].map((e, i) => (
                <div key={i} style={{ width: 38, height: 38, border: `2px solid ${LX.border}`, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontFamily: monoFont }}>{e}</div>
              ))}
            </div>
          </div>

          {/* right column */}
          <div style={{ display: "grid", gap: 12 }}>
            {/* mission */}
            <div style={{ ...pixelBox({ borderColor: LX.cyan, boxShadow: `0 0 0 2px ${LX.cyan}22, 4px 4px 0 rgba(0,0,0,0.5)` }), padding: 14 }}>
              <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.gold, letterSpacing: 2 }}>⚡ TODAY'S MISSION</div>
              <div style={{ fontFamily: monoFont, fontSize: 13, color: LX.gold, marginTop: 8, lineHeight: 1.5 }}>
                Your armor rests beside you.<br />Time to put it on again.
              </div>
              <div style={{ marginTop: 10 }}>
                <PxButton color={LX.cyan} glow fullw big>SUIT UP &amp; BEGIN →</PxButton>
              </div>
            </div>

            {/* stonebridge quest */}
            <div style={{ ...pixelBox({ background: LX.bg3 }), padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 8, color: LX.green, letterSpacing: 1 }}>
                <span>🏰 STONEBRIDGE</span><span style={{ color: LX.ink2 }}>WEEK 1</span>
              </div>
              <div style={{ fontFamily: monoFont, fontSize: 12, color: LX.ink, marginTop: 6, lineHeight: 1.4 }}>
                Banner Rally — your reading repairs Stonebridge. 4 of 24 stones placed.
              </div>
              <div style={{ marginTop: 8, height: 8, background: "#0a0a0a", border: `1px solid ${LX.border}` }}>
                <div style={{ height: "100%", width: "18%", background: LX.green }} />
              </div>
            </div>

            {/* xp bar */}
            <div style={{ ...pixelBox(), padding: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 9, color: LX.gold, marginBottom: 8 }}>
                <span style={{ color: LX.cyan }}>◆ 27</span>
                <span>XP 1,163 / 1,500</span>
                <span style={{ color: LX.cyan }}>IRON</span>
              </div>
              <div style={{ height: 14, background: "#0a0a0a", border: `2px solid ${LX.border}`, position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, width: "77%", background: `linear-gradient(180deg, ${LX.green} 0%, #5BC010 50%, ${LX.greenDeep} 100%)`, boxShadow: "inset 0 2px 0 rgba(255,255,255,0.25)" }} />
              </div>
              <div style={{ fontFamily: monoFont, fontSize: 10, color: LX.ink2, marginTop: 6, textAlign: "center" }}>+ 337 XP to STEEL</div>
            </div>

            {/* mini next-action grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { ic: "⛏", l: "MINE", c: LX.green, n: "4 today" },
                { ic: "🎲", l: "WORKSHOP", c: LX.cyan, n: "new" },
                { ic: "▤", l: "BOOKS", c: LX.gold, n: "Ch 14" },
              ].map((x) => (
                <div key={x.l} style={{ ...pixelBox({ background: LX.bg2 }), padding: "14px 6px", textAlign: "center", color: x.c, fontFamily: pixelFont, fontSize: 8 }}>
                  <div style={{ fontSize: 24, marginBottom: 4, fontFamily: monoFont }}>{x.ic}</div>
                  {x.l}
                  <div style={{ marginTop: 4, fontSize: 7, color: LX.ink2 }}>{x.n}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ===================== TABLET — Lincoln Forge =====================
function TabletLincolnForge() {
  return (
    <div style={{ display: "flex", height: "100%", background: LX.bg, color: LX.ink,
      backgroundImage: "linear-gradient(rgba(90,140,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,50,0.06) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    }}>
      <LxSidebar active="My Hero" />
      <main style={{ flex: 1, padding: "22px 26px", overflowY: "auto" }}>
        <div style={{ ...pixelBox(), padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, fontFamily: pixelFont, fontSize: 11, color: LX.green, letterSpacing: 1 }}>
          <span>ARMOR FORGE</span>
          <span style={{ color: LX.ink2, fontSize: 9 }}>2 OF 6 IRON PIECES FORGED</span>
        </div>

        {/* tier toggle */}
        <div style={{ marginBottom: 14, display: "flex", gap: 6 }}>
          {[
            ["WOOD", "✓", LX.ink2, false],
            ["STONE", "✓", LX.ink2, false],
            ["IRON", "◆", LX.green, true],
            ["STEEL", "🔒", LX.ink3, false],
            ["DIAMOND", "🔒", LX.ink3, false],
          ].map(([l, ic, c, on]) => (
            <div key={l} style={{
              padding: "10px 22px", textAlign: "center",
              fontFamily: pixelFont, fontSize: 9,
              border: `2px solid ${on ? LX.green : LX.border}`,
              background: on ? "#1a2d18" : "transparent",
              color: c, letterSpacing: 1,
              boxShadow: on ? `0 0 0 2px ${LX.green}33` : "none",
              display: "flex", gap: 8, alignItems: "center",
            }}>
              <span style={{ fontSize: 12 }}>{ic}</span>
              {l}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 14 }}>
          {/* hero preview */}
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ ...pixelBox({ background: "linear-gradient(180deg, #181f2a, #0c1118)" }), height: 280, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 50, background: "#23303a", borderTop: `2px solid ${LX.borderHi}` }} />
              <div style={{ position: "absolute", left: "50%", top: 36, transform: "translateX(-50%) scale(1.6)" }}><PixelHero /></div>
              <div style={{ position: "absolute", left: 12, top: 12, fontFamily: pixelFont, fontSize: 8, color: LX.cyan }}>◆ 1,163 XP</div>
              <div style={{ position: "absolute", right: 12, top: 12, fontFamily: pixelFont, fontSize: 8, color: LX.gold }}>◆ 27 GOLD</div>
              <div style={{ position: "absolute", left: 12, bottom: 12, fontFamily: pixelFont, fontSize: 8, color: LX.green }}>STONE TIER ARMOR</div>
            </div>
            {/* stats */}
            <div style={{ ...pixelBox(), padding: 14 }}>
              <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.green, marginBottom: 10, letterSpacing: 1 }}>FAITH STATS</div>
              {[
                ["STRENGTH", 18, LX.green],
                ["WISDOM", 24, LX.cyan],
                ["MERCY", 12, LX.rose],
                ["COURAGE", 31, LX.gold],
              ].map(([l, v, c]) => (
                <div key={l} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 8, color: c, marginBottom: 4 }}>
                    <span>{l}</span><span>+{v}</span>
                  </div>
                  <div style={{ height: 8, background: "#0a0a0a", border: `1px solid ${LX.border}` }}>
                    <div style={{ height: "100%", width: `${v * 3}%`, background: c }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* forge grid */}
          <div>
            <div style={{ padding: 12, background: "#221c08", border: `2px solid ${LX.gold}`, fontFamily: monoFont, fontSize: 12, color: LX.gold, lineHeight: 1.5, textAlign: "center", marginBottom: 12 }}>
              Your armor rests beside you. Time to put it on again.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { l: "Belt of Truth", ic: BeltSVG, cur: null, cost: null, state: "equip", new: true },
                { l: "Breastplate", ic: BreastSVG, cur: "Stone", cost: 35, state: "upgrade" },
                { l: "Shoes of Peace", ic: ShoesSVG, cur: null, cost: null, state: "equip", new: true },
                { l: "Shield of Faith", ic: ShieldSVG, cur: "Stone", cost: 40, state: "upgrade" },
                { l: "Helmet", ic: HelmetSVG, cur: "Stone", cost: 40, state: "upgrade" },
                { l: "Sword", ic: SwordSVG, cur: "Stone", cost: 45, state: "upgrade" },
              ].map((it) => (
                <div key={it.l} style={{ ...pixelBox(), padding: 10, position: "relative" }}>
                  {it.new && <div style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, background: LX.gold, color: "#000", fontFamily: pixelFont, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${LX.bg}` }}>!</div>}
                  <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a1010", border: `2px solid ${LX.border}`, marginBottom: 8 }}>
                    <div style={{ transform: "scale(1.6)" }}><it.ic /></div>
                  </div>
                  <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.ink, lineHeight: 1.4, height: 28 }}>{it.l}</div>
                  {it.cur && <div style={{ fontFamily: monoFont, fontSize: 10, color: LX.ink3, marginTop: 2 }}>Current: {it.cur}</div>}
                  <div style={{ marginTop: 6, padding: "6px 0", textAlign: "center", border: `1.5px solid ${it.state === "equip" ? LX.green : LX.gold}`, color: it.state === "equip" ? LX.green : LX.gold, fontFamily: pixelFont, fontSize: 9 }}>
                    {it.cost ? `◆${it.cost} ` : ""}{it.state.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ===================== TABLET — Lincoln Mine =====================
function TabletLincolnMine() {
  return (
    <div style={{ display: "flex", height: "100%", background: LX.bg, color: LX.ink,
      backgroundImage: "linear-gradient(rgba(90,140,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,50,0.06) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    }}>
      <LxSidebar active="Knowledge Mine" />
      <main style={{ flex: 1, padding: "22px 26px", overflowY: "auto" }}>
        <div style={{ ...pixelBox(), padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, fontFamily: pixelFont, fontSize: 11, color: LX.green, letterSpacing: 1 }}>
          <span>KNOWLEDGE MINE · DAY 28</span>
          <span style={{ color: LX.gold, fontSize: 9 }}>4 OF 6 BLOCKS TODAY</span>
        </div>

        {/* depth meter */}
        <div style={{ ...pixelBox(), padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 10, color: LX.ink2, marginBottom: 10 }}>
            <span>⛏ MINING DEPTH · WEEK 22</span>
            <span style={{ color: LX.green }}>LEVEL 27 → 28</span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: 28 }, (_, i) => (
              <div key={i} style={{
                flex: 1, height: 24,
                background: i < 22 ? LX.green : i === 22 ? LX.gold : "#0a0a0a",
                border: `1px solid ${LX.border}`,
                boxShadow: i < 22 ? "inset 0 -4px 0 rgba(0,0,0,0.3)" : "none",
              }} />
            ))}
          </div>
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontFamily: monoFont, fontSize: 11, color: LX.ink2 }}>
            <span>22 blocks mined</span>
            <span>6 to break through to STEEL</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
          {/* ore grid */}
          <div>
            <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.gold, letterSpacing: 1, margin: "0 4px 10px" }}>TODAY'S VEIN · 4 ORE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { sub: "LANGUAGE ARTS", task: "Long-A pattern · ai/ay", mins: 20, ore: "EMERALD", oc: LX.green, done: false, xp: 25 },
                { sub: "READING", task: "Reading Eggs · L84", mins: 15, ore: "DIAMOND", oc: LX.cyan, done: true, xp: 25 },
                { sub: "MATH", task: "Place value · tens & ones", mins: 15, ore: "AMETHYST", oc: "#b388ff", done: false, xp: 25 },
                { sub: "SCIENCE", task: "Water Shapes · same vol?", mins: 25, ore: "GOLD", oc: LX.gold, done: false, xp: 30 },
              ].map((b, i) => (
                <div key={i} style={{
                  ...pixelBox({ background: b.done ? "#1a2a18" : LX.bg2, borderColor: b.done ? LX.green : LX.border }),
                  padding: 14, display: "flex", gap: 12, alignItems: "center",
                }}>
                  <div style={{ width: 60, height: 60, background: b.oc, border: `2px solid ${LX.border}`, position: "relative", boxShadow: "inset 0 -5px 0 rgba(0,0,0,0.3), inset 0 5px 0 rgba(255,255,255,0.2)", flexShrink: 0 }}>
                    <div style={{ position: "absolute", inset: 8, background: `${b.oc}55`, boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.3)" }} />
                    {b.done && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: pixelFont, fontSize: 24, color: LX.green }}>✓</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: pixelFont, fontSize: 7, color: b.oc, letterSpacing: 1 }}>{b.sub}</div>
                    <div style={{ fontFamily: monoFont, fontSize: 13, color: LX.ink, marginTop: 5, lineHeight: 1.4 }}>{b.task}</div>
                    <div style={{ fontFamily: monoFont, fontSize: 10, color: LX.ink2, marginTop: 4 }}>
                      {b.done ? `✓ Mined · +${b.xp} XP` : `${b.mins} min · +${b.xp} XP`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI quest panel */}
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ ...pixelBox({ borderColor: LX.cyan, boxShadow: `0 0 0 2px ${LX.cyan}22, 4px 4px 0 rgba(0,0,0,0.5)` }), padding: 14 }}>
              <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.cyan, letterSpacing: 1 }}>⚡ NEW QUEST · FROM MOM</div>
              <div style={{ fontFamily: monoFont, fontSize: 12, color: LX.ink, marginTop: 8, lineHeight: 1.5 }}>
                A 5-minute long-A check. 8 words. Two re-tries each. No judge.
              </div>
              <div style={{ marginTop: 12, padding: 12, background: "#0a0a0a", border: `2px solid ${LX.border}` }}>
                <div style={{ fontFamily: monoFont, fontSize: 10, color: LX.ink2 }}>QUESTION 1 OF 8</div>
                <div style={{ fontFamily: pixelFont, fontSize: 10, color: LX.gold, marginTop: 8, lineHeight: 1.6 }}>
                  🔊 "Tap the word that says the long-A sound."
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
                  {["RAIN", "RAT", "RAKE", "RAM"].map((w) => (
                    <div key={w} style={{ padding: "12px 0", textAlign: "center", border: `2px solid ${LX.border}`, fontFamily: pixelFont, fontSize: 10, color: LX.ink, background: "#152221" }}>{w}</div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <PxButton color={LX.cyan} glow fullw>BEGIN · +60 XP</PxButton>
              </div>
            </div>

            <div style={{ ...pixelBox({ background: LX.bg3 }), padding: 12 }}>
              <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.green, letterSpacing: 1 }}>📜 STREAK · 5 DAYS</div>
              <div style={{ fontFamily: monoFont, fontSize: 11, color: LX.ink, marginTop: 6, lineHeight: 1.5 }}>
                Five days of mining in a row. Tomorrow earns a Stonebridge banner.
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 14, background: i < 5 ? LX.green : "#0a0a0a", border: `1px solid ${LX.border}` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

Object.assign(window, {
  Tablet, TabletShellyToday, TabletShellyPlan, TabletShellyRecords,
  TabletLincolnHub, TabletLincolnForge, TabletLincolnMine,
});
