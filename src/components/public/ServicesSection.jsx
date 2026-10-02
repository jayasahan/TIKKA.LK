import React from "react";

const services = [
  ["CL", "Cleaning", "Homes, offices, and short-notice cleanup support."],
  ["PL", "Plumbing", "Leaks, fittings, fixtures, and everyday water issues."],
  ["EL", "Electrical", "Small repairs, installations, and electrical maintenance."],
  ["RP", "Repairs", "Fixes around the home or workplace."],
  ["PT", "Painting", "Fresh coats, touch-ups, and tidy finish work."],
  ["HM", "Handyman", "Odd jobs, mounting, assembly, and practical help."],
  ["MV", "Moving", "Support for shifting items and setting up spaces."],
  ["GD", "Gardening", "Garden care, clearing, trimming, and maintenance."]
];

export default function ServicesSection() {
  return (
    <section className="section section--tight" id="services" aria-labelledby="services-title">
      <div className="container">
        <div className="section-heading" data-reveal><p className="eyebrow">Services</p><h2 id="services-title">Everyday help, handled properly.</h2></div>
        <div className="service-grid" data-service-grid>
          {services.map(([icon, name, description]) => (
            <article className="service-card card card--standard" data-reveal key={name}>
              <span className="service-card__icon" aria-hidden="true">{icon}</span>
              <h3>{name}</h3><p>{description}</p>
              <a href={`app.html?service=${encodeURIComponent(name)}#request`}>Request {name}</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
