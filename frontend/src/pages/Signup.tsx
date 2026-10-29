import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Signup() {
  const [message, setMessage] = useState('');
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = formData.get('password');
    const confirmPassword = formData.get('confirm-password');

    if (password !== confirmPassword) {
      setPasswordMismatch(true);
      setMessage('Your passwords do not match. Please check and try again.');
      return;
    }

    setPasswordMismatch(false);
    setMessage('Account creation is not connected yet. You can still explore FoodLens or sign in with Google from the login page.');
  }

  return (
    <main className="login-page">
      <section className="login-shell signup-shell" aria-labelledby="signup-title">
        <div className="login-intro">
          <Link to="/" className="login-brand"><span>Food</span>Lens</Link>
          <p className="eyebrow">A BETTER WAY TO CHOOSE</p>
          <h1 id="signup-title">Make every<br />meal count.</h1>
          <p className="login-copy">Create your FoodLens account to get started comparing restaurants, prices, and delivery options.</p>
          <div className="login-perks" aria-label="FoodLens benefits">
            <div><span className="perk-icon">₹</span><span><strong>Compare the real total</strong><small>See prices and fees in one place.</small></span></div>
            <div><span className="perk-icon">♡</span><span><strong>Keep favourites close</strong><small>Find the food you love, faster.</small></span></div>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-head">
            <h2>Create your account</h2>
            <p>It only takes a moment to get started.</p>
          </div>
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="signup-name">Your name</label>
            <input id="signup-name" name="name" type="text" placeholder="Your name" required autoComplete="name" />
            <label htmlFor="signup-email">Email address</label>
            <input id="signup-email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
            <label htmlFor="signup-password">Password</label>
            <input id="signup-password" name="password" type="password" placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
            <label htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" name="confirm-password" type="password" placeholder="Re-enter your password" required minLength={8} autoComplete="new-password" aria-invalid={passwordMismatch} />
            <button className="login-submit" type="submit">Create account</button>
          </form>
          {message && <p className={`signup-message${passwordMismatch ? ' signup-error' : ''}`} role={passwordMismatch ? 'alert' : 'status'}>{message}</p>}
          <p className="login-signup">Already have an account? <Link to="/login">Log in</Link></p>
          <p className="login-terms">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
        </div>
      </section>
    </main>
  );
}
