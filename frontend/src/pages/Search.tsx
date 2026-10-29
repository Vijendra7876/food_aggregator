import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../api';
import type { SearchResult } from '../types';
import { FreshPill } from '../components/FreshPill';

const CUISINES = ['Biryani', 'Pizza', 'Mughlai', 'Italian'];

export default function Search() {
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [res, setRes] = useState<SearchResult[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setRes(null);
      setErr('');
      api<{ results: SearchResult[]; total: number }>(`/search?q=${encodeURIComponent(q)}&cuisine=${encodeURIComponent(cuisine)}&page=${page}&pageSize=20`)
        .then(data => { if (!cancelled) { setRes(data.results); setTotal(data.total); } })
        .catch(error => { if (!cancelled) setErr(error instanceof Error ? error.message : 'Search failed.'); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [q, cuisine, page]);

  return (
    <>
      <section className="hero">
        <h1>One restaurant. Every provider. The real total.</h1>
        <p>Search a dish or restaurant and see what each delivery app would actually charge, how fast, and how reliable.</p>
        <input className="searchbox" placeholder="Try “biryani” or “pizza palace”" value={q} onChange={event => { setQ(event.target.value); setPage(1); }} aria-label="Search restaurants and dishes" />
        <div className="chips">{CUISINES.map(item => <button key={item} className={'chip' + (cuisine === item ? ' on' : '')} onClick={() => { setCuisine(cuisine === item ? '' : item); setPage(1); }}>{item}</button>)}</div>
      </section>
      {err && <div className="state error">{err}</div>}
      {!err && res === null && <div className="state">Searching…</div>}
      {res?.length === 0 && <div className="state">No restaurants match. Try a broader dish name or clear the cuisine filter.</div>}
      <div className="grid">
        {res?.map(restaurant => (
          <Link key={restaurant.id} to={`/r/${restaurant.id}`} className="card result">
            <div className="row between"><h3>{restaurant.name}</h3>{restaurant.rating.combined && <span className="score" title={`Evidence: ${restaurant.rating.evidence}`}>{restaurant.rating.combined.toFixed(1)}</span>}</div>
            <p className="muted">{restaurant.area} · {restaurant.cuisines.join(', ')}</p>
            {restaurant.matchedItems.map(item => <p key={item.name} className="dish">{item.name}: {item.minPrice === item.maxPrice ? inr(item.minPrice) : `${inr(item.minPrice)} to ${inr(item.maxPrice)}`} <span className="muted">across {item.providers} providers</span></p>)}
            <div className="row wrap">{restaurant.providers.map(provider => <span key={provider.id} className="prov">{provider.name}{provider.etaMin ? ` ${provider.etaMin}m` : ''} <FreshPill f={provider.freshness} compact /></span>)}</div>
          </Link>
        ))}
      </div>
      {total > 20 && <div className="row between" aria-label="Search pagination"><span className="muted small">Page {page} of {Math.ceil(total / 20)} · {total} matching restaurants</span><div className="row"><button className="btn ghost" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Previous</button><button className="btn ghost" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(current => current + 1)}>Next</button></div></div>}
    </>
  );
}
