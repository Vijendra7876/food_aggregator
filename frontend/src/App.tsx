import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api';
import type { Meta } from './types';
import Search from './pages/Search';
import Restaurant from './pages/Restaurant';
import Admin from './pages/Admin';
import Login from './pages/Login';
// incoming (v0) pages
import SmartMeal from './pages/SmartMeal';
import SharedCart from './pages/SharedCart';
import { Sustainability, Savings } from './pages/Insights';

export default function App() {
  // original: API status + synthetic-data banner
  const [meta, setMeta] = useState<Meta | null>(null);
  const [down, setDown] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    setDown(false);
    api<Meta>('/meta')
      .then(data => { setMeta(data); setDown(false); })
      .catch(() => setDown(true));
  }, [retryCount]);

  return (
    <>
      {meta?.dataMode === 'synthetic' && <div className="banner">{meta.notice}</div>}

      <header className="top">
        <Link to="/" className="brand">FoodLens</Link>
        <nav>
          <NavLink to="/">Search</NavLink>
          <NavLink to="/smart-meal">Smart meal</NavLink>
          <NavLink to="/shared-cart">Basket split</NavLink>
          <NavLink to="/sustainability">Sustainability</NavLink>
          <NavLink to="/savings">My savings</NavLink>
          <NavLink to="/admin">Data quality</NavLink>
          <NavLink to="/login">Account</NavLink>
        </nav>
      </header>

      <main>
        {down && <div className="state error">The API is unavailable. Check that the backend is running and configure <code>VITE_API_BASE_URL</code> for your deployment. <button className="btn ghost" onClick={() => setRetryCount(count => count + 1)}>Retry connection</button></div>}
        <Routes>
          {/* original routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Search />} />
          <Route path="/r/:id" element={<Restaurant />} />
          <Route path="/admin" element={<Admin />} />
          {/* incoming (v0) routes */}
          <Route path="/smart-meal" element={<SmartMeal />} />
          <Route path="/shared-cart" element={<SharedCart />} />
          <Route path="/sustainability" element={<Sustainability />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="*" element={<div className="state">Page not found. <Link to="/">Back to search</Link></div>} />
        </Routes>
      </main>

      {/* incoming (v0) footer, moved inside the single root fragment */}
      <footer id="contact">
        <div className="footer-brand"><span className="brand-orbit"><span>F</span></span><b>FoodLens</b><p>Make every penny worth spending.</p></div>
        <div><span className="section-label">GET STARTED</span><h2>Compare clearly<br /><span>choose confidently</span></h2></div>
        <a className="primary-button" href="https://github.com/vedu989v-wq/Online_food_delivery_aggregator" target="_blank" rel="noreferrer">View on GitHub <span>↗</span></a>
      </footer>
    </>
  );
}
