import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const meals = [
  { name: 'Paneer tikka bowl', place: 'Green Bowl Co.', cuisine: 'Healthy · North Indian', price: 289, per: 145, eta: 32, fit: 'Great fit', tags: ['High protein', 'Vegetarian'], reason: 'Fits your budget and matches your vegetarian preference.' },
  { name: 'Veg biryani feast', place: 'Biryani House', cuisine: 'Mughlai · Comfort food', price: 348, per: 174, eta: 28, fit: 'Best value', tags: ['Vegetarian', 'Group friendly'], reason: 'Strong value for two with a shorter delivery estimate.' },
  { name: 'Pesto pasta & salad', place: 'The Daily Table', cuisine: 'Italian · Light', price: 410, per: 205, eta: 25, fit: 'Balanced', tags: ['Fresh', 'Lower impact'], reason: 'A balanced choice with a lower-impact ingredient profile.' },
];

export default function SmartMeal() {
  const [budget, setBudget] = useState('500');
  const [people, setPeople] = useState('2');
  const [vegetarian, setVegetarian] = useState(true);
  const [priority, setPriority] = useState('balanced');
  const shown = useMemo(() => meals.filter(meal => meal.price <= Number(budget || 0) * 1.15 || !budget), [budget]);

  return (
    <div className="feature-page">
      <div className="eyebrow">SMART MEAL AI <span className="demo-pill">Demo engine</span></div>
      <div className="feature-hero"><div><h1>Make the meal decision easier.</h1><p>Tell FoodLens what matters tonight. We&apos;ll surface explainable options from the comparison data you already trust.</p></div><div className="spark-card"><span className="spark">AI</span><b>Personalized to your table</b><small>Preference matching, not a black box.</small></div></div>
      <div className="smart-layout">
        <section className="card preference-card">
          <div className="section-heading"><div><span className="kicker">01</span><h2>Your preferences</h2></div><span className="muted small">Allergies are always hard constraints</span></div>
          <label>Budget per person<input className="field" type="number" value={budget} onChange={event => setBudget(event.target.value)} aria-label="Budget per person" /></label>
          <label>People<input className="field" type="number" min="1" value={people} onChange={event => setPeople(event.target.value)} aria-label="Number of people" /></label>
          <label>Cuisine preference<select className="field"><option>Any cuisine</option><option>North Indian</option><option>Italian</option><option>South Indian</option></select></label>
          <div className="toggle-row"><div><b>Vegetarian only</b><small className="muted">Exclude non-vegetarian options</small></div><button className={'toggle ' + (vegetarian ? 'on' : '')} onClick={() => setVegetarian(!vegetarian)} aria-pressed={vegetarian}><span /></button></div>
          <label>Tonight&apos;s priority<select className="field" value={priority} onChange={event => setPriority(event.target.value)}><option value="balanced">Balanced value</option><option value="cheapest">Cheapest</option><option value="fastest">Fastest</option><option value="sustainable">Lower impact</option></select></label>
          <div className="constraint-note"><b>Need to avoid an allergen?</b><p className="small muted">Add restrictions before relying on a recommendation. We never claim allergy safety without verified ingredient data.</p></div>
        </section>
        <section>
          <div className="section-heading results-heading"><div><span className="kicker">02</span><h2>Good matches for you</h2></div><span className="muted small">{shown.length} recommendations</span></div>
          <div className="recommendations">{shown.map((meal, index) => (
            <article className={'recommendation card ' + (index === 0 ? 'recommended' : '')} key={meal.name}>
              <div className={`meal-art art-${index}`}><span>{index === 0 ? 'BOWL' : index === 1 ? 'BIRYANI' : 'PASTA'}</span></div>
              <div className="recommendation-body"><div className="row between"><div><span className="muted small">{meal.cuisine}</span><h3>{meal.name}</h3><p className="muted small">{meal.place} · {meal.eta} min</p></div><span className="fit-badge">{meal.fit}</span></div>
                <p className="reason">{meal.reason}</p><div className="row wrap"><span className="price">₹{meal.price}</span><span className="muted small">₹{meal.per}/person · {people} people</span>{meal.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>
                <div className="row action-row"><Link className="btn" to="/">Compare prices</Link><Link className="btn ghost" to="/shared-cart">Add to shared cart</Link></div>
              </div>
            </article>
          ))}</div>
        </section>
      </div>
    </div>
  );
}
