// Lincoln's hero screens — pixel/Minecraft aesthetic.
// Dark BG, Press Start 2P headings, Space Mono body, neon-green accents.

const LX = {
  bg: "#0f1614",          // dark stone
  bg2: "#152221",         // panel
  bg3: "#1a2a26",         // raised
  ink: "#c6e6c8",         // body
  ink2: "#7da482",        // muted
  ink3: "#4d6b54",        // dim
  green: "#7EFC20",       // XP green
  greenDeep: "#3A8008",
  cyan: "#5DECF5",
  gold: "#FCDB5B",
  rose: "#FF6B6B",
  border: "#284035",
  borderHi: "#3a5e4d",
  shadow: "0 0 0 2px rgba(0,0,0,0.4), 4px 4px 0 0 rgba(0,0,0,0.5)",
};

const pixelFont = `"Press Start 2P", "Courier New", monospace`;
const monoFont = `"Space Mono", "Courier New", monospace`;

// shared box style — a Minecraft panel
function pixelBox(extra) {
  return {
    background: LX.bg2,
    border: `2px solid ${LX.border}`,
    boxShadow: "4px 4px 0 0 rgba(0,0,0,0.45)",
    ...(extra || {}),
  };
}

// shared header pill
function HeroHeader({ title, right }) {
  return (
    <div style={{
      margin: "8px 14px 12px",
      padding: "10px 14px",
      ...pixelBox(),
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontFamily: pixelFont,
      fontSize: 11,
      color: LX.green,
      letterSpacing: 1,
    }}>
      <span>{title}</span>
      <span style={{ color: LX.ink2, fontSize: 9 }}>{right}</span>
    </div>
  );
}

// dotted divider w/ label
function DashLabel({ children, color }) {
  const c = color || LX.ink3;
  return (
    <div style={{ margin: "14px 14px 8px", display: "flex", alignItems: "center", gap: 8, color: c, fontFamily: monoFont, fontSize: 11 }}>
      <span style={{ flex: 1, height: 1, borderTop: `1px dashed ${c}` }} />
      <span>{children}</span>
      <span style={{ flex: 1, height: 1, borderTop: `1px dashed ${c}` }} />
    </div>
  );
}

// XP / level bar
function XPBar({ xp = 1163, lvl = 27, tier = "IRON", next = 1500 }) {
  const pct = Math.min(1, xp / next);
  return (
    <div style={{ margin: "0 14px", ...pixelBox(), padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 9, color: LX.gold, marginBottom: 8 }}>
        <span style={{ color: LX.cyan }}>◆ {lvl}</span>
        <span>XP {xp.toLocaleString()}</span>
        <span style={{ color: LX.cyan }}>{tier} tier</span>
      </div>
      <div style={{
        height: 14,
        background: "#0a0a0a",
        border: `2px solid ${LX.border}`,
        position: "relative",
        boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.5)",
      }}>
        <div style={{
          position: "absolute", inset: 0, width: `${pct * 100}%`,
          background: `linear-gradient(180deg, ${LX.green} 0%, #5BC010 50%, ${LX.greenDeep} 100%)`,
          boxShadow: "inset 0 2px 0 rgba(255,255,255,0.25)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: monoFont, fontSize: 10, color: LX.ink2 }}>
        <span>+ {next - xp} XP to STEEL</span>
        <span style={{ color: LX.gold }}>◆ Gold</span>
      </div>
    </div>
  );
}

// Action button with Minecraft hard-shadow style
function PxButton({ children, color, big, glow, fullw }) {
  const c = color || LX.green;
  return (
    <button style={{
      fontFamily: pixelFont, fontSize: big ? 13 : 10,
      padding: big ? "16px 18px" : "12px 14px",
      background: glow ? `${c}22` : "transparent",
      color: c,
      border: `2px solid ${c}`,
      boxShadow: glow ? `0 0 0 2px ${c}33, 4px 4px 0 0 rgba(0,0,0,0.5)` : "4px 4px 0 0 rgba(0,0,0,0.5)",
      letterSpacing: 1,
      width: fullw ? "100%" : "auto",
      cursor: "pointer",
      textTransform: "uppercase",
      lineHeight: 1.4,
    }}>{children}</button>
  );
}

// Lincoln status bar (lighter text)
function LxNav() {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 84,
      background: "rgba(8,12,10,0.96)",
      borderTop: `2px solid ${LX.border}`,
      display: "grid", gridTemplateColumns: "repeat(5,1fr)",
      paddingTop: 10, zIndex: 40, fontFamily: pixelFont,
    }}>
      {[
        ["TODAY", "▣", LX.green, true],
        ["MINE", "⛏", LX.ink2],
        ["HERO", "⚔", LX.ink2],
        ["BOOKS", "▤", LX.ink2],
        ["STUFF", "◈", LX.ink2],
      ].map(([l, ic, c, on], i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: c, fontSize: 7, letterSpacing: 1 }}>
          <div style={{ fontSize: 18, lineHeight: 1, fontFamily: monoFont }}>{ic}</div>
          {l}
        </div>
      ))}
    </div>
  );
}

// =================== HERO HUB ===================
function LincolnHub() {
  return (
    <div className="screen" style={{ background: LX.bg, color: LX.ink,
      backgroundImage: "linear-gradient(rgba(90,140,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,50,0.06) 1px, transparent 1px)",
      backgroundSize: "16px 16px",
    }}>
      <HeroHeader title="HERO HUB" right="LINCOLN" />

      {/* Today's Mission */}
      <div style={{ margin: "0 14px 14px", ...pixelBox({
        boxShadow: `0 0 0 2px ${LX.cyan}22, 4px 4px 0 rgba(0,0,0,0.5)`,
        border: `2px solid ${LX.cyan}`,
      }), padding: 14 }}>
        <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.gold, letterSpacing: 2 }}>
          ⚡ TODAY'S MISSION
        </div>
        <div style={{ fontFamily: monoFont, fontSize: 14, color: LX.gold, marginTop: 8, lineHeight: 1.5 }}>
          Your armor rests beside you.<br />Time to put it on again.
        </div>
        <div style={{ marginTop: 12 }}>
          <PxButton color={LX.cyan} glow fullw big>SUIT UP &amp; BEGIN →</PxButton>
        </div>
      </div>

      {/* Stonebridge banner quest */}
      <div style={{ margin: "0 14px 14px", ...pixelBox({ background: LX.bg3 }), padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 8, color: LX.green, letterSpacing: 1 }}>
          <span>🏰 STONEBRIDGE</span><span style={{ color: LX.ink2 }}>WEEK 1</span>
        </div>
        <div style={{ fontFamily: monoFont, fontSize: 11, color: LX.ink, marginTop: 6, lineHeight: 1.5 }}>
          Banner Rally missions coming soon — your reading will help repair Stonebridge.
        </div>
        <div style={{ marginTop: 10, height: 6, background: "#0a0a0a", border: `1px solid ${LX.border}` }}>
          <div style={{ height: "100%", width: "18%", background: LX.green }} />
        </div>
      </div>

      {/* mood toggles */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "0 14px 14px" }}>
        <PxButton color={LX.ink}>🧑‍🤝‍🧑 BROTHERS</PxButton>
        <PxButton color={LX.cyan}>🌙 NIGHT</PxButton>
      </div>

      {/* avatar scene */}
      <div style={{ margin: "0 14px 14px", height: 220, ...pixelBox({ background: "linear-gradient(180deg, #1a1d3a 0%, #0a0d24 60%, #050818 100%)" }), position: "relative", overflow: "hidden" }}>
        {/* stars */}
        {[[40, 30], [80, 60], [220, 40], [300, 80], [120, 20], [260, 120], [160, 55]].map(([x, y], i) => (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 2, height: 2, background: "#fff" }} />
        ))}
        {/* moon */}
        <div style={{ position: "absolute", right: 24, top: 18, width: 28, height: 28, background: LX.gold, borderRadius: 0, boxShadow: `0 0 0 2px #b89530, 0 0 24px ${LX.gold}66` }} />
        {/* ground pedestal */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 36, background: "linear-gradient(180deg, #2a2d4a, #1a1d34)", borderTop: `2px solid ${LX.borderHi}` }} />
        {/* hero (pixelated body) */}
        <PixelHero />
        {/* tier badge */}
        <div style={{ position: "absolute", left: 12, top: 12, padding: "4px 8px", background: "rgba(0,0,0,0.6)", border: `1.5px solid ${LX.cyan}`, fontFamily: pixelFont, fontSize: 8, color: LX.cyan }}>
          IRON ⚔ LV 27
        </div>
      </div>

      {/* emotes row */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "0 14px 14px", flexWrap: "wrap" }}>
        {["⚔ VICTORY", "🛡 SHIELD", "🙏 PRAYER", "👋 WAVE", "🤜 BATTLE", "😎 DAB"].map((e) => (
          <span key={e} style={{ fontFamily: pixelFont, fontSize: 7, padding: "6px 8px", border: `2px solid ${LX.border}`, color: LX.ink2, letterSpacing: 0.5 }}>{e}</span>
        ))}
      </div>

      <XPBar />

      <DashLabel color={LX.greenDeep}>NEXT ACTION</DashLabel>
      <div style={{ margin: "0 14px" }}>
        <PxButton color={LX.green} glow fullw big>⚔ SUIT UP</PxButton>
        <div style={{ fontFamily: monoFont, fontSize: 10, color: LX.ink2, textAlign: "center", marginTop: 6 }}>
          0/2 equipped today · 2/6 forged
        </div>
      </div>

      <DashLabel>WHERE TO NEXT?</DashLabel>
      <div style={{ margin: "0 14px 20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { ic: "⛏", l: "MINE", c: LX.green },
          { ic: "🎲", l: "WORKSHOP", c: LX.cyan },
          { ic: "▤", l: "BOOKS", c: LX.gold },
        ].map((x) => (
          <div key={x.l} style={{ ...pixelBox({ background: LX.bg2 }), padding: "16px 6px", textAlign: "center", color: x.c, fontFamily: pixelFont, fontSize: 9 }}>
            <div style={{ fontSize: 28, marginBottom: 6, fontFamily: monoFont }}>{x.ic}</div>
            {x.l}
          </div>
        ))}
      </div>

      <LxNav />
    </div>
  );
}

// pixel hero block-figure
function PixelHero() {
  // a chunky pixel character with magenta tunic + brown hair
  const px = 6;
  const palette = {
    s: "#e8c69b", h: "#7a4a1f", t: "#b4275c", b: "#3a2a1f",
    g: "#15151f", w: "#fff",
  };
  // 12 wide × 16 tall sprite
  const map = [
    "....hhhh....",
    "...hhhhhh...",
    "..hhssssh...",
    "..hsggsgsh..",
    "..hsswssssh.",
    "..hssssssh..",
    "...sssssss..",
    "...tttttt...",
    "..tttttttt..",
    ".ttttttttt..",
    ".tttttttttt.",
    ".tttbbtttt..",
    "..bb..bb....",
    "..bb..bb....",
    "..bb..bb....",
    "..bb..bb....",
  ];
  return (
    <div style={{
      position: "absolute",
      left: "50%", top: 26,
      transform: "translateX(-50%)",
      display: "grid", gridTemplateColumns: `repeat(12, ${px}px)`, gridAutoRows: `${px}px`,
      filter: "drop-shadow(0 6px 0 rgba(0,0,0,0.5))",
    }}>
      {map.flatMap((row, ry) => row.split("").map((ch, cx) => (
        <div key={`${ry}-${cx}`} style={{ background: ch === "." ? "transparent" : palette[ch] }} />
      )))}
    </div>
  );
}

// =================== ARMOR FORGE ===================
function LincolnForge() {
  return (
    <div className="screen" style={{ background: LX.bg, color: LX.ink,
      backgroundImage: "linear-gradient(rgba(90,140,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,50,0.06) 1px, transparent 1px)",
      backgroundSize: "16px 16px",
    }}>
      <HeroHeader title="ARMOR FORGE" right="2/6 IRON" />

      {/* mini avatar */}
      <div style={{ margin: "0 14px 12px", ...pixelBox(), height: 140, position: "relative", overflow: "hidden", background: "linear-gradient(180deg, #181f2a, #0c1118)" }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 22, background: "#23303a", borderTop: `2px solid ${LX.borderHi}` }} />
        <div style={{ position: "absolute", left: "50%", top: 10, transform: "translateX(-50%)", scale: "0.75" }}><PixelHero /></div>
        <div style={{ position: "absolute", left: 10, top: 10, fontFamily: pixelFont, fontSize: 8, color: LX.cyan }}>◆ 1,163 XP</div>
        <div style={{ position: "absolute", right: 10, top: 10, fontFamily: pixelFont, fontSize: 8, color: LX.gold }}>◆ 27 GOLD</div>
      </div>

      {/* tier toggle */}
      <div style={{ margin: "0 14px 12px", display: "flex", gap: 6 }}>
        {[
          ["WOOD", "✓", LX.ink2, false],
          ["STONE", "✓", LX.ink2, false],
          ["IRON", "◆", LX.green, true],
          ["STEEL", "🔒", LX.ink3, false],
        ].map(([l, ic, c, on]) => (
          <div key={l} style={{
            flex: 1, padding: "10px 0", textAlign: "center",
            fontFamily: pixelFont, fontSize: 8,
            border: `2px solid ${on ? LX.green : LX.border}`,
            background: on ? "#1a2d18" : "transparent",
            color: c, letterSpacing: 1,
            boxShadow: on ? `0 0 0 2px ${LX.green}33` : "none",
          }}>
            <div style={{ fontSize: 12, marginBottom: 2 }}>{ic}</div>
            {l}
          </div>
        ))}
      </div>

      {/* warning banner */}
      <div style={{ margin: "0 14px 12px", padding: 10, background: "#221c08", border: `2px solid ${LX.gold}`, fontFamily: monoFont, fontSize: 11, color: LX.gold, lineHeight: 1.5, textAlign: "center" }}>
        Your armor rests beside you. Time to put it on again.
      </div>

      <DashLabel>FORGE QUEUE</DashLabel>

      {/* armor grid */}
      <div style={{ margin: "0 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { l: "Belt of Truth", ic: BeltSVG, cur: null, cost: null, state: "equip", new: true },
          { l: "Breastplate", ic: BreastSVG, cur: "Stone", cost: 35, state: "upgrade" },
          { l: "Shoes of Peace", ic: ShoesSVG, cur: null, cost: null, state: "equip", new: true },
          { l: "Shield of Faith", ic: ShieldSVG, cur: "Stone", cost: 40, state: "upgrade" },
          { l: "Helmet", ic: HelmetSVG, cur: "Stone", cost: 40, state: "upgrade" },
          { l: "Sword", ic: SwordSVG, cur: "Stone", cost: 45, state: "upgrade" },
        ].map((it) => (
          <div key={it.l} style={{ ...pixelBox(), padding: 8, position: "relative" }}>
            {it.new && <div style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, background: LX.gold, color: "#000", fontFamily: pixelFont, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${LX.bg}` }}>!</div>}
            <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a1010", border: `2px solid ${LX.border}`, marginBottom: 6 }}>
              <it.ic />
            </div>
            <div style={{ fontFamily: pixelFont, fontSize: 8, color: LX.ink, lineHeight: 1.4, height: 24 }}>{it.l}</div>
            {it.cur && <div style={{ fontFamily: monoFont, fontSize: 9, color: LX.ink3, marginTop: 2 }}>Current: {it.cur}</div>}
            <div style={{ marginTop: 4, padding: "4px 0", textAlign: "center", border: `1.5px solid ${it.state === "equip" ? LX.green : LX.gold}`, color: it.state === "equip" ? LX.green : LX.gold, fontFamily: pixelFont, fontSize: 8 }}>
              {it.cost ? `◆${it.cost} ` : ""}{it.state.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      <DashLabel>FAITH STAT</DashLabel>
      <div style={{ margin: "0 14px 24px", ...pixelBox(), padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 9, color: LX.ink2 }}>
          <span style={{ color: LX.green }}>STRENGTH</span><span>+18</span>
        </div>
        {[
          ["STRENGTH", 18, LX.green],
          ["WISDOM", 24, LX.cyan],
          ["MERCY", 12, LX.rose],
          ["COURAGE", 31, LX.gold],
        ].map(([l, v, c]) => (
          <div key={l} style={{ marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 8, color: c, marginBottom: 4 }}>
              <span>{l}</span><span>+{v}</span>
            </div>
            <div style={{ height: 6, background: "#0a0a0a", border: `1px solid ${LX.border}` }}>
              <div style={{ height: "100%", width: `${v * 3}%`, background: c }} />
            </div>
          </div>
        ))}
      </div>

      <LxNav />
    </div>
  );
}

// === armor SVG glyphs (pure shape, no figures) ===
function BeltSVG() { return (
  <svg width="36" height="36" viewBox="0 0 12 12" shapeRendering="crispEdges">
    <rect x="1" y="5" width="10" height="3" fill="#8d6b3a" />
    <rect x="5" y="4" width="2" height="5" fill="#c89344" />
    <rect x="1" y="5" width="1" height="3" fill="#5a4220" />
    <rect x="10" y="5" width="1" height="3" fill="#5a4220" />
  </svg>
);}
function BreastSVG() { return (
  <svg width="36" height="36" viewBox="0 0 12 12" shapeRendering="crispEdges">
    <rect x="2" y="2" width="8" height="8" fill="#7a8a96" />
    <rect x="2" y="2" width="8" height="1" fill="#a8b6c2" />
    <rect x="2" y="9" width="8" height="1" fill="#4d5963" />
    <rect x="5" y="4" width="2" height="4" fill="#a8b6c2" />
  </svg>
);}
function ShoesSVG() { return (
  <svg width="36" height="36" viewBox="0 0 12 12" shapeRendering="crispEdges">
    <rect x="1" y="7" width="4" height="2" fill="#6b3a1d" />
    <rect x="7" y="7" width="4" height="2" fill="#6b3a1d" />
    <rect x="1" y="6" width="3" height="1" fill="#a06030" />
    <rect x="7" y="6" width="3" height="1" fill="#a06030" />
  </svg>
);}
function ShieldSVG() { return (
  <svg width="36" height="36" viewBox="0 0 12 12" shapeRendering="crispEdges">
    <rect x="3" y="2" width="6" height="6" fill="#8898a4" />
    <rect x="4" y="8" width="4" height="2" fill="#8898a4" />
    <rect x="5" y="3" width="2" height="6" fill="#fcdb5b" />
    <rect x="3" y="5" width="6" height="2" fill="#fcdb5b" />
  </svg>
);}
function HelmetSVG() { return (
  <svg width="36" height="36" viewBox="0 0 12 12" shapeRendering="crispEdges">
    <rect x="3" y="3" width="6" height="5" fill="#8898a4" />
    <rect x="2" y="8" width="8" height="1" fill="#8898a4" />
    <rect x="4" y="5" width="4" height="2" fill="#15151f" />
    <rect x="3" y="3" width="6" height="1" fill="#a8b6c2" />
  </svg>
);}
function SwordSVG() { return (
  <svg width="36" height="36" viewBox="0 0 12 12" shapeRendering="crispEdges">
    <rect x="5" y="1" width="2" height="7" fill="#cfd8e0" />
    <rect x="5" y="1" width="1" height="7" fill="#fff" />
    <rect x="3" y="8" width="6" height="1" fill="#8d6b3a" />
    <rect x="5" y="9" width="2" height="3" fill="#5a4220" />
  </svg>
);}

// =================== KNOWLEDGE MINE ===================
function LincolnMine() {
  return (
    <div className="screen" style={{ background: LX.bg, color: LX.ink,
      backgroundImage: "linear-gradient(rgba(90,140,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,50,0.06) 1px, transparent 1px)",
      backgroundSize: "16px 16px",
    }}>
      <HeroHeader title="KNOWLEDGE MINE" right="DAY 28" />

      {/* depth meter */}
      <div style={{ margin: "0 14px 12px", ...pixelBox(), padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: pixelFont, fontSize: 9, color: LX.ink2, marginBottom: 8 }}>
          <span>⛏ DEPTH</span><span style={{ color: LX.green }}>LEVEL 27</span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} style={{
              flex: 1, height: 18,
              background: i < 11 ? LX.green : i === 11 ? LX.gold : "#0a0a0a",
              border: `1px solid ${LX.border}`,
              boxShadow: i < 11 ? "inset 0 -3px 0 rgba(0,0,0,0.3)" : "none",
            }} />
          ))}
        </div>
        <div style={{ marginTop: 8, fontFamily: monoFont, fontSize: 10, color: LX.ink2, textAlign: "center" }}>
          Mine 4 more blocks to break through to STEEL.
        </div>
      </div>

      <DashLabel color={LX.gold}>TODAY'S VEIN</DashLabel>

      {/* Subject blocks - looking like ore deposits */}
      <div style={{ margin: "0 14px", display: "grid", gap: 8 }}>
        {[
          { sub: "LANGUAGE ARTS", task: "Long-A pattern · ai/ay", mins: 20, ore: "EMERALD", oc: LX.green, done: false, n: 3 },
          { sub: "READING", task: "Reading Eggs · Lesson 84", mins: 15, ore: "DIAMOND", oc: LX.cyan, done: true, n: 2 },
          { sub: "MATH", task: "Place value · tens &amp; ones", mins: 15, ore: "AMETHYST", oc: "#b388ff", done: false, n: 1 },
          { sub: "SCIENCE", task: "Water Shapes · same volume?", mins: 25, ore: "GOLD", oc: LX.gold, done: false, n: 1 },
        ].map((b, i) => (
          <div key={i} style={{
            ...pixelBox({ background: b.done ? "#1a2a18" : LX.bg2, borderColor: b.done ? LX.green : LX.border }),
            padding: 12, display: "flex", gap: 12, alignItems: "center",
          }}>
            {/* ore block */}
            <div style={{ width: 48, height: 48, background: b.oc, border: `2px solid ${LX.border}`, position: "relative", boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.3), inset 0 4px 0 rgba(255,255,255,0.18)" }}>
              <div style={{ position: "absolute", inset: 6, background: `${b.oc}66`, boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.3)" }} />
              {b.done && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: pixelFont, fontSize: 18, color: LX.green }}>✓</div>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontFamily: pixelFont, fontSize: 7, color: b.oc, letterSpacing: 1 }}>{b.sub}</div>
                <div style={{ fontFamily: pixelFont, fontSize: 7, color: LX.ink3 }}>×{b.n}</div>
              </div>
              <div style={{ fontFamily: monoFont, fontSize: 12, color: LX.ink, marginTop: 4, lineHeight: 1.4 }} dangerouslySetInnerHTML={{ __html: b.task }} />
              <div style={{ fontFamily: monoFont, fontSize: 10, color: LX.ink2, marginTop: 4 }}>
                {b.done ? "✓ Mined · +25 XP" : `${b.mins} min · +25 XP`}
              </div>
            </div>
          </div>
        ))}
      </div>

      <DashLabel>AI CHECK · Long-A</DashLabel>
      <div style={{ margin: "0 14px 14px", ...pixelBox({ borderColor: LX.cyan, boxShadow: `0 0 0 2px ${LX.cyan}22, 4px 4px 0 rgba(0,0,0,0.5)` }), padding: 14 }}>
        <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.cyan, letterSpacing: 1 }}>⚡ NEW QUEST</div>
        <div style={{ fontFamily: monoFont, fontSize: 12, color: LX.ink, marginTop: 8, lineHeight: 1.5 }}>
          Shelly built you a 5-minute check. 8 words. You can re-try twice.
        </div>
        <div style={{ marginTop: 10, padding: 10, background: "#0a0a0a", border: `2px solid ${LX.border}` }}>
          <div style={{ fontFamily: monoFont, fontSize: 10, color: LX.ink2 }}>QUESTION 1 OF 8</div>
          <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.gold, marginTop: 6, lineHeight: 1.5 }}>
            🔊 "Tap the word that<br />says the long-A sound."
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
            {["RAIN", "RAT", "RAKE", "RAM"].map((w, i) => (
              <div key={w} style={{ padding: "10px 0", textAlign: "center", border: `2px solid ${LX.border}`, fontFamily: pixelFont, fontSize: 10, color: LX.ink, background: "#152221" }}>{w}</div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <PxButton color={LX.cyan} glow fullw>BEGIN CHECK · +60 XP</PxButton>
        </div>
      </div>

      <LxNav />
    </div>
  );
}

// =================== TEST RESULT / REWARD ===================
function LincolnTest() {
  return (
    <div className="screen" style={{ background: LX.bg, color: LX.ink,
      backgroundImage: "linear-gradient(rgba(90,140,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,50,0.06) 1px, transparent 1px)",
      backgroundSize: "16px 16px",
    }}>
      <HeroHeader title="QUEST COMPLETE" right="LONG-A · 7/8" />

      {/* victory hero */}
      <div style={{ margin: "0 14px 14px", ...pixelBox({ background: "linear-gradient(180deg, #1a2a18 0%, #0a1208 100%)", borderColor: LX.green, boxShadow: `0 0 0 2px ${LX.green}22, 4px 4px 0 rgba(0,0,0,0.5)` }), height: 200, position: "relative", overflow: "hidden" }}>
        {/* light rays */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute", left: "50%", top: "50%",
            width: 2, height: 200,
            background: `linear-gradient(180deg, ${LX.gold}88, transparent)`,
            transform: `translate(-50%, -50%) rotate(${i * 45}deg)`,
            opacity: 0.4,
          }} />
        ))}
        <div style={{ position: "absolute", left: "50%", top: 30, transform: "translateX(-50%)" }}><PixelHero /></div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 10, textAlign: "center", fontFamily: pixelFont, fontSize: 13, color: LX.gold, letterSpacing: 2, textShadow: `0 0 16px ${LX.gold}` }}>
          ★ VICTORY ★
        </div>
      </div>

      {/* reward stack */}
      <div style={{ margin: "0 14px 12px", display: "grid", gap: 8 }}>
        {[
          { l: "XP EARNED", v: "+ 60", c: LX.green, ic: "◆" },
          { l: "GOLD", v: "+ 3", c: LX.gold, ic: "◆" },
          { l: "MASTERY", v: "Long-A · 87%", c: LX.cyan, ic: "✓" },
        ].map((r) => (
          <div key={r.l} style={{ ...pixelBox(), padding: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, background: r.c, color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: pixelFont, fontSize: 18, border: `2px solid ${LX.border}`, boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.3), inset 0 3px 0 rgba(255,255,255,0.3)" }}>{r.ic}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: pixelFont, fontSize: 8, color: LX.ink2, letterSpacing: 1 }}>{r.l}</div>
              <div style={{ fontFamily: pixelFont, fontSize: 14, color: r.c, marginTop: 4 }}>{r.v}</div>
            </div>
          </div>
        ))}
      </div>

      {/* shelly note */}
      <div style={{ margin: "0 14px 12px", ...pixelBox({ background: LX.bg3 }), padding: 12 }}>
        <div style={{ fontFamily: pixelFont, fontSize: 8, color: LX.cyan, letterSpacing: 1 }}>📜 NOTE FROM MOM</div>
        <div style={{ fontFamily: monoFont, fontSize: 12, color: LX.ink, marginTop: 8, lineHeight: 1.5 }}>
          "You only missed 'snail'. Big deal — you got 'rake' right after the squirrel distraction. I'm proud of you. — Mom"
        </div>
      </div>

      {/* missed items, gentle framing */}
      <DashLabel>WHAT TO MINE NEXT</DashLabel>
      <div style={{ margin: "0 14px 14px", ...pixelBox(), padding: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 36, height: 36, background: LX.gold, border: `2px solid ${LX.border}`, fontFamily: pixelFont, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#000" }}>?</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: pixelFont, fontSize: 8, color: LX.gold }}>SNAIL</div>
            <div style={{ fontFamily: monoFont, fontSize: 11, color: LX.ink2, marginTop: 4 }}>The "ai" likes to hide. We'll catch it tomorrow.</div>
          </div>
        </div>
      </div>

      <div style={{ margin: "0 14px 24px", display: "grid", gap: 8 }}>
        <PxButton color={LX.green} glow fullw big>⛏ KEEP MINING</PxButton>
        <PxButton color={LX.ink2} fullw>🏠 BACK TO HUB</PxButton>
      </div>

      <LxNav />
    </div>
  );
}

// =================== DAILY MISSION (START) ===================
function LincolnMission() {
  return (
    <div className="screen" style={{ background: LX.bg, color: LX.ink,
      backgroundImage: "linear-gradient(rgba(90,140,50,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(90,140,50,0.06) 1px, transparent 1px)",
      backgroundSize: "16px 16px",
    }}>
      <HeroHeader title="DAILY MISSION" right="DAY 28" />

      {/* date scroll */}
      <div style={{ margin: "0 14px 12px", display: "flex", gap: 4, overflowX: "auto" }}>
        {["MON 25", "TUE 26", "WED 27", "THU 28", "FRI 29"].map((d, i) => (
          <div key={d} style={{
            flex: "0 0 64px", padding: "8px 0", textAlign: "center",
            border: `2px solid ${i === 1 ? LX.green : LX.border}`,
            background: i === 1 ? "#1a2a18" : "transparent",
            fontFamily: pixelFont, fontSize: 7, color: i === 1 ? LX.green : LX.ink2, letterSpacing: 1,
            boxShadow: i === 1 ? `0 0 0 2px ${LX.green}33` : "none",
          }}>
            {d.split(" ")[0]}<br /><span style={{ fontSize: 12, lineHeight: 2 }}>{d.split(" ")[1]}</span>
          </div>
        ))}
      </div>

      {/* mission objective */}
      <div style={{ margin: "0 14px 12px", ...pixelBox({ borderColor: LX.gold, boxShadow: `0 0 0 2px ${LX.gold}33, 4px 4px 0 rgba(0,0,0,0.5)` }), padding: 14 }}>
        <div style={{ fontFamily: pixelFont, fontSize: 9, color: LX.gold, letterSpacing: 2 }}>⚡ OBJECTIVE</div>
        <div style={{ fontFamily: monoFont, fontSize: 14, color: LX.ink, marginTop: 10, lineHeight: 1.6 }}>
          Mine 4 blocks today. Suit up at least 2 pieces. Read one chapter.
        </div>
      </div>

      {/* checklist */}
      <div style={{ margin: "0 14px 12px", display: "grid", gap: 6 }}>
        {[
          { l: "Suit up · Belt of Truth", ic: "🛡", on: true, xp: 5 },
          { l: "Suit up · Shoes of Peace", ic: "🛡", on: false, xp: 5 },
          { l: "Mine: Reading Eggs", ic: "⛏", on: true, xp: 25 },
          { l: "Mine: Long-A check", ic: "⛏", on: false, xp: 60 },
          { l: "Mine: Place value", ic: "⛏", on: false, xp: 25 },
          { l: "Mine: Water Shapes", ic: "⛏", on: false, xp: 30 },
          { l: "Chapter 14 · Aslan", ic: "▤", on: false, xp: 20 },
        ].map((c, i) => (
          <div key={i} style={{
            padding: 10, ...pixelBox({ background: c.on ? "#1a2a18" : LX.bg2, borderColor: c.on ? LX.green : LX.border }),
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ width: 22, height: 22, border: `2px solid ${c.on ? LX.green : LX.ink3}`, background: c.on ? LX.green : "transparent", color: "#000", fontFamily: pixelFont, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>{c.on ? "✓" : ""}</div>
            <div style={{ flex: 1, fontFamily: monoFont, fontSize: 13, color: c.on ? LX.ink3 : LX.ink, textDecoration: c.on ? "line-through" : "none" }}>{c.l}</div>
            <div style={{ fontFamily: pixelFont, fontSize: 8, color: c.on ? LX.greenDeep : LX.gold }}>+{c.xp}xp</div>
          </div>
        ))}
      </div>

      {/* energy honesty */}
      <DashLabel>HOW ARE YOU?</DashLabel>
      <div style={{ margin: "0 14px 14px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {[
          { l: "READY", e: "💪", c: LX.green, on: true },
          { l: "SLOW", e: "🐢", c: LX.gold },
          { l: "TIRED", e: "😴", c: LX.ink2 },
        ].map((m) => (
          <div key={m.l} style={{
            padding: 12, textAlign: "center",
            border: `2px solid ${m.on ? m.c : LX.border}`,
            background: m.on ? "#1a2a18" : "transparent",
            fontFamily: pixelFont, fontSize: 8, color: m.on ? m.c : LX.ink2,
            boxShadow: m.on ? `0 0 0 2px ${m.c}33` : "none",
          }}>
            <div style={{ fontSize: 22, fontFamily: monoFont, marginBottom: 4 }}>{m.e}</div>
            {m.l}
          </div>
        ))}
      </div>
      <div style={{ margin: "0 14px 24px", fontFamily: monoFont, fontSize: 11, color: LX.ink2, textAlign: "center" }}>
        On slow days, smaller blocks. No judge. Just grow.
      </div>

      <LxNav />
    </div>
  );
}

Object.assign(window, {
  LincolnHub, LincolnForge, LincolnMine, LincolnTest, LincolnMission,
  LX, pixelFont, monoFont, pixelBox, PxButton, PixelHero,
  BeltSVG, BreastSVG, ShoesSVG, ShieldSVG, HelmetSVG, SwordSVG,
});
