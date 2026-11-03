// A small, local SVG set keeps the interface consistent without an icon dependency.
export const ICON_PATHS = {
  info: 'M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  moon: 'M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  apps: 'M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z',
  edit: 'm16 3 5 5M3 21l5-1L21 7a3.5 3.5 0 0 0-5-5L3 15v6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  eye: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  close: 'M6 6l12 12M6 18 18 6',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  lock: 'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 15v2',
  download: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
  settings: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M9 2h6l1 4 4 1 2 5-2 5-4 1-1 4H9l-1-4-4-1-2-5 2-5 4-1 1-4',
  pin: 'M9 3h6l-1 6 4 4H6l4-4-1-6M12 13v8',
  dashboard: 'M3 3h7v7H3zM14 3h7v11h-7zM3 14h7v7H3zM14 18h7v3h-7z',
  staff: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  active: 'm8 12 3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  present: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  leave: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M8 14h2M14 14h2M8 18h2',
  pending: 'M8 2v4M16 2v4M3 10h11M12 22H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M18 15v3l2 1M23 18a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  payroll: 'M3 5h18v14H3zM3 9h18M7 14h3M17 14h.01',
  rating: 'm12 3 2.78 5.63L21 9.54l-4.5 4.39L17.56 20 12 17.08 6.44 20l1.06-6.07L3 9.54l6.22-.91L12 3',
  documents: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  departments: 'M3 21h18M5 21V3h14v18M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-5h4v5',
  positions: 'M8 6V3h8v3M3 6h18v14H3zM3 11c6 4 12 4 18 0M12 11v4',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  qr: 'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM21 15v3h-3v3M21 21h.01',
  handover: 'M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3M8 2h6v4H8zM8 11h4M8 16h3M16 8l5 4-5 4M13 12h8',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3M20 2v4M18 4h4',
  arrow: 'M7 17 17 7M7 7h10v10',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
  plus: 'M12 4v16M4 12h16',
  warning: 'm12 3 10 18H2L12 3M12 9v4M12 17h.01',
  trend: 'm3 17 6-6 4 4 8-10M15 5h6v6',
  sops: 'M3 5h13v14H3zM16 10l5-3v10l-5-3M8 9l4 3-4 3V9',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5M8 11h.01M12 11h.01M16 11h.01',
  users: 'M15 7a5 5 0 1 1-3.8 8.2L5 21H2v-3l6.2-6.2A5 5 0 0 1 15 7M17 10h.01',
  onboarding: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M20 8v6M17 11h6',
  offboarding: 'M9 21H3V3h6M14 8l5 4-5 4M7 12h12',
  orgchart: 'M9 2h6v6H9zM2 16h6v6H2zM16 16h6v6h-6zM12 8v4M5 16v-4h14v4',
  birthdays: 'M3 12h18v9H3zM3 16c3 3 6-3 9 0s6-3 9 0M7 12V8M12 12V8M17 12V8M7 4v1M12 3v2M17 4v1',
};
Object.assign(ICON_PATHS, {
  employees: ICON_PATHS.staff, attendance: ICON_PATHS.present,
  recruitment: ICON_PATHS.positions, voting: ICON_PATHS.rating,
  boss: ICON_PATHS.dashboard, performance: ICON_PATHS.trend,
  finance: ICON_PATHS.payroll, announcements: ICON_PATHS.bell,
  portal: ICON_PATHS.arrowRight,
});

const SYMBOL_ICONS = {"📝": "edit", "✏️": "edit", "📋": "documents", "📸": "camera", "📱": "qr", "📅": "leave", "🗓️": "leave", "✅": "active", "⏱️": "present", "📊": "trend", "📥": "download", "📁": "documents", "👥": "staff", "🎯": "performance", "💼": "positions", "⚙️": "settings", "📄": "documents", "🎉": "birthdays", "🔍": "search", "❌": "close", "💰": "payroll", "🚀": "arrow", "🏆": "rating", "🌟": "rating", "⏳": "pending", "⚠️": "warning", "🔄": "handover", "🤖": "spark"};

export default function Icon({ name, path, size = 20, className = '', ...props }) {
  return <svg width={size} height={size} className={`uyf-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d={path || ICON_PATHS[SYMBOL_ICONS[name] || name] || ICON_PATHS.spark}/>
  </svg>;
}
