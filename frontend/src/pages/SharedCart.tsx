import { useMemo, useState } from 'react';

const people = [{ name: 'You', initials: 'YU', color: 'green' }, { name: 'Maya', initials: 'MA', color: 'orange' }, { name: 'Arjun', initials: 'AR', color: 'blue' }];
const initialItems = [{ name: 'Paneer tikka bowl', owner: 'You', price: 249, qty: 1 }, { name: 'Veg biryani', owner: 'Maya', price: 220, qty: 1 }, { name: 'Garlic naan', owner: 'Arjun', price: 85, qty: 2 }];

export default function SharedCart() {
  const [items, setItems] = useState(initialItems);
  const [mode, setMode] = useState<'items' | 'split'>('items');
  const total = useMemo(() => items.reduce((sum, item) => sum + item.price * item.qty, 0), [items]);
  const remove = (name: string) => setItems(current => current.filter(item => item.name !== name));

  return (
    <div className="feature-page">
      <div className="eyebrow">SHARED CART <span className="demo-pill">Demo group</span></div>
      <div className="feature-hero"><div><h1>Order together, split fairly.</h1><p>Build one basket for the table. Everyone can see what they owe before you share the order link.</p></div><button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy invite link</button></div>
      <div className="cart-layout">
        <section className="card group-card">
          <div className="section-heading"><div><span className="kicker">THE GROUP</span><h2>Friday dinner</h2></div><span className="status-dot">Active</span></div>
          <div className="member-list">{people.map(person => <div className="member" key={person.name}><span className={'avatar ' + person.color}>{person.initials}</span><div><b>{person.name}</b><small className="muted">{person.name === 'You' ? 'Host' : 'Joined just now'}</small></div><span className="member-check">✓</span></div>)}</div>
          <button className="btn ghost full" type="button">+ Invite someone</button>
          <div className="share-box"><span className="share-icon">↗</span><div><b>Share this group</b><small className="muted">Anyone with the invite can add their items.</small></div></div>
        </section>
        <section>
          <div className="tabs compact"><button className={mode === 'items' ? 'on' : ''} onClick={() => setMode('items')}>Items <span>{items.length}</span></button><button className={mode === 'split' ? 'on' : ''} onClick={() => setMode('split')}>Bill split</button></div>
          {mode === 'items' ? <div className="card"><div className="section-heading"><div><h2>Everyone&apos;s items</h2><span className="muted small">Biryani House · shared basket</span></div><button className="btn ghost" type="button">+ Add item</button></div>
            {items.map(item => <div className="cart-item" key={item.name}><div className="item-check">✓</div><div className="cart-item-info"><b>{item.name}</b><small className="muted">{item.owner}&apos;s item · Qty {item.qty}</small></div><strong>₹{item.price * item.qty}</strong><button className="icon-btn" onClick={() => remove(item.name)} aria-label={'Remove ' + item.name}>×</button></div>)}
            <div className="estimate"><span>Estimated group total</span><strong>₹{total}</strong></div><p className="muted small">Delivery, platform fees and GST will be allocated proportionally at checkout. This is an estimate.</p>
          </div> : <div className="card"><div className="section-heading"><div><h2>Fair split</h2><span className="muted small">Pay for your own items + shared charges</span></div></div>
            <div className="split-mode"><button className="chip on">Pay for own items</button><button className="chip">Equal split</button><button className="chip">Custom</button></div>
            {people.map((person, index) => <div className="share-row" key={person.name}><span className={'avatar small-avatar ' + person.color}>{person.initials}</span><b>{person.name}</b><span className="muted">Items ₹{[249, 220, 170][index]}</span><strong>₹{[280, 251, 201][index]}</strong></div>)}
            <div className="estimate"><span>Reconciled estimate</span><strong>₹732</strong></div><p className="muted small">Shares add up to the estimated group total. Final amounts may change with provider fees.</p>
          </div>}
        </section>
      </div>
    </div>
  );
}
