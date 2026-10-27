import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface Candidate {
  id: string;
  score: number;
  parts: { name: number; geo: number; address: number; phone: number | null; distanceM: number };
  a: { providerName: string; name: string; address: string };
  b: { providerName: string; name: string; address: string };
}
interface Pipeline {
  rawListings: number;
  canonicalRestaurants: number;
  pendingReviews: number;
  issues: { providerId: string; recordId: string; level: string; reason: string }[];
}

export default function Admin() {
  const [queue, setQueue] = useState<Candidate[] | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setErr('');
    api<{ pending: Candidate[] }>('/admin/review-queue').then(data => setQueue(data.pending)).catch(error => setErr(error instanceof Error ? error.message : 'Could not load review queue.'));
    api<Pipeline>('/admin/pipeline').then(setPipeline).catch(error => setErr(error instanceof Error ? error.message : 'Could not load pipeline status.'));
  }, []);

  useEffect(load, [load]);

  const decide = (id: string, verdict: 'merge' | 'reject') =>
    api(`/admin/review-queue/${id}/decision`, { method: 'POST', body: JSON.stringify({ verdict }) })
      .then(load)
      .catch(error => setErr(error instanceof Error ? error.message : 'Could not save this decision.'));

  if (err) return <div className="state error">{err}</div>;

  return (
    <div className="stack">
      <h1>Data quality</h1>
      {pipeline && <p className="muted">{pipeline.rawListings} valid provider listings → {pipeline.canonicalRestaurants} canonical restaurants · {pipeline.pendingReviews} match(es) awaiting review</p>}
      <div className="card"><h3>Uncertain matches</h3>
        {queue?.length === 0 && <p className="muted">Nothing to review. Every candidate pair has been resolved.</p>}
        {queue?.map(candidate => (
          <div key={candidate.id} className="review">
            <div className="two"><div><b>{candidate.a.providerName}</b><br />{candidate.a.name}<br /><span className="muted small">{candidate.a.address}</span></div><div><b>{candidate.b.providerName}</b><br />{candidate.b.name}<br /><span className="muted small">{candidate.b.address}</span></div></div>
            <p className="muted small">Match score {candidate.score} · name {candidate.parts.name.toFixed(2)} · location {candidate.parts.geo.toFixed(2)} ({candidate.parts.distanceM} m apart) · address {candidate.parts.address.toFixed(2)} · phone {candidate.parts.phone ?? 'not available'}</p>
            <div className="row"><button className="btn" onClick={() => decide(candidate.id, 'merge')}>Same restaurant, merge</button><button className="btn ghost" onClick={() => decide(candidate.id, 'reject')}>Different, keep separate</button></div>
          </div>
        ))}
      </div>
      <div className="card"><h3>Validation issues</h3>
        {pipeline?.issues.length === 0 && <p className="muted">None.</p>}
        {pipeline?.issues.map((issue, index) => <p key={index} className="muted"><b>{issue.providerId}/{issue.recordId}</b> ({issue.level}): {issue.reason}</p>)}
      </div>
    </div>
  );
}
