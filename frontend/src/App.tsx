import { useState } from 'react';
import { Link } from 'react-router-dom';

const features = [
  {
    number: '01',
    title: '多平台实时搜索',
    text: '同时搜索多个主流外卖平台，实时获取最新商品信息与价格。',
    icon: '⌕',
  },
  {
    number: '02',
    title: '智能价格对比',
    text: '自动计算商品、配送费和打包费，按最终总价给出清晰排序。',
    icon: '↗',
  },
  {
    number: '03',
    title: '优惠一目了然',
    text: '识别平台优惠与隐藏费用，帮你快速找到真正划算的选择。',
    icon: '✦',
  },
];

export default function App() {
  const [language, setLanguage] = useState('中');

  return (
    <div className="orderwise-site">
      <header className="site-header">
        <Link to="/" className="site-brand" aria-label="OrderWise 首页">
          <span className="brand-orbit"><span>O</span></span>
          <span>OrderWise</span>
          <small>外卖比价智能体</small>
        </Link>
        <nav className="site-nav" aria-label="主导航">
          <a href="#product">产品介绍</a>
          <a href="#cases">真实案例</a>
          <a href="#guide">使用指南</a>
          <a href="#contact">联系我们</a>
        </nav>
        <div className="header-actions">
          <button className="community-button" type="button" onClick={() => document.querySelector('#contact')?.scrollIntoView({ behavior: 'smooth' })}>
            <span className="people-icon">♧</span> 加入社群
          </button>
          <button className="language-button" type="button" onClick={() => setLanguage(language === '中' ? 'EN' : '中')} aria-label="切换语言">
            {language}
          </button>
          <a className="github-button" href="https://github.com/ucloud/orderwise" target="_blank" rel="noreferrer" aria-label="访问 GitHub">↗</a>
        </div>
      </header>

      <main>
        <section className="hero-section" id="product">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot" /> 实时比价 · 智能推荐</div>
            <h1>让每一分钱<br /><span>都花得值得</span></h1>
            <p>一个智能外卖比价 Agent，同时搜索多家平台，实时对比价格与优惠，帮你快速找到最优选择。</p>
            <div className="hero-actions">
              <a className="primary-button" href="#cases">立即体验 <span>→</span></a>
              <div className="qr-note"><span className="qr-placeholder">▦</span><span>手机扫码体验</span></div>
            </div>
          </div>
          <div className="hero-visual" aria-label="OrderWise 产品预览">
            <div className="visual-glow" />
            <div className="phone-card">
              <div className="phone-top"><span>‹</span><b>小选</b><span>⋯</span></div>
              <div className="phone-search"><span>⌕</span> 搜索奶茶</div>
              <div className="phone-status"><span className="live-dot" /> 正在为你比较 3 个平台</div>
              <div className="offer-card best"><div className="offer-logo meituan">美</div><div><b>喜茶 · 多肉葡萄</b><small>美团外卖 · 预计 28 分钟</small></div><strong>¥18.9</strong></div>
              <div className="offer-card"><div className="offer-logo eleme">饿</div><div><b>喜茶 · 多肉葡萄</b><small>饿了么 · 预计 32 分钟</small></div><strong>¥21.5</strong></div>
              <div className="offer-card"><div className="offer-logo jd">京</div><div><b>喜茶 · 多肉葡萄</b><small>京东外卖 · 预计 25 分钟</small></div><strong>¥22.0</strong></div>
              <div className="phone-total"><span>已为你省下</span><b>¥3.1</b></div>
            </div>
          </div>
        </section>

        <section className="feature-section" id="guide">
          <div className="section-intro"><span className="section-label">WHY ORDERWISE</span><h2>智能比价技术<br /><span>让优惠一目了然</span></h2></div>
          <div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><div className="feature-icon">{feature.icon}</div><span className="feature-number">{feature.number}</span><h3>{feature.title}</h3><p>{feature.text}</p></article>)}</div>
        </section>

        <section className="benchmark-section" id="cases">
          <div><span className="section-label">BENCHMARK</span><h2>更快、更准<br /><span>更懂你的选择</span></h2><p>基于真实任务的端到端基准测试，相比原始框架，OrderWise 在每个关键指标上都有明显提升。</p></div>
          <div className="stats-grid"><div><strong>56.9<span>%</span></strong><small>平均执行时间提升</small></div><div><strong>25<span>%</span></strong><small>任务成功率提升</small></div><div><strong>25<span>%</span></strong><small>价格提取准确率提升</small></div></div>
        </section>

        <section className="steps-section"><div className="section-intro"><span className="section-label">HOW IT WORKS</span><h2>三步找到<br /><span>最优外卖</span></h2></div><div className="steps-grid"><div><b>1</b><h3>输入想吃的</h3><p>在搜索框输入商品或商家名称。</p></div><div><b>2</b><h3>智能搜索</h3><p>Agent 同时获取多平台实时信息。</p></div><div><b>3</b><h3>选择最划算的</h3><p>按总价、配送和优惠透明排序。</p></div></div></section>
      </main>

      <footer id="contact"><div className="footer-brand"><span className="brand-orbit"><span>O</span></span><b>OrderWise</b><p>让每一分钱都花得值得。</p></div><div><span className="section-label">GET STARTED</span><h2>现在就开始<br /><span>聪明点外卖</span></h2></div><a className="primary-button" href="https://github.com/ucloud/orderwise" target="_blank" rel="noreferrer">查看 GitHub <span>↗</span></a></footer>
    </div>
  );
}
