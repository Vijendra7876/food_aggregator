import { Link } from 'react-router-dom';

const features = [
  { number: '01', title: 'Search across platforms', text: 'Search leading delivery platforms at once for the latest menu items and prices.', icon: '⌕' },
  { number: '02', title: 'Compare true prices', text: 'Automatically factor in item, delivery, and packaging fees to rank the final total.', icon: '↗' },
  { number: '03', title: 'See savings clearly', text: 'Spot discounts and hidden fees so you can quickly find the best value.', icon: '✦' },
];

export default function App() {
  return (
    <div className="orderwise-site">
      <header className="site-header">
        <Link to="/" className="site-brand" aria-label="FoodLens home">
          <span className="brand-orbit"><span>F</span></span>
          <span>FoodLens</span>
          <small>Smart food delivery comparison</small>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#product">Product</a><a href="#cases">Results</a><a href="#guide">How it works</a><a href="#contact">Contact</a>
        </nav>
        <div className="header-actions">
          <button className="community-button" type="button" onClick={() => document.querySelector('#contact')?.scrollIntoView({ behavior: 'smooth' })}><span className="people-icon">♧</span> Join the community</button>
          <span className="language-button" aria-label="Language: English">EN</span>
          <a className="github-button" href="https://github.com/ucloud/orderwise" target="_blank" rel="noreferrer" aria-label="Visit GitHub">↗</a>
        </div>
      </header>

      <main>
        <section className="hero-section" id="product">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot" /> Live price comparison · Smart recommendations</div>
            <h1>Make every penny<br /><span>worth spending</span></h1>
            <p>FoodLens is a smart delivery comparison agent that searches multiple platforms, compares prices and deals in real time, and helps you find the best choice.</p>
            <div className="hero-actions"><a className="primary-button" href="#cases">Try FoodLens <span>→</span></a><div className="qr-note"><span className="qr-placeholder">▦</span><span>Scan to try on mobile</span></div></div>
          </div>
          <div className="hero-visual" aria-label="FoodLens product preview"><div className="visual-glow" /><div className="phone-card">
            <div className="phone-top"><span>‹</span><b>FoodLens</b><span>⋯</span></div><div className="phone-search"><span>⌕</span> Search for bubble tea</div><div className="phone-status"><span className="live-dot" /> Comparing 3 platforms for you</div>
            <div className="offer-card best"><div className="offer-logo meituan">M</div><div><b>Grape Juice · Cheese Tea</b><small>Food delivery · 28 min</small></div><strong>$18.9</strong></div>
            <div className="offer-card"><div className="offer-logo eleme">E</div><div><b>Grape Juice · Cheese Tea</b><small>Food delivery · 32 min</small></div><strong>$21.5</strong></div>
            <div className="offer-card"><div className="offer-logo jd">J</div><div><b>Grape Juice · Cheese Tea</b><small>Food delivery · 25 min</small></div><strong>$22.0</strong></div><div className="phone-total"><span>You saved</span><b>$3.1</b></div>
          </div></div>
        </section>

        <section className="feature-section" id="guide"><div className="section-intro"><span className="section-label">WHY FOODLENS</span><h2>Smart comparison<br /><span>made transparent</span></h2></div><div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><div className="feature-icon">{feature.icon}</div><span className="feature-number">{feature.number}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div></section>
        <section className="benchmark-section" id="cases"><div><span className="section-label">BENCHMARK</span><h2>Faster, more accurate<br /><span>better choices</span></h2><p>Based on real end-to-end tasks, FoodLens improves every key metric compared with the original framework.</p></div><div className="stats-grid"><div><strong>56.9<span>%</span></strong><small>Faster execution</small></div><div><strong>25<span>%</span></strong><small>Higher task success</small></div><div><strong>25<span>%</span></strong><small>Better price accuracy</small></div></div></section>
        <section className="steps-section"><div className="section-intro"><span className="section-label">HOW IT WORKS</span><h2>Find your best meal<br /><span>in three steps</span></h2></div><div className="steps-grid"><div><b>1</b><h3>Tell us what you want</h3><p>Enter a dish or restaurant in the search box.</p></div><div><b>2</b><h3>Search intelligently</h3><p>FoodLens gathers live information across platforms.</p></div><div><b>3</b><h3>Choose the best value</h3><p>Compare total price, delivery, and deals clearly.</p></div></div></section>
      </main>
      <footer id="contact"><div className="footer-brand"><span className="brand-orbit"><span>F</span></span><b>FoodLens</b><p>Make every penny worth spending.</p></div><div><span className="section-label">GET STARTED</span><h2>Start saving<br /><span>on every order</span></h2></div><a className="primary-button" href="https://github.com/ucloud/orderwise" target="_blank" rel="noreferrer">View on GitHub <span>↗</span></a></footer>
    </div>
  );
}
