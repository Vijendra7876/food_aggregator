import { Link } from 'react-router-dom';

export default function Login() {
  return (
    <div className="login-page">
      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-intro">
          <Link to="/" className="login-brand"><span>Food</span>Lens</Link>
          <p className="eyebrow">FOODLENS MVP</p>
          <h1 id="login-title">Compare before you order.</h1>
          <p className="login-copy">Search real records from the project&apos;s synthetic datasets, compare a basket, and inspect the evidence behind each result.</p>
          <div className="login-perks" aria-label="Available FoodLens features">
            <div><span className="perk-icon">₹</span><span><strong>Compare menu estimates</strong><small>Unknown fees are shown instead of invented.</small></span></div>
            <div><span className="perk-icon">★</span><span><strong>Inspect source evidence</strong><small>Provider ratings and review labels stay separate.</small></span></div>
          </div>
        </div>
        <div className="login-card">
          <div className="login-card-head"><h2>Accounts are not available</h2><p>FoodLens does not have authentication in this MVP.</p></div>
          <div className="state">No password or sign-in details are collected here. Saved preferences, favourites, and private histories are not enabled.</div>
          <Link className="login-submit" to="/">Continue without an account</Link>
          <p className="login-terms">Account creation and authentication require a secure identity service and are planned separately.</p>
        </div>
      </section>
    </div>
  );
}
