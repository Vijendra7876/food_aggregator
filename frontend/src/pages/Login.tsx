import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

interface GoogleUser {
  name: string;
  email: string;
  picture?: string;
}

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (element: HTMLElement, options: {
        type: 'standard';
        theme: 'outline';
        size: 'large';
        text: 'continue_with';
        shape: 'rectangular';
        width: number;
      }) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const googleButton = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(null);
  const [googleError, setGoogleError] = useState('');
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId || !googleButton.current) return;

    const renderGoogleButton = () => {
      if (!window.google || !googleButton.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          setGoogleError('');
          api<{ user: GoogleUser }>('/auth/google', {
            method: 'POST',
            body: JSON.stringify({ credential: response.credential }),
          }).then(({ user }) => setGoogleUser(user)).catch((error: Error) => setGoogleError(error.message));
        },
      });
      window.google.accounts.id.renderButton(googleButton.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: Math.min(400, googleButton.current.clientWidth),
      });
    };

    if (window.google) {
      renderGoogleButton();
      return;
    }

    const script = document.getElementById('google-identity');
    script?.addEventListener('load', renderGoogleButton);
    return () => script?.removeEventListener('load', renderGoogleButton);
  }, [googleClientId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    window.setTimeout(() => navigate('/'), 500);
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-intro">
          <Link to="/" className="login-brand"><span>Food</span>Lens</Link>
          <p className="eyebrow">COMPARE BEFORE YOU ORDER</p>
          <h1 id="login-title">Your smarter food<br />ordering starts here.</h1>
          <p className="login-copy">Sign in to compare prices, delivery fees, ratings, and offers across your favourite food apps.</p>
          <div className="login-perks" aria-label="Benefits of signing in">
            <div><span className="perk-icon">₹</span><span><strong>Find the best price</strong><small>See the real total before checkout.</small></span></div>
            <div><span className="perk-icon">★</span><span><strong>Save your favourites</strong><small>Keep restaurants and dishes close.</small></span></div>
          </div>
        </div>

        <div className="login-card">
          <div className="login-card-head">
            <h2>Welcome back</h2>
            <p>Log in to continue comparing.</p>
          </div>
          <form onSubmit={handleSubmit} className="login-form">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required autoComplete="email" />
            <div className="label-row"><label htmlFor="password">Password</label><a href="#forgot">Forgot password?</a></div>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required minLength={6} autoComplete="current-password" />
            <button className="login-submit" type="submit">{submitted ? 'Signing you in…' : 'Log in'}</button>
          </form>
          <div className="login-divider"><span>or</span></div>
          {googleClientId
            ? <div className="google-button" ref={googleButton} />
            : <button className="social-button" type="button" disabled><span className="google-mark">G</span> Continue with Google</button>}
          {!googleClientId && <p className="google-message">Google sign-in needs a Google OAuth client ID. See the setup steps in README.md.</p>}
          {googleError && <p className="google-message google-error" role="alert">{googleError}</p>}
          {googleUser && <p className="google-message google-success" role="status">Signed in as {googleUser.name} ({googleUser.email}).</p>}
          <p className="login-signup">New to FoodLens? <Link to="/signup">Create an account</Link></p>
          <p className="login-terms">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
        </div>
      </section>
    </main>
  );
}
