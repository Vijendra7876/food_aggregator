import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../api';
import { FreshPill } from '../components/FreshPill';
import type { Priority, RecommendationResponse } from '../types';

const PRIORITIES: [Priority | 'balanced', string][] = [
  ['balanced', 'Balanced value'], ['cheapest', 'Cheapest'], ['fastest', 'Fastest'],
  ['reliable', 'Most reliable'], ['rated', 'Best rated'],
];

export default function SmartMeal() {
  const [budget, setBudget] = useState('500');
  const [people, setPeople] = useState('2');
  const [vegetarian, setVegetarian] = useState(true);
  const [cuisine, setCuisine] = useState('');
  const [priority, setPriority] = useState<Priority | 'balanced'>('balanced');
  const [cuisineOptions, setCuisineOptions] = useState<string[]>([]);
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ cuisines?: string[] }>('/meta').then(meta => setCuisineOptions(meta.cuisines ?? [])).catch(() => setCuisineOptions([]));
  }, []);

  useEffect(() => {
    const budgetValue = Number(budget);
    const peopleValue = Number(people);
    if (!Number.isFinite(budgetValue) || budgetValue <= 0 || !Number.isInteger(peopleValue) || peopleValue < 1 || peopleValue > 12) {
      setData(null);
      setBusy(false);
      setError('Enter a positive per-person budget and a group size from 1 to 12.');
      return;
    }
    const query = new URLSearchParams({
      budgetPerPerson: String(budgetValue), people: String(peopleValue),
      vegetarian: String(vegetarian), cuisine,
      priority: priority === 'balanced' ? 'value' : priority,
      limit: '12',
    });
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError('');
      api<RecommendationResponse>(`/intelligence/recommendations?${query.toString()}`)
        .then(response => { if (!cancelled) setData(response); })
        .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load menu recommendations.'); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [budget, people, vegetarian, cuisine, priority]);

  return (
    <div className="feature-page">
      <div className="eyebrow">SMART MEAL <span className="demo-pill">CSV-backed suggestions</span></div>
      <div className="feature-hero"><div><h1>Make the meal decision easier.</h1><p>Suggestions use available menu prices, ratings, delivery feedback, and your selected priorities. Every result explains its evidence.</p></div><div className="spark-card"><span className="spark">FL</span><b>Preference-aware ranking</b><small>Uses synthetic menu records, not a trained AI model.</small></div></div>
      <div className="smart-layout">
        <section className="card preference-card">
          <div className="section-heading"><div><span className="kicker">01</span><h2>Your preferences</h2></div></div>
          <label>Budget per person<input className="field" type="number" min="1" value={budget} onChange={event => setBudget(event.target.value)} aria-label="Budget per person" /></label>
          <label>People<input className="field" type="number" min="1" max="12" value={people} onChange={event => setPeople(event.target.value)} aria-label="Number of people" /></label>
          <label>Cuisine preference<select className="field" value={cuisine} onChange={event => setCuisine(event.target.value)}><option value="">Any cuisine</option>{cuisineOptions.map(value => <option key={value}>{value}</option>)}</select></label>
          <div className="toggle-row"><div><b>Vegetarian only</b><small className="muted">Exclude menu items not labeled vegetarian</small></div><button type="button" className={'toggle ' + (vegetarian ? 'on' : '')} onClick={() => setVegetarian(!vegetarian)} aria-pressed={vegetarian}><span /></button></div>
          <label>Tonight&apos;s priority<select className="field" value={priority} onChange={event => setPriority(event.target.value as Priority | 'balanced')}>{PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="constraint-note"><b>Allergy information is unavailable</b><p className="small muted">The CSVs do not contain verified ingredients or allergen data. Do not use these suggestions to assess allergy safety.</p></div>
        </section>
        <section>
          <div className="section-heading results-heading"><div><span className="kicker">02</span><h2>Menu matches</h2></div><span className="muted small">{data ? `${data.total} candidates ranked` : ''}</span></div>
          {busy && <div className="state">Finding menu matches…</div>}
          {error && <div className="state error" role="alert">{error}</div>}
          {!busy && !error && data?.recommendations.length === 0 && <div className="state">{data.message ?? 'No menu matches found. Try a wider budget or another cuisine.'}</div>}
          <div className="recommendations">{data?.recommendations.map((item, index) => (
            <article className={'recommendation card ' + (index === 0 ? 'recommended' : '')} key={item.id}>
              <div className={`meal-art art-${index % 3}`}><span>{item.vegetarian ? 'VEG' : 'MENU'}</span></div>
              <div className="recommendation-body">
                <div className="row between"><div><span className="muted small">{item.cuisines.join(' · ') || 'Cuisine unavailable'}</span><h3>{item.itemName}</h3><p className="muted small">{item.restaurantName} · {item.area || 'Area unavailable'}</p></div><span className="fit-badge">{item.score.toFixed(0)} match score</span></div>
                <p className="reason">{item.providerName} · <FreshPill f={item.freshness} />{item.etaMin ? ` · ${item.etaMin} min reported` : ' · ETA unavailable'}</p>
                <div className="row wrap"><span className="price">{inr(item.estimatedSubtotal)}</span><span className="muted small">item price × quantity {item.people}, one per person; fees and tax excluded</span><span className="tag">Rating {item.rating == null ? 'unknown' : `${item.rating.toFixed(1)}/5`}</span></div>
                <ul className="small muted">{item.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                <details><summary>Ranking factors</summary>{item.factors.map(factor => <div className="factor" key={factor.factor}><span>{factor.factor} · weight {factor.weight}{!factor.known && ' · unknown, scored neutrally'}</span><div className="bar"><i className={factor.known ? '' : 'faded'} style={{ width: `${factor.value * 100}%` }} /></div></div>)}</details>
                <div className="row action-row"><Link className="btn" to={`/r/${encodeURIComponent(item.restaurantId)}?item=${encodeURIComponent(item.itemId)}&qty=${item.people}`}>Compare this menu item</Link></div>
              </div>
            </article>
          ))}</div>
          {data && <p className="muted small">{data.disclaimer}</p>}
        </section>
      </div>
    </div>
  );
}
