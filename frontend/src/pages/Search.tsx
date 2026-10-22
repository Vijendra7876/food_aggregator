import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../api';
import type { SearchResult } from '../types';
import { FreshPill } from '../components/FreshPill';

const CUISINES = ['Biryani', 'Pizza', 'Burgers', 'South Indian', 'Chinese', 'Healthy meals'];
export default function Search() {
  const [q, setQ] = useState(''); const [cuisine, setCuisine] = useState('');
  const [res, setRes] = useState<SearchResult[] | null>(null); const [err, setErr] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setRes(null); setErr('');
      api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(q)}&cuisine=${encodeURIComponent(cuisine)}`).then(d => setRes(d.results)).catch(e => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, cuisine]);
  return (
    <>
      <section className="hero">
        <div className="eyebrow">DISCOVER SMARTER</div>
        <h1>Your next meal.<br /><span className="accent-text">A smarter decision.</span></h1>
        <p>Compare meal prices, discover smarter choices, and split orders without the hassle.</p>
        <input className="searchbox" placeholder="Try “biryani” or “pizza palace”" value={q} onChange={e => setQ(e.target.value)} aria-label="Search restaurants and dishes" />
        <div className="chips">{CUISINES.map(c => <button key={c} className={'chip' + (cuisine === c ? ' on' : '')} onClick={() => setCuisine(cuisine === c ? '' : c)}>{c}</button>)}</div>
      </section>
      {err && <div className="state error">{err}</div>}
      {!err && res === null && <div className="state">Searching…</div>}
      {res?.length === 0 && <div className="state">No restaurants match. Try a broader dish name or clear the cuisine filter.</div>}
      <div className="grid">
        {res?.map(r => (
          <Link key={r.id} to={`/r/${r.id}`} className="card result">
            <div className="row between"><h3>{r.name}</h3>{r.rating.combined && <span className="score" title={`Evidence: ${r.rating.evidence}`}>{r.rating.combined.toFixed(1)}</span>}</div>
            <p className="muted">{r.area} · {r.cuisines.join(', ')}</p>
            {r.matchedItems.map(i => <p key={i.name} className="dish">{i.name}: {i.minPrice === i.maxPrice ? inr(i.minPrice) : `${inr(i.minPrice)} to ${inr(i.maxPrice)}`} <span className="muted">across {i.providers} providers</span></p>)}
            <div className="row wrap">{r.providers.map(p => <span key={p.id} className="prov">{p.name}{p.etaMin ? ` ${p.etaMin}m` : ''} <FreshPill f={p.freshness} compact /></span>)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
