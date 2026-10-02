import React, { useEffect, useRef, useState } from "react";

const links = [
  ["#home", "Home", "nav-menu__mobile-home"],
  ["#services", "Services", ""],
  ["#how-it-works", "How It Works", ""],
  ["#trust", "Why TIKKA", ""]
];

function useDesktopQuery() {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1040px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1040px)");
    const update = (event) => setDesktop(event.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return desktop;
}

export default function PublicHeader() {
  const desktop = useDesktopQuery();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const menuRef = useRef(null);
  const [current, setCurrent] = useState(() => window.location.hash || "#home");

  useEffect(() => {
    const update = () => setCurrent(window.location.hash || "#home");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    if (desktop) setOpen(false);
  }, [desktop]);

  useEffect(() => {
    if (!open) {
      document.body.classList.remove("nav-open");
      return undefined;
    }
    document.body.classList.add("nav-open");
    menuRef.current?.querySelector("a")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("nav-open");
    };
  }, [open]);

  const menuVisible = desktop || open;
  return (
    <header className="site-header" data-header>
      <nav className="nav container" aria-label="Primary navigation">
        <a className="brand" href="#home" aria-label="TIKKA home">
          <img src="/public/brand/tikka-logo.jpg" alt="TIKKA logo" width="1600" height="1200" />
        </a>
        <button
          ref={toggleRef}
          className="nav-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="primary-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="nav-toggle__line" /><span className="nav-toggle__line" /><span className="nav-toggle__line" />
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
        <div
          ref={menuRef}
          className={`nav-menu${open ? " is-open" : ""}`}
          id="primary-menu"
          aria-hidden={!menuVisible}
          hidden={!menuVisible}
          onClick={(event) => { if (event.target.closest("a")) setOpen(false); }}
        >
          <a className="nav-menu__mobile-cta button button--primary" href="app.html#request" data-nav-item>Get a Job Done</a>
          {links.map(([href, label, className]) => (
            <a key={href} className={className} href={href} data-nav-item aria-current={current === href ? "location" : undefined}>{label}</a>
          ))}
          <a className="nav-menu__mobile-hotline" href="tel:0763774551" data-nav-item>Call TIKKA</a>
        </div>
        <a className="button button--primary nav-cta" href="app.html#request">Get a Job Done</a>
      </nav>
    </header>
  );
}
