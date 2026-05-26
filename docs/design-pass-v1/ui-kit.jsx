// Shared UI primitives for the homeschool app design pass.
// Phone frame, status bar, common SVG icons.

const { useState } = React;

function Phone({ children, dark, label }) {
  return (
    <div className="phone" style={dark ? { background: "#0a0a0a" } : null}>
      <div className="phone__screen" style={dark ? { background: "#0d120e" } : null}>
        <div className="phone__notch" />
        <StatusBar dark={dark} />
        {children}
      </div>
    </div>
  );
}

function StatusBar({ dark }) {
  return (
    <div className={"statusbar" + (dark ? " statusbar--dark" : "")}>
      <span>9:41</span>
      <div className="statusbar__icons">
        {/* signal */}
        <svg width="18" height="11" viewBox="0 0 18 11" fill="none">
          <rect x="0" y="7" width="3" height="4" rx="0.5" fill="currentColor" />
          <rect x="5" y="5" width="3" height="6" rx="0.5" fill="currentColor" />
          <rect x="10" y="3" width="3" height="8" rx="0.5" fill="currentColor" />
          <rect x="15" y="0" width="3" height="11" rx="0.5" fill="currentColor" />
        </svg>
        {/* wifi */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
          <path d="M8 11l2-2a3 3 0 00-4 0l2 2zM2 5a8 8 0 0112 0l-1.4 1.4a6 6 0 00-9.2 0L2 5zM5 8a4 4 0 016 0L9.6 9.4a2 2 0 00-3.2 0L5 8z" fill="currentColor" />
        </svg>
        {/* battery */}
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="2.5" stroke="currentColor" opacity="0.5" />
          <rect x="2" y="2" width="17" height="8" rx="1.5" fill="currentColor" />
          <rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.5" />
        </svg>
      </div>
    </div>
  );
}

// ---------- Parent-mode icons (Lucide-ish, 24×24) ----------

const Icon = {
  home: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  cal: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  log: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6M9 13h6M9 17h4" />
    </svg>
  ),
  folder: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  sparkles: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7l3.5 3.5L12 4" />
    </svg>
  ),
  back: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  more: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M7 2v10M2 7h10" />
    </svg>
  ),
  chevron: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3l4 4-4 4" />
    </svg>
  ),
  filter: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h18M6 12h12M10 19h4" />
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M6 11l6 6 6-6M5 21h14" />
    </svg>
  ),
  mic: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  ),
};

// Bottom tab bar for Shelly mode (5 items).
function ParentTabBar({ active = "today" }) {
  const items = [
    { key: "today", label: "Today", icon: Icon.home },
    { key: "plan", label: "Plan", icon: Icon.cal },
    { key: "log", label: "Log", icon: Icon.log },
    { key: "records", label: "Records", icon: Icon.folder },
    { key: "ai", label: "Shelly AI", icon: Icon.sparkles },
  ];
  return (
    <div className="tabbar">
      {items.map((it) => (
        <div key={it.key} className={"tabbar__item" + (active === it.key ? " tabbar__item--active" : "")}>
          <div className="tabbar__icon">{it.icon}</div>
          {it.label}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Phone, StatusBar, ParentTabBar, Icon });
