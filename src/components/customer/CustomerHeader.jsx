import React, { useEffect, useRef, useState } from "react";
import useHash from "../../hooks/useHash.js";

const tabs = [["request", "Request a Service"], ["overview", "Overview"], ["requests", "My Requests"], ["profile", "Profile"]];

function useDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1040px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1040px)");
    const update = (event) => setDesktop(event.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return desktop;
}

export default function CustomerHeader({ customer, onLogout }) {
  const desktop = useDesktop();
  const hash = useHash();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const menuRef = useRef(null);
  const active = ["overview", "request", "requests", "profile"].includes(hash.slice(1)) ? hash.slice(1) : "overview";

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
    const escape = (event) => {
      if (event.key === "Escape") { setOpen(false); toggleRef.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); document.body.classList.remove("nav-open"); };
  }, [open]);

  const visible = desktop || open;
  const logout = async () => { setOpen(false); await onLogout(); };
  return (
    <header className="site-header customer-header" data-header>
      <nav className="nav container" aria-label="Primary navigation">
        <a className="brand" href="/#home" aria-label="TIKKA home"><img src="/public/brand/tikka-logo.jpg" alt="TIKKA logo" width="1600" height="1200" /></a>
        <button ref={toggleRef} className="nav-toggle" type="button" aria-expanded={open} aria-controls="customer-primary-menu" hidden={!customer} onClick={() => setOpen((value) => !value)}>
          <span className="nav-toggle__line" /><span className="nav-toggle__line" /><span className="nav-toggle__line" /><span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
        <div ref={menuRef} className={`nav-menu customer-nav${open ? " is-open" : ""}`} id="customer-primary-menu" aria-hidden={!customer || !visible} hidden={!customer || !visible} onClick={(event) => { if (event.target.closest("a")) setOpen(false); }}>
          {tabs.map(([name, label]) => <a key={name} className={`${name === "request" ? "customer-nav__request " : ""}${active === name ? "is-active" : ""}`} href={`#${name}`} data-nav-item aria-current={active === name ? "location" : undefined}>{label}</a>)}
          <button className="customer-nav__logout" type="button" data-nav-item onClick={logout}>Log out</button>
        </div>
        <a className="button button--primary nav-cta customer-nav__desktop-request" href="#request" hidden={!customer}>Request a Service</a>
        <button className="button button--secondary nav-account-logout" type="button" hidden={!customer} onClick={logout}>Log out</button>
      </nav>
      <span className="sr-only">Signed in as {customer?.name || "customer"}</span>
    </header>
  );
}
