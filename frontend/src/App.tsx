import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api';
import type { Meta } from './types';
import Search from './pages/Search';
import Restaurant from './pages/Restaurant';
import Admin from './pages/Admin';

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => { api<Meta>('/meta').then(setMeta).catch(() => setDown(true)); }, []);
  return (
    <>
      {meta?.dataMode === 'synthetic' && <div className="banner">{meta.notice}</div>}
      <header className="top">
        <Link to="/" className="brand">FoodLens</Link>
        <nav><NavLink to="/">Search</NavLink><NavLink to="/admin">Data quality</NavLink></nav>
      </header>
      <main>
        {down && <div className="state error">Can't reach the API. Start the backend with <code>npm run dev</code> in /backend.</div>}
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/r/:id" element={<Restaurant />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<div className="state">Page not found. <Link to="/">Back to search</Link></div>} />
        </Routes>
      </main>
    </>
  );
}
