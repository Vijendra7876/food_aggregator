import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface Cand { id: string; score: number; parts: { name: number; geo: number; address: number; phone: number | null; distanceM: number };
  a: { providerName: string; name: string; address: string }; b: { providerName: string; name: string; address: string } }
interface Pipe { rawListings: number; canonicalRestaurants: number; pendingReviews: number; issues: { providerId: string; recordId: string; level: string; reason: string }[] }

export default function Admin() {
  const [q, setQ] = useState<Cand[] | null>(null); const [p, setP] = useState<Pipe | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => {
    api<{ pending: Cand[] }>('/admin/review-queue').then(d => setQ(d.pending)).catch(e => setErr(e.message));
    api<Pipe>('/admin/pipeline').then(setP).catch(e => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const decide = (id: string, verdict: 'merge' | 'reject') => api(`/admin/review-queue/${id}/decision`, { method: 'POST', body: JSON.stringify({ verdict }) }).then(load).catch(e => setErr(e.message));
  if (err) return <div className="state error">{err}</div>;
  return (
    <div className="stack">
      <h1>Data quality</h1>
      {p && <p className="muted">{p.rawListings} valid provider listings → {p.canonicalRestaurants} canonical restaurants · {p.pendingReviews} match(es) awaiting review</p>}
      <div className="card"><h3>Uncertain matches</h3>
        {q?.length === 0 && <p className="muted">Nothing to review. Every candidate pair has been resolved.</p>}
        {q?.map(c => (
          <div key={c.id} className="review">
            <div className="two"><div><b>{c.a.providerName}</b><br />{c.a.name}<br /><span className="muted small">{c.a.address}</span></div><div><b>{c.b.providerName}</b><br />{c.b.name}<br /><span className="muted small">{c.b.address}</span></div></div>
            <p className="muted small">Match score {c.score} · name {c.parts.name.toFixed(2)} · location {c.parts.geo.toFixed(2)} ({c.parts.distanceM} m apart) · address {c.parts.address.toFixed(2)} · phone {c.parts.phone ?? 'not available'}</p>
            <div className="row"><button className="btn" onClick={() => decide(c.id, 'merge')}>Same restaurant, merge</button><button className="btn ghost" onClick={() => decide(c.id, 'reject')}>Different, keep separate</button></div>
          </div>))}
      </div>
      <div className="card"><h3>Validation issues</h3>
        {p?.issues.length === 0 && <p className="muted">None.</p>}
        {p?.issues.map((i, k) => <p key={k} className="muted"><b>{i.providerId}/{i.recordId}</b> ({i.level}): {i.reason}</p>)}
      </div>
    </div>
  );
}
