import React, { useEffect, useRef, useState } from "react";

const services = [
  ["Plumber", "plumbing.jpg", "Professional plumber at work", "🔧", "Plumbing"],
  ["Electrician", "electrical.jpg", "Electrician installing a switch", "⚡", "Electrical"],
  ["Cleaner", "cleaning.jpg", "Cleaner mopping a living room", "🧹", "Cleaning"],
  ["Repair Pro", "repairs.jpg", "Handyman drilling a wall", "🔨", "Repairs"],
  ["Painter", "painting.jpg", "Painter rolling a wall", "🎨", "Painting"],
  ["Handyman", "handyman.jpg", "Handyman assembling furniture", "🛠️", "Handyman"],
  ["Mover", "moving.jpg", "Movers carrying boxes", "📦", "Moving"],
  ["Gardener", "gardening.jpg", "Gardener trimming a hedge", "🌿", "Gardening"]
];
const intervalMs = 3000;
const preloadLeadMs = 1500;

export default function HeroCarousel({ heroImageRef, reducedMotion, onWordChange, onWordPhase }) {
  const [current, setCurrent] = useState(0);
  const [userPaused, setUserPaused] = useState(reducedMotion);
  const [explicitlyStarted, setExplicitlyStarted] = useState(false);
  const [pointerOver, setPointerOver] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [inViewport, setInViewport] = useState(true);
  const [documentHidden, setDocumentHidden] = useState(() => document.hidden);
  const [loaded, setLoaded] = useState(() => new Set([0]));
  const deckRef = useRef(null);
  const imageRefs = useRef([]);

  useEffect(() => setUserPaused(reducedMotion), [reducedMotion]);

  useEffect(() => {
    const deck = deckRef.current;
    if (!deck || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver(([entry]) => setInViewport(entry.isIntersecting), { threshold: 0.1 });
    observer.observe(deck);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setDocumentHidden(document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const loadSlide = (index) => {
    setLoaded((previous) => new Set(previous).add(index));
    return new Promise((resolve) => {
      const wait = () => {
        const image = imageRefs.current[index];
        if (!image) {
          requestAnimationFrame(wait);
          return;
        }
        if (image.complete) {
          Promise.resolve(image.decode?.()).catch(() => {}).then(resolve);
          return;
        }
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      };
      wait();
    });
  };

  const goTo = async (index) => {
    if (index === current) return;
    await loadSlide(index);
    if (!reducedMotion) {
      onWordPhase?.("is-out");
      window.setTimeout(() => {
        setCurrent(index);
        onWordChange?.(services[index][0]);
        onWordPhase?.("is-in");
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => onWordPhase?.("")));
      }, 200);
    } else { setCurrent(index); onWordChange?.(services[index][0]); onWordPhase?.(""); }
  };

  const shouldPause = userPaused || documentHidden || !inViewport || (pointerOver && !explicitlyStarted) || (focusWithin && !explicitlyStarted);
  useEffect(() => {
    if (shouldPause) return undefined;
    const next = (current + 1) % services.length;
    const preloadTimer = window.setTimeout(() => { loadSlide(next); }, intervalMs - preloadLeadMs);
    const rotationTimer = window.setTimeout(() => { goTo(next); }, intervalMs);
    return () => {
      window.clearTimeout(preloadTimer);
      window.clearTimeout(rotationTimer);
    };
  }, [current, shouldPause]);

  const toggle = () => {
    const nextPaused = !userPaused;
    setUserPaused(nextPaused);
    setExplicitlyStarted(!nextPaused);
  };

  return (
    <div className="hero__deck-wrap">
      <div
        ref={deckRef}
        className="hero-deck"
        role="region"
        aria-label="Service examples"
        aria-roledescription="carousel"
        onMouseEnter={() => setPointerOver(true)}
        onMouseLeave={() => { setPointerOver(false); setExplicitlyStarted(false); }}
        onFocus={() => setFocusWithin(true)}
        onBlur={(event) => { if (!deckRef.current?.contains(event.relatedTarget)) { setFocusWithin(false); setExplicitlyStarted(false); } }}
        onKeyDown={(event) => {
          if (event.target.closest("[data-carousel-toggle]")) return;
          if (event.key === "ArrowRight") { event.preventDefault(); goTo((current + 1) % services.length); }
          if (event.key === "ArrowLeft") { event.preventDefault(); goTo((current - 1 + services.length) % services.length); }
        }}
      >
        <div className="hero-deck__track">
          {services.map(([word, file, alt, emoji, label], index) => (
            <div key={file} className="hero-deck__slide" data-slide={index} aria-hidden={current !== index}>
              <img ref={(element) => { imageRefs.current[index] = element; if (index === 0) heroImageRef.current = element; }} src={loaded.has(index) ? `/public/hero/${file}` : undefined} data-src={!loaded.has(index) ? `/public/hero/${file}` : undefined} alt={alt} width="896" height="1200" loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : undefined} />
              <div className="hero-deck__label"><span className="hero-deck__emoji">{emoji}</span><span>{label}</span></div>
            </div>
          ))}
        </div>
        <div className="hero-deck__controls">
          <button className="hero-deck__toggle" type="button" data-carousel-toggle aria-label={userPaused ? "Play carousel" : "Pause carousel"} aria-pressed={!userPaused} onClick={toggle}>{userPaused ? "Play" : "Pause"}</button>
          <div className="hero-deck__dots" role="group" aria-label="Choose a service example">
            {services.map(([, , , , label], index) => <button key={label} type="button" aria-pressed={current === index} aria-label={`Show slide ${index + 1}: ${label}`} className={`hero-deck__dot${current === index ? " is-active" : ""}`} data-dot={index} onClick={() => goTo(index)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
