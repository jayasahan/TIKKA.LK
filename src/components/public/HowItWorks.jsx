import React from "react";

export default function HowItWorks() {
  return (
    <section className="section workflow" id="how-it-works" aria-labelledby="workflow-title">
      <div className="container">
        <div className="section-heading" data-reveal><p className="eyebrow">How It Works</p><h2 id="workflow-title">Tell TIKKA. We coordinate. You get it done.</h2></div>
        <div className="step-grid">
          {["Tell us what you need.", "We find the right person.", "Get the job done."].map((text, index) => <article className="step-card" data-reveal key={text}><span>0{index + 1}</span><h3>{text}</h3></article>)}
        </div>
      </div>
    </section>
  );
}
