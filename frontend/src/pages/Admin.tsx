import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { ReviewSignalsResponse } from '../types';

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
  menuItems: number;
  offers: number;
  reviews: number;
  pendingReviews: number;
  issueCount: number;
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
  const [signals, setSignals] = useState<ReviewSignalsResponse | null>(null);
  const [signalError, setSignalError] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    setErr('');
    api<ReviewQueue>('/admin/review-queue').then(data => { setQueue(data.pending); setMutationsEnabled(data.mutationsEnabled); }).catch(error => setErr(error instanceof Error ? error.message : 'Could not load review queue.'));
    api<Pipeline>('/admin/pipeline').then(setPipeline).catch(error => setErr(error instanceof Error ? error.message : 'Could not load pipeline status.'));
    api<ReviewSignalsResponse>('/intelligence/review-signals').then(setSignals).catch(error => setSignalError(error instanceof Error ? error.message : 'Could not load review signals.'));
  }, []);

  useEffect(load, [load]);

  const decide = (id: string, decision: 'merge' | 'keep_separate') =>
    api(`/admin/review-queue/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ decision }) })
      .then(load)
      .catch(error => setErr(error instanceof Error ? error.message : 'Could not record this demo decision.'));

  if (err) return <div className="state error" role="alert">{err} <button className="btn ghost" onClick={load}>Retry</button></div>;

  return (
    <div className="stack">
      <h1>Data quality</h1>
      {!pipeline && <p className="muted">Loading dataset metrics…</p>}
      {pipeline && <p className="muted">{pipeline.rawListings} provider listings · {pipeline.canonicalRestaurants} canonical restaurants · {pipeline.menuItems} menu rows · {pipeline.offers} offers · {pipeline.reviews} reviews · {pipeline.pendingReviews} synthetic match examples · {pipeline.issueCount} validation issue(s)</p>}
      <div className="state">Demo review examples only. Decisions are held in memory, do not change canonical assignments, and are cleared when Python restarts.{!mutationsEnabled && ' Review actions are disabled; enable them only for local development.'}</div>
      <div className="card"><h3>Uncertain matches</h3>
        {queue === null && <p className="muted">Loading review examples…</p>}
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
        {pipeline?.issueCount === 0 && <p className="muted">None.</p>}
        {pipeline && pipeline.issueCount > pipeline.issues.length && <p className="muted small">Showing {pipeline.issues.length} of {pipeline.issueCount} issues.</p>}
        {pipeline?.issues.map((issue, index) => <p key={index} className="muted"><b>{issue.providerId}/{issue.recordId}</b> ({issue.level}): {issue.reason}</p>)}
      </div>
      <div className="card"><h3>Review pattern signals</h3>
        {signalError && <p className="state error">{signalError}</p>}
        {!signals && !signalError && <p className="muted">Loading review signals…</p>}
        {signals && <>
          <p className="muted">{signals.totalReviews} review records · {signals.signalCount} pattern signals</p>
          <p className="muted small">{signals.disclaimer}</p>
          {signals.signals.length === 0 && <p className="muted">No patterns met the current signal rules.</p>}
          {signals.signals.map((signal, index) => <div className="review" key={`${signal.type}-${signal.reviewIds[0] ?? index}`}>
            <b>{signal.type === 'repeated_text' ? `Repeated text · ${signal.reviewCount} records` : `Same-day volume cluster · ${signal.reviewCount} records`}</b>
            <p className="muted small">{signal.reason}</p>
            {signal.providers && <p className="muted small">Providers: {signal.providers.join(', ')}</p>}
            {signal.date && <p className="muted small">Date: {signal.date} · Provider: {signal.provider}</p>}
            {signal.excerpt && <p className="quote">“{signal.excerpt}”</p>}
          </div>)}
        </>}
      </div>
    </div>
  );
}
