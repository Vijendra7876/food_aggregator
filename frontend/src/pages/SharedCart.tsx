import { useEffect, useMemo, useRef, useState } from 'react';
import { api, inr } from '../api';
import type { Compare, Detail, SearchResult } from '../types';

interface CartLine { key: number; itemId: string; owner: string; qty: number }

export default function SharedCart() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [people, setPeople] = useState(['You']);
  const [newPerson, setNewPerson] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('You');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [mode, setMode] = useState<'items' | 'split'>('items');
  const [comparison, setComparison] = useState<Compare | null>(null);
  const [providerId, setProviderId] = useState('');
  const nextKey = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearchBusy(true);
      api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}&limit=20`)
        .then(data => { if (!cancelled) { setResults(data.results); setError(''); } })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not search restaurants.'); })
        .finally(() => { if (!cancelled) setSearchBusy(false); });
    }, query ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (!detail || lines.length === 0) {
      setComparison(null);
      setProviderId('');
      return;
    }
    const selections = new Map<string, number>();
    for (const line of lines) selections.set(line.itemId, (selections.get(line.itemId) ?? 0) + line.qty);
    let cancelled = false;
    setBusy(true);
    setError('');
    api<Compare>('/compare', {
      method: 'POST',
      body: JSON.stringify({ restaurantId: detail.id, priority: 'value', selections: [...selections].map(([itemId, qty]) => ({ itemId, qty })) }),
    }).then(data => {
      if (!cancelled) {
        setComparison(data);
        setProviderId(current => data.options.some(option => option.providerId === current) ? current : data.options[0]?.providerId ?? '');
      }
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not compare this basket.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [detail, lines]);

  const option = comparison?.options.find(candidate => candidate.providerId === providerId) ?? comparison?.options[0];
  const priceFor = (line: CartLine) => {
    const item = detail?.items.find(candidate => candidate.id === line.itemId);
    const offer = item?.offers.find(candidate => candidate.providerId === option?.providerId && candidate.available && candidate.price != null);
    return offer?.price == null ? null : offer.price * line.qty;
  };
  const memberSubtotals = useMemo(() => Object.fromEntries(people.map(person => [person, lines.filter(line => line.owner === person).reduce((sum, line) => sum + (priceFor(line) ?? 0), 0)])), [people, lines, detail, option]);
  const subtotal = Object.values(memberSubtotals).reduce((sum, value) => sum + value, 0);
  const addLine = () => {
    if (!detail || !selectedItemId) return;
    const currentQuantity = lines.filter(line => line.itemId === selectedItemId).reduce((sum, line) => sum + line.qty, 0);
    if (currentQuantity >= 20) { setError('A menu item can have at most 20 units in this basket.'); return; }
    setLines(current => [...current, { key: nextKey.current++, itemId: selectedItemId, owner: selectedOwner, qty: 1 }]);
    setError('');
  };
  const addPerson = () => {
    const name = newPerson.trim();
    if (!name || people.some(person => person.toLowerCase() === name.toLowerCase())) return;
    setPeople(current => [...current, name]);
    setNewPerson('');
  };
  const chooseRestaurant = async (restaurant: SearchResult) => {
    setDetail(null);
    setLines([]);
    setComparison(null);
    setError('');
    setDetailBusy(true);
    try {
      const data = await api<Detail>(`/restaurants/${encodeURIComponent(restaurant.id)}`);
      setDetail(data);
      setSelectedItemId(data.items[0]?.id ?? '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load restaurant menu.');
    } finally {
      setDetailBusy(false);
    }
  };

  return (
    <div className="feature-page">
      <div className="eyebrow">SHARED CART <span className="demo-pill">This browser only</span></div>
      <div className="feature-hero"><div><h1>Build a basket and split the estimate.</h1><p>Add items from one restaurant, assign them to local participants, and compare the basket using current CSV-backed menu data.</p></div></div>
      <div className="state">This cart is not synchronized or shared with other people. It is held in this page only and clears when you reload. Invite links and shared sessions are not implemented.</div>
      {!detail && error && <div className="state error" role="alert">{error}</div>}

      <div className="cart-layout">
        <section className="card group-card">
          <div className="section-heading"><div><span className="kicker">01 · RESTAURANT</span><h2>{detail?.name ?? 'Choose a restaurant'}</h2></div></div>
          {!detail && <>
            {detailBusy && <p className="muted">Loading selected menu…</p>}
            <label htmlFor="cart-restaurant-search">Search restaurants</label>
            <input id="cart-restaurant-search" className="field" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by restaurant or dish" />
            {searchBusy && <p className="muted small">Searching…</p>}
            {!searchBusy && !error && results.length === 0 && <p className="muted small">No restaurants found. Try another name.</p>}
            <div className="member-list">{results.map(result => <button type="button" key={result.id} className="btn ghost full" onClick={() => void chooseRestaurant(result)}>{result.name} · {result.area || 'Area unavailable'}</button>)}</div>
          </>}
          {detail && <>
            <p className="muted small">{detail.area} · {detail.cuisines.join(', ')}</p>
            <button type="button" className="btn ghost full" onClick={() => { setDetail(null); setLines([]); }}>Choose another restaurant</button>
            <div className="section-heading"><div><span className="kicker">LOCAL PARTICIPANTS</span><h2>{people.length} participant{people.length === 1 ? '' : 's'}</h2></div></div>
            <div className="row"><input className="field" aria-label="Participant name" placeholder="Add a name" value={newPerson} onChange={event => setNewPerson(event.target.value)} /><button type="button" className="btn ghost" onClick={addPerson}>Add</button></div>
            <p className="muted small">Participant names exist only in this browser session.</p>
          </>}
        </section>

        <section>
          {detail && <div className="card">
            <div className="section-heading"><div><span className="kicker">02 · BASKET</span><h2>Add a menu item</h2></div></div>
            <div className="row wrap">
              <select className="field" aria-label="Menu item" value={selectedItemId} onChange={event => setSelectedItemId(event.target.value)}>{detail.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select className="field" aria-label="Assign item to participant" value={selectedOwner} onChange={event => setSelectedOwner(event.target.value)}>{people.map(person => <option key={person}>{person}</option>)}</select>
              <button type="button" className="btn" disabled={!selectedItemId} onClick={addLine}>Add item</button>
            </div>
            {lines.length === 0 && <p className="state">Add an item to compare provider basket estimates.</p>}
            {lines.map(line => {
              const item = detail.items.find(candidate => candidate.id === line.itemId);
              return <div className="cart-item" key={line.key}>
                <div className="cart-item-info"><b>{item?.name ?? line.itemId}</b><small className="muted">{inr(priceFor(line))} · {option?.providerName ?? 'select an eligible provider'}</small></div>
                <select aria-label={`Owner for ${item?.name ?? line.itemId}`} value={line.owner} onChange={event => setLines(current => current.map(row => row.key === line.key ? { ...row, owner: event.target.value } : row))}>{people.map(person => <option key={person}>{person}</option>)}</select>
                <div className="stepper"><button type="button" aria-label={`Remove one ${item?.name ?? line.itemId}`} onClick={() => setLines(current => current.flatMap(row => row.key !== line.key ? [row] : row.qty > 1 ? [{ ...row, qty: row.qty - 1 }] : []))}>−</button><span>{line.qty}</span><button type="button" aria-label={`Add one ${item?.name ?? line.itemId}`} onClick={() => {
                  const totalQty = lines.filter(row => row.itemId === line.itemId).reduce((sum, row) => sum + row.qty, 0);
                  if (totalQty < 20) setLines(current => current.map(row => row.key === line.key ? { ...row, qty: row.qty + 1 } : row));
                  else setError('A menu item can have at most 20 units in this basket.');
                }}>+</button></div>
                <button type="button" className="icon-btn" aria-label={`Remove ${item?.name ?? line.itemId}`} onClick={() => setLines(current => current.filter(row => row.key !== line.key))}>×</button>
              </div>;
            })}
            {busy && <div className="state">Comparing this basket…</div>}
            {error && <div className="state error" role="alert">{error}</div>}
            {comparison && comparison.options.length > 0 && <>
              <label htmlFor="cart-provider">Estimate from provider</label>
              <select id="cart-provider" className="field" value={option?.providerId} onChange={event => setProviderId(event.target.value)}>{comparison.options.map(candidate => <option key={candidate.providerId} value={candidate.providerId}>{candidate.providerName} · {inr(candidate.pricing.total)}{candidate.pricing.isLowerBound ? ' (lower bound)' : ''}</option>)}</select>
              <div className="estimate"><span>Basket estimate</span><strong>{option?.pricing.isLowerBound ? 'At least ' : ''}{inr(option?.pricing.total)}</strong></div>
              <p className="muted small">{comparison.disclaimer}</p>
            </>}
            {comparison?.options.length === 0 && <div className="state">No provider can fulfil this basket with the available data.</div>}
          </div>}

          {detail && <>
            <div className="tabs compact"><button type="button" className={mode === 'items' ? 'on' : ''} onClick={() => setMode('items')}>Items</button><button type="button" className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')}>Estimate split</button></div>
            {mode === 'split' && <div className="card"><div className="section-heading"><div><h2>Proportional split</h2><span className="muted small">Based on each person&apos;s listed item subtotal</span></div></div>
              {people.map(person => {
                const personSubtotal = memberSubtotals[person] ?? 0;
                const amount = mode === 'split' && option ? (subtotal > 0 ? option.pricing.total * personSubtotal / subtotal : option.pricing.total / people.length) : 0;
                return <div className="share-row" key={person}><b>{person}</b><span className="muted">Items {inr(personSubtotal)}</span><strong>{inr(amount)}</strong></div>;
              })}
              <div className="estimate"><span>Allocated estimate</span><strong>{option?.pricing.isLowerBound ? 'At least ' : ''}{inr(option?.pricing.total)}</strong></div>
              <p className="muted small">This proportional allocation is calculated from the selected provider estimate. Unknown fees are excluded; it is not a bill or a synchronized group payment.</p>
            </div>}
          </>}
        </section>
      </div>
    </div>
  );
}
