import type { Fresh } from '../types';

export function FreshPill({ f, compact }: { f: Fresh; compact?: boolean }) {
  const label = f.ageMin < 60 ? `${f.ageMin} min ago` : `${Math.round(f.ageMin / 60)} h ago`;
  return <span className={`fresh ${f.status}`} title={`Data fetched ${label}`}>{compact ? f.status : `${f.status}: ${label}`}</span>;
}
