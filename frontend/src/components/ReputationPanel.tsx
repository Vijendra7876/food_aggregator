import type { Detail } from '../types';

const LABEL = { food: 'Food', delivery: 'Delivery', value: 'Value for money', service: 'Service' } as const;

export function ReputationPanel({ d }: { d: Detail }) {
  const r = d.reputation;
  return (
    <div className="stack">
      <div className="card">
        <h3>Overall</h3>
        <p className="big">{r.rating.combined?.toFixed(2) ?? 'n/a'}<small> / 5 confidence-weighted</small></p>
        <p className="muted">Evidence level: <b>{r.evidence}</b> · {r.reviewsAnalyzed} reviews analysed · {r.duplicatesRemoved} duplicate review(s) removed</p>
        {r.foodQuality && <p>Food quality: <b>{r.foodQuality.value.toFixed(2)}</b> <span className="muted">({r.foodQuality.basis})</span></p>}
        <table className="break"><thead><tr><td>Source</td><td>Raw</td><td>Ratings</td><td>Adjusted</td></tr></thead><tbody>
          {r.rating.perSource.map(s => <tr key={s.providerId}><td>{d.listings.find(l => l.providerId === s.providerId)?.providerName}</td><td>{s.raw}</td><td>{s.count}</td><td>{s.adjusted}</td></tr>)}
        </tbody></table>
        <p className="muted small">Sources with few ratings are pulled toward a prior, so 4.4 from 95 ratings does not outrank 4.3 from 1,240.</p>
      </div>
      <div className="card">
        <h3>What reviewers talk about</h3>
        {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map(k => {
          const a = r.aspects[k];
          return (
            <div key={k} className="factor"><span>{LABEL[k]} · {a.mentions} mention{a.mentions === 1 ? '' : 's'}{!a.enough && ' · low evidence'}</span>
              <div className="bar"><i className={a.enough ? '' : 'faded'} style={{ width: `${(a.score ?? 0) * 100}%` }} /></div></div>
          );
        })}
        <h4>Delivery sentiment by provider</h4>
        {d.listings.map(l => {
          const a = r.providerDelivery[l.providerId];
          return <p key={l.providerId} className="muted">{l.providerName}: {a?.enough ? `${Math.round((a.score ?? 0) * 100)}/100 (${a.mentions} mentions)` : `not enough delivery reviews (${a?.mentions ?? 0})`}</p>;
        })}
      </div>
      <div className="card two">
        <div><h4>Praised</h4>{r.highlights.positive.map((h, i) => <p key={i} className="quote good">“{h.snippet}” <span className="muted">· {h.aspect}</span></p>)}</div>
        <div><h4>Criticised</h4>{r.highlights.negative.map((h, i) => <p key={i} className="quote bad">“{h.snippet}” <span className="muted">· {h.aspect}</span></p>)}</div>
      </div>
      <p className="muted small">{r.disclaimer} Method: {r.method}.</p>
    </div>
  );
}
