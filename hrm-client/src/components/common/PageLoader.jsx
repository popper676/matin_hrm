export default function PageLoader({ label = 'Loading' }) {
  return <div className="uyf-skeleton-page" role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div className="uyf-skeleton uyf-skeleton-hero"/>
    <div className="uyf-skeleton-metrics">{[0, 1, 2, 3].map(i => <div key={i} className="uyf-skeleton uyf-skeleton-stat"/>)}</div>
    <div className="uyf-skeleton-panels"><div className="uyf-skeleton"/><div className="uyf-skeleton"/></div>
  </div>;
}
