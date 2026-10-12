import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, inr } from '../api';
import type { Compare, Detail, Priority } from '../types';
import { ProviderCard } from '../components/ProviderCard';
import { ReputationPanel } from '../components/ReputationPanel';
import { SourcesPanel } from '../components/SourcesPanel';

const PRIORITIES: [Priority, string][] = [['value', 'Best value'], ['cheapest', 'Cheapest'], ['fastest', 'Fastest'], ['reliable', 'Most reliable'], ['rated', 'Best rated']];

export default function Restaurant() {
  const { id } = useParams();
  const [d, setD] = useState<Detail | null>(null); const [err, setErr] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [priority, setPriority] = useState<Priority>('value'); const [maxEta, setMaxEta] = useState('');
  const [cmp, setCmp] = useState<Compare | null>(null); const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'compare' | 'reputation' | 'sources'>('compare');

  useEffect(() => { setD(null); api<Detail>(`/restaurants/${id}`).then(x => { setD(x); setQty(x.items[0] ? { [x.items[0].id]: 1 } : {}); }).catch(e => setErr(e.message)); }, [id]);

  useEffect(() => {
    if (!d) return;
    const selections = Object.entries(qty).filter(([, q]) => q > 0).map(([itemId, q]) => ({ itemId, qty: q }));
    if (!selections.length) { setCmp(null); return; }
    setBusy(true);
    api<Compare>('/compare', { method: 'POST', body: JSON.stringify({ restaurantId: d.id, selections, priority, maxEta: maxEta ? Number(maxEta) : undefined }) })
      .then(setCmp).catch(e => setErr(e.message)).finally(() => setBusy(false));
  }, [d, qty, priority, maxEta]);

  if (err) return <div className="state error">{err}</div>;
  if (!d) return <div className="state">Loading restaurant…</div>;
  const set = (itemId: string, n: number) => setQty(q => ({ ...q, [itemId]: Math.max(0, Math.min(20, n)) }));

  return (
    <>
      <div className="rhead"><h1>{d.name}</h1><p className="muted">{d.area} · {d.cuisines.join(', ')}{d.phone ? ` · ${d.phone}` : ''} · listed on {d.listings.length} provider(s)</p></div>
      <div className="tabs" role="tablist">{(['compare', 'reputation', 'sources'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ compare: 'Compare prices', reputation: 'Reputation', sources: 'Sources & freshness' }[t]}</button>)}</div>
      {tab === 'reputation' && <ReputationPanel d={d} />}
      {tab === 'sources' && <SourcesPanel d={d} />}
      {tab === 'compare' && (
        <div className="split">
          <aside className="card menu"><h3>Your basket</h3>
            {d.items.map(i => (
              <div key={i.id} className="item"><div><b>{i.veg ? '🟢 ' : '🔴 '}{i.name}</b><br /><span className="muted small">{i.offers.filter(o => o.available).length}/{d.listings.length} providers · {inr(Math.min(...i.offers.filter(o => o.price != null).map(o => o.price as number)))} up</span></div>
                <div className="stepper"><button aria-label={`Remove one ${i.name}`} onClick={() => set(i.id, (qty[i.id] ?? 0) - 1)}>−</button><span>{qty[i.id] ?? 0}</span><button aria-label={`Add one ${i.name}`} onClick={() => set(i.id, (qty[i.id] ?? 0) + 1)}>+</button></div></div>))}
          </aside>
          <section>
            <div className="controls">
              <div className="chips">{PRIORITIES.map(([k, l]) => <button key={k} className={'chip' + (priority === k ? ' on' : '')} onClick={() => setPriority(k)}>{l}</button>)}</div>
              <label className="muted">Max delivery time <input type="number" min={10} placeholder="any" value={maxEta} onChange={e => setMaxEta(e.target.value)} /> min</label>
            </div>
            {!cmp && !busy && <div className="state">Add at least one item to compare providers.</div>}
            {busy && !cmp && <div className="state">Comparing…</div>}
            {cmp && <div className="grid cards">{cmp.options.map(o => <ProviderCard key={o.providerId} o={o} />)}</div>}
            {cmp?.options.length === 0 && <div className="state">No provider can fulfil this basket within your limits.</div>}
            {cmp?.excluded.map(x => <div key={x.providerId} className="state excluded"><b>{x.providerName}</b>: {x.reason}</div>)}
            {cmp && <p className="muted small">{cmp.disclaimer} Weights are starting hypotheses, not facts.</p>}
          </section>
        </div>
      )}
    </>
  );
}
