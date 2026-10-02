import React from "react";

export default function PublicFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div><a className="brand footer-brand" href="#home" aria-label="TIKKA home"><img src="/public/brand/tikka-logo.jpg" alt="TIKKA logo" width="1600" height="1200" /></a><p>TIKKA connects customers with skilled people for repairs, cleaning, maintenance, and everyday jobs.</p></div>
        <div><h2>Services</h2><ul><li>Cleaning</li><li>Plumbing</li><li>Electrical</li><li>Repairs</li></ul></div>
        <div><h2>Navigation</h2><ul><li><a href="#services">Services</a></li><li><a href="#how-it-works">How It Works</a></li><li><a href="#trust">Why TIKKA</a></li></ul></div>
        <div><h2>Contact</h2><a className="footer-hotline" href="tel:0763774551" aria-label="Call TIKKA hotline">076 377 4551</a><p>Hotline &mdash; Mon to Sat, 8am &ndash; 8pm</p></div>
      </div>
      <div className="container footer-bottom"><p>&copy; 2026 TIKKA. All rights reserved.</p></div>
    </footer>
  );
}
