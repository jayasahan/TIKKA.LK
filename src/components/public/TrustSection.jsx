import React from "react";

export default function TrustSection() {
  const items = [["Qualified People", "Skilled people selected for the job."], ["Hassle-Free", "Tell us what needs to be done and let TIKKA handle the coordination."], ["Transparent Fees", "Clear pricing with no unnecessary surprises."]];
  return (
    <section className="section" id="trust" aria-labelledby="trust-title">
      <div className="container trust-layout">
        <div className="section-heading" data-reveal><p className="eyebrow">Why TIKKA</p><h2 id="trust-title">Qualified help without the coordination headache.</h2></div>
        <div className="trust-grid">{items.map(([title, text]) => <article className="trust-item" data-reveal key={title}><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div>
    </section>
  );
}
