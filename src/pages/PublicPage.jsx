import React, { useEffect, useRef } from "react";
import useReducedMotion from "../hooks/useReducedMotion.js";
import PublicHeader from "../components/public/PublicHeader.jsx";
import SplashScreen from "../components/public/SplashScreen.jsx";
import Hero from "../components/public/Hero.jsx";
import ServicesSection from "../components/public/ServicesSection.jsx";
import HowItWorks from "../components/public/HowItWorks.jsx";
import TrustSection from "../components/public/TrustSection.jsx";
import FinalCTA from "../components/public/FinalCTA.jsx";
import PublicFooter from "../components/public/PublicFooter.jsx";

function useSectionReveals(containerRef, reducedMotion) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || reducedMotion || !("IntersectionObserver" in window)) return undefined;
    const targets = Array.from(container.querySelectorAll("[data-reveal]"));
    if (!targets.length) return undefined;
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -5%" });
    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("motion-ready");
      targets.forEach((target) => target.classList.remove("is-revealed"));
    };
  }, [containerRef, reducedMotion]);
}

export default function PublicPage() {
  const contentRef = useRef(null);
  const heroImageRef = useRef(null);
  const reducedMotion = useReducedMotion();
  useSectionReveals(contentRef, reducedMotion);

  return (
    <>
      <SplashScreen activeImageRef={heroImageRef} reducedMotion={reducedMotion} />
      <a className="skip-link" href="#main">Skip to content</a>
      <PublicHeader />
      <div ref={contentRef}>
        <main id="main">
          <Hero heroImageRef={heroImageRef} reducedMotion={reducedMotion} />
          <ServicesSection />
          <HowItWorks />
          <TrustSection />
          <section className="section service-band" id="support" aria-labelledby="support-title">
            <div className="container service-band__inner">
              <div>
                <p className="eyebrow">TIKKA Operations</p>
                <h2 id="support-title">One team coordinating the right technician for every job.</h2>
                <p>Submit your request and TIKKA will review, schedule, and assign an internal technician or team.</p>
              </div>
              <a className="button button--secondary" href="app.html#request">Start a Request</a>
            </div>
          </section>
          <FinalCTA />
        </main>
        <PublicFooter />
      </div>
    </>
  );
}
