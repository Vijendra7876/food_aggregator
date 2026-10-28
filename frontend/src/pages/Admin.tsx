import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

interface Candidate {
  id: string;
  similarityCase: string;
  rationale: string;
  a: { providerId: string; providerName: string; name: string; address: string };
  b: { providerId: string; providerName: string; name: string; address: string };
}
interface Pipeline {
  rawListings: number;
  canonicalRestaurants: number;
  pendingReviews: number;
  issues: { providerId: string; recordId: string; level: string; reason: string }[];
  demoOnly: boolean;
  persistence: string;
  mutationsEnabled: boolean;
}
interface ReviewQueue { pending: Candidate[]; mutationsEnabled: boolean; demoOnly: boolean; persistence: string }

export default function Admin() {
  const [queue, setQueue] = useState<Candidate[] | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [mutationsEnabled, setMutationsEnabled] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setErr('');
    api<ReviewQueue>('/admin/review-queue').then(data => { setQueue(data.pending); setMutationsEnabled(data.mutationsEnabled); }).catch(error => setErr(error instanceof Error ? error.message : 'Could not load review queue.'));
    api<Pipeline>('/admin/pipeline').then(setPipeline).catch(error => setErr(error instanceof Error ? error.message : 'Could not load pipeline status.'));
  }, []);

  useEffect(load, [load]);

  const decide = (id: string, decision: 'merge' | 'keep_separate') =>
    api(`/admin/review-queue/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ decision }) })
      .then(load)
      .catch(error => setErr(error instanceof Error ? error.message : 'Could not record this demo decision.'));

  if (err) return <div className="state error">{err}</div>;

  return (
    <div className="stack">
      <h1>Data quality</h1>
      {pipeline && <p className="muted">{pipeline.rawListings} provider listings → {pipeline.canonicalRestaurants} canonical restaurants · {pipeline.pendingReviews} synthetic review sample(s)</p>}
      <div className="state">Demo review examples only. Decisions are held in memory, do not change canonical assignments, and are cleared when Python restarts.{!mutationsEnabled && ' Review actions are disabled; enable them only for local development.'}</div>
      <div className="card"><h3>Uncertain matches</h3>
        {queue?.length === 0 && <p className="muted">No pending synthetic review examples.</p>}
        {queue?.map(candidate => (
          <div key={candidate.id} className="review">
            <div className="two"><div><b>{candidate.a.providerName}</b><br />{candidate.a.name}<br /><span className="muted small">{candidate.a.address}</span></div><div><b>{candidate.b.providerName}</b><br />{candidate.b.name}<br /><span className="muted small">{candidate.b.address}</span></div></div>
            <p className="muted small">Synthetic case: {candidate.similarityCase}. {candidate.rationale}</p>
            <div className="row"><button className="btn" disabled={!mutationsEnabled} onClick={() => decide(candidate.id, 'merge')}>Demo decision: same restaurant</button><button className="btn ghost" disabled={!mutationsEnabled} onClick={() => decide(candidate.id, 'keep_separate')}>Demo decision: keep separate</button></div>
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
