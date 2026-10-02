import React, { useState } from "react";
import HeroCarousel from "./HeroCarousel.jsx";

export default function Hero({ heroImageRef, reducedMotion }) {
  const [word, setWord] = useState("Plumber");
  const [wordPhase, setWordPhase] = useState("");
  return (
    <section className="hero" id="home">
      <div className="hero__inner container">
        <div className="hero__content">
          <p className="eyebrow">ඕනි වැඩකට &mdash; Sri Lanka</p>
          <h1 className="hero__headline">Need a <span className="hero__rotating-wrap"><span className={`hero__word${wordPhase ? ` ${wordPhase}` : ""}`}>{word}</span></span><br />right now?</h1>
          <p className="hero__copy">TIKKA connects you with qualified, vetted skilled people for any home or workplace job &mdash; fast, hassle-free, and at transparent rates.</p>
          <div className="hero__trust">
            <span className="hero__trust-item">✓ TIKKA Technicians</span>
            <span className="hero__trust-item">✓ Hassle-Free</span>
            <span className="hero__trust-item">✓ Transparent Fees</span>
          </div>
          <div className="hero__contact-actions">
            <a className="hero__hotline" href="tel:0763774551" aria-label="Call TIKKA on 076 377 4551"><span className="hero__hotline-icon">📞</span><span className="hero__hotline-num">076 377 4551</span><span className="hero__hotline-label">Call us now</span></a>
            <a className="hero__hotline hero__hotline--whatsapp" href="https://wa.me/94763774551" target="_blank" rel="noopener noreferrer" aria-label="Chat with TIKKA on WhatsApp"><span className="hero__hotline-icon">💬</span><span className="hero__hotline-num">WhatsApp</span></a>
          </div>
          <div className="hero__actions" aria-label="Primary actions">
            <a className="button button--primary" href="app.html#request" id="hero-cta-primary">Get a Job Done</a>
            <a className="button button--secondary" href="#services" id="hero-cta-secondary">Browse Services</a>
          </div>
        </div>
        <HeroCarousel heroImageRef={heroImageRef} reducedMotion={reducedMotion} onWordChange={setWord} onWordPhase={setWordPhase} />
      </div>
    </section>
  );
}
