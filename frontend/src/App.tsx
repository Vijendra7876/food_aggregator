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
  useEffect(() => {
    api<Meta>('/meta')
      .then(setMeta)
      .catch(() => setDown(true));
  }, []);

  return (
    <>
      {meta?.dataMode === 'synthetic' && <div className="banner">{meta.notice}</div>}

      <header className="top">
        <Link to="/" className="brand">FoodLens</Link>
        <nav>
          <NavLink to="/">Search</NavLink>
          {/* incoming (v0) */}
          <NavLink to="/smart-meal">Smart meal</NavLink>
          <NavLink to="/shared-cart">Shared cart</NavLink>
          <NavLink to="/sustainability">Sustainability</NavLink>
          <NavLink to="/savings">My savings</NavLink>
          {/* original */}
          <NavLink to="/admin">Data quality</NavLink>
          <NavLink to="/login">Log in</NavLink>
        </nav>
      </header>

      <main>
        {down && <div className="state error">The API is unavailable. Check that the backend is running and configure <code>VITE_API_BASE_URL</code> for your deployment.</div>}
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
        <div><span className="section-label">GET STARTED</span><h2>Start saving<br /><span>on every order</span></h2></div>
        <a className="primary-button" href="https://github.com/vedu989v-wq/Online_food_delivery_aggregator" target="_blank" rel="noreferrer">View on GitHub <span>↗</span></a>
      </footer>
    </>
  );
}
