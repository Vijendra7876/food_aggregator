import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api';
import type { Meta } from './types';
import Search from './pages/Search';
import Restaurant from './pages/Restaurant';
import Admin from './pages/Admin';
import SmartMeal from './pages/SmartMeal';
import SharedCart from './pages/SharedCart';
import { Sustainability, Savings } from './pages/Insights';

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => { api<Meta>('/meta').then(setMeta).catch(() => setDown(true)); }, []);
  return (
    <>
      {meta?.dataMode === 'synthetic' && <div className="banner">{meta.notice}</div>}
      <header className="top">
        <Link to="/" className="brand"><span className="brand-mark">F</span><span>FoodLens</span></Link>
        <nav className="main-nav"><NavLink to="/">Discover</NavLink><NavLink to="/smart-meal">Smart Meal</NavLink><NavLink to="/shared-cart">Shared Cart</NavLink><NavLink to="/sustainability">Sustainability</NavLink><NavLink to="/savings">My Savings</NavLink><NavLink to="/admin">Data quality</NavLink></nav>
      </header>
      <main>
        {down && <div className="state error">Can't reach the API. Start the backend with <code>npm run dev</code> in /backend.</div>}
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/r/:id" element={<Restaurant />} />
          <Route path="/search" element={<Search />} />
          <Route path="/smart-meal" element={<SmartMeal />} />
          <Route path="/shared-cart" element={<SharedCart />} />
          <Route path="/sustainability" element={<Sustainability />} />
          <Route path="/savings" element={<Savings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<div className="state">Page not found. <Link to="/">Back to search</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
