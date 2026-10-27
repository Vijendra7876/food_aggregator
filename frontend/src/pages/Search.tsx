import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../api';
import type { SearchResult } from '../types';
import { FreshPill } from '../components/FreshPill';

const CUISINES = ['Biryani', 'Pizza', 'Mughlai', 'Italian'];
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
      <section className="home-hero">
        <div className="home-copy">
          <p className="home-eyebrow"><span aria-hidden="true">✦</span> YOUR FOOD, YOUR WAY</p>
          <h1>Good food.<br /><span>Better choices.</span></h1>
          <p className="home-description">Compare restaurant prices, delivery fees, ratings, and more in one place. Find what you love, then choose the deal that works for you.</p>
          <div className="home-actions">
            <a className="home-primary" href="#restaurant-search">Explore restaurants <span aria-hidden="true">↓</span></a>
            <Link className="home-secondary" to="/login">Log in <span aria-hidden="true">→</span></Link>
          </div>
          <div className="home-trust"><span className="trust-stars" aria-hidden="true">★★★★★</span><span>Make every order a smarter one</span></div>
        </div>
        <div className="home-art" aria-label="FoodLens helps compare food delivery options">
          <div className="home-orbit orbit-one" />
          <div className="home-orbit orbit-two" />
          <div className="home-food" aria-hidden="true">🍜</div>
          <div className="home-float float-price"><span className="float-icon" aria-hidden="true">₹</span><span><strong>Compare prices</strong><small>One easy view</small></span></div>
          <div className="home-float float-rating"><span className="float-icon rating-icon" aria-hidden="true">★</span><span><strong>Choose with confidence</strong><small>Ratings &amp; freshness</small></span></div>
          <span className="home-spark spark-one" aria-hidden="true">✳</span>
          <span className="home-spark spark-two" aria-hidden="true">✦</span>
        </div>
      </section>

      <section className="home-search-section" id="restaurant-search">
        <div className="home-section-heading">
          <div><p className="home-eyebrow">FIND YOUR NEXT FAVOURITE</p><h2>What are you craving?</h2></div>
          <p>Search a dish or restaurant and compare the real total across providers.</p>
        </div>
        <div className="home-search-card">
          <label className="home-search-label" htmlFor="restaurant-search-input">Restaurant or dish</label>
          <div className="home-search-control">
            <span aria-hidden="true">⌕</span>
            <input id="restaurant-search-input" className="searchbox" placeholder="Try “biryani” or “pizza palace”" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="chips" aria-label="Filter by cuisine">{CUISINES.map(c => <button key={c} className={'chip' + (cuisine === c ? ' on' : '')} aria-pressed={cuisine === c} onClick={() => setCuisine(cuisine === c ? '' : c)}>{c}</button>)}</div>
        </div>
      </section>
      <section className="home-benefits" aria-label="FoodLens benefits">
        <article><span aria-hidden="true">₹</span><div><h3>See the full price</h3><p>Compare what your order really costs across providers.</p></div></article>
        <article><span aria-hidden="true">◷</span><div><h3>Know what to expect</h3><p>Check delivery estimates and ratings before you decide.</p></div></article>
        <article><span aria-hidden="true">♡</span><div><h3>Make it yours</h3><p><Link to="/login">Log in</Link> to get started with a more personal experience.</p></div></article>
      </section>
      {err && <div className="state error">{err}</div>}
      {!err && res === null && <div className="state">Searching…</div>}
      {res?.length === 0 && <div className="state">No restaurants match. Try a broader dish name or clear the cuisine filter.</div>}
      {res && res.length > 0 && <div className="home-results-heading"><p className="home-eyebrow">MADE FOR YOUR CRAVINGS</p><h2>Restaurants to explore</h2></div>}
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
