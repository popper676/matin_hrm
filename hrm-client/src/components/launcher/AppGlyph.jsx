// A consistent line-art family with muted enamel finishes, rather than glossy badges.
const paths = {
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  person: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  personPlus: 'M15 21v-2a5 5 0 0 0-10 0v2M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M20 8v6M17 11h6',
  clock: 'M12 7v5l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M8 14h1M15 14h1M8 18h1',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M4 7v12a2 2 0 0 0 2 2h15V7M21 12h-6v5h6M17 14.5h.01',
  briefcase: 'M8 6V3h8v3M4 6h16a1 1 0 0 1 1 1v13H3V7a1 1 0 0 1 1-1M3 11c6 4 12 4 18 0M12 11v4',
  exit: 'M9 21H3V3h6M14 8l5 4-5 4M7 12h12',
  document: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  analytics: 'M4 21V11M10 21V7M16 21v-5M22 21V3M3 7l7-4 6 7 6-9',
  checklist: 'm3 6 2 2 3-4m-5 9 2 2 3-4m-5 9 2 2 3-4M12 6h9M12 13h9M12 20h9',
  arrows: 'M4 7h16m-5-5 5 5-5 5M20 17H4m5-5-5 5 5 5',
  key: 'M14 8a5 5 0 1 1 3 9l-6 6H7v-4l6-6a5 5 0 0 1 1-5M19 10h.01M4 12a4 4 0 1 1 5-6M1 21v-2a5 5 0 0 1 6-5',
  building: 'M3 21h18M5 21V3h14v18M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-5h4v5',
  orgchart: 'M9 2h6v6H9zM2 16h6v6H2zM16 16h6v6h-6zM12 8v4M5 16v-4h14v4',
  calculator: 'M5 2h14v20H5zM8 5h8v4H8zM8 13h1M12 13h1M16 13h.01M8 17h1M12 17h1M16 17h.01',
  star: 'm12 3 2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20l1.1-6.1L3 9.5l6.2-.9Z',
  gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8C3 8 5 1 8 3c3 1 4 5 4 5Zm0 0c9 0 7-7 4-5-3 1-4 5-4 5Z',
  book: 'M12 5v16M12 5C9 2 5 2 2 3v16c4-1 7-1 10 2 3-3 6-3 10-2V3c-3-1-7-1-10 2M6 7h2M16 7h2',
  shield: 'm12 2 9 4v7c0 6-9 9-9 9s-9-3-9-9V6ZM8 12l3 3 5-6',
  megaphone: 'm3 9 16-5v15L3 14ZM7 15l2 7h4l-2-6M22 8v7',
  spark: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4M18 4h4',
  target: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0M12 12h.01',
  qr: 'M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM21 15v3h-3v3M21 21h.01',
};
export default function AppGlyph({ name, tone = 'blue' }) {
  return <span className={`app-icon app-icon-${tone}`} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" focusable="false"><rect className="glyph-wash" x="4" y="4" width="16" height="16" rx="5" fill="currentColor" opacity=".08" stroke="none"/><path d={paths[name] || paths.document}/></svg></span>;
}
