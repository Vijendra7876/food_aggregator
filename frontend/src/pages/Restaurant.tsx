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
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [priority, setPriority] = useState<Priority>('value');
  const [maxEta, setMaxEta] = useState('');
  const [compare, setCompare] = useState<Compare | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'compare' | 'reputation' | 'sources'>('compare');

  useEffect(() => {
    setDetail(null);
    setErr('');
    if (!id) return;
    api<Detail>(`/restaurants/${encodeURIComponent(id)}`).then(data => {
      setDetail(data);
      setQty(data.items[0] ? { [data.items[0].id]: 1 } : {});
    }).catch(error => setErr(error instanceof Error ? error.message : 'Could not load this restaurant.'));
  }, [id]);

  useEffect(() => {
    if (!detail) return;
    const selections = Object.entries(qty).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ itemId, qty: quantity }));
    if (!selections.length) { setCompare(null); return; }
    setBusy(true);
    setErr('');
    api<Compare>('/compare', {
      method: 'POST',
      body: JSON.stringify({ restaurantId: detail.id, selections, priority, maxEta: maxEta ? Number(maxEta) : undefined }),
    }).then(setCompare).catch(error => setErr(error instanceof Error ? error.message : 'Could not compare providers.')).finally(() => setBusy(false));
  }, [detail, qty, priority, maxEta]);

  if (err) return <div className="state error">{err}</div>;
  if (!detail) return <div className="state">Loading restaurant…</div>;
  const setItemQuantity = (itemId: string, quantity: number) => setQty(current => ({ ...current, [itemId]: Math.max(0, Math.min(20, quantity)) }));

  return (
    <>
      <div className="rhead"><h1>{detail.name}</h1><p className="muted">{detail.area} · {detail.cuisines.join(', ')}{detail.phone ? ` · ${detail.phone}` : ''} · listed on {detail.listings.length} provider(s)</p></div>
      <div className="tabs" role="tablist">{(['compare', 'reputation', 'sources'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? 'on' : ''} onClick={() => setTab(item)}>{{ compare: 'Compare prices', reputation: 'Reputation', sources: 'Sources & freshness' }[item]}</button>)}</div>
      {tab === 'reputation' && <ReputationPanel d={detail} />}
      {tab === 'sources' && <SourcesPanel d={detail} />}
      {tab === 'compare' && (
        <div className="split">
          <aside className="card menu"><h3>Your basket</h3>
            {detail.items.map(item => {
              const knownPrices = item.offers.filter(offer => offer.price != null).map(offer => offer.price as number);
              return (
                <div key={item.id} className="item"><div><b>{item.veg ? '🟢 ' : '🔴 '}{item.name}</b><br /><span className="muted small">{item.offers.filter(offer => offer.available).length}/{detail.listings.length} providers · {inr(knownPrices.length ? Math.min(...knownPrices) : null)} up</span></div>
                  <div className="stepper"><button aria-label={`Remove one ${item.name}`} onClick={() => setItemQuantity(item.id, (qty[item.id] ?? 0) - 1)}>−</button><span>{qty[item.id] ?? 0}</span><button aria-label={`Add one ${item.name}`} onClick={() => setItemQuantity(item.id, (qty[item.id] ?? 0) + 1)}>+</button></div></div>
              );
            })}
          </aside>
          <section>
            <div className="controls">
              <div className="chips">{PRIORITIES.map(([key, label]) => <button key={key} className={'chip' + (priority === key ? ' on' : '')} onClick={() => setPriority(key)}>{label}</button>)}</div>
              <label className="muted">Max delivery time <input type="number" min={10} placeholder="any" value={maxEta} onChange={event => setMaxEta(event.target.value)} /> min</label>
            </div>
            {!compare && !busy && <div className="state">Add at least one item to compare providers.</div>}
            {busy && !compare && <div className="state">Comparing…</div>}
            {compare && <div className="grid cards">{compare.options.map(option => <ProviderCard key={option.providerId} o={option} />)}</div>}
            {compare?.options.length === 0 && <div className="state">No provider can fulfil this basket within your limits.</div>}
            {compare?.excluded.map(option => <div key={option.providerId} className="state excluded"><b>{option.providerName}</b>: {option.reason}</div>)}
            {compare && <p className="muted small">{compare.disclaimer} Weights are starting hypotheses, not facts.</p>}
          </section>
        </div>
      )}
    </>
  );
}
