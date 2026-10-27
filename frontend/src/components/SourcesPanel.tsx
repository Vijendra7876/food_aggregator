import type { Detail } from '../types';
import { inr } from '../api';
import { FreshPill } from './FreshPill';

export function SourcesPanel({ d }: { d: Detail }) {
  return (
    <div className="stack">
      <div className="card"><h3>Where this data comes from</h3>
        <table className="break"><thead><tr><td>Provider listing</td><td>Delivery / platform fee</td><td>Fetched</td></tr></thead><tbody>
          {d.listings.map(l => <tr key={l.recordId}><td>{l.providerName}: “{l.providerListingName}” <span className="muted">({l.recordId})</span></td><td>{inr(l.deliveryFee)} / {inr(l.platformFee)}</td><td><FreshPill f={l.freshness} /></td></tr>)}
        </tbody></table>
        <p className="muted small">One canonical restaurant, {d.listings.length} provider-specific listings. Prices, fees and ratings stay per provider.</p>
      </div>
      <div className="card"><h3>Conflicts and how they were handled</h3>
        {d.conflicts.length === 0 && <p className="muted">No conflicts detected.</p>}
        {d.conflicts.map((c, i) => <div key={i} className={'conflict ' + c.severity}><b>{c.attribute}</b>: {c.detail}<br /><span className="muted small">Policy: {c.policy}</span></div>)}
      </div>
      <details className="card"><summary>Raw observations ({d.observations.length})</summary>
        <table className="break"><thead><tr><td>Attribute</td><td>Value</td><td>Source</td><td>Observed</td><td>Confidence</td></tr></thead><tbody>
          {d.observations.map((o, i) => <tr key={i}><td>{o.attribute}</td><td>{o.value ?? 'unknown'}</td><td>{o.providerId}</td><td>{new Date(o.observedAt).toLocaleTimeString()}</td><td>{o.confidence}</td></tr>)}
        </tbody></table>
      </details>
    </div>
  );
}
