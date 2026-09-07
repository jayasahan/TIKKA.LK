/* ─── Helpers ────────────────────────────────────────────────────────────────── */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ─── Nav ────────────────────────────────────────────────────────────────────── */

const navToggle = document.querySelector("[data-nav-toggle]");
const navMenu = document.querySelector("[data-nav-menu]");

if (navToggle && navMenu) {
  const label = navToggle.querySelector(".sr-only");

  const closeMenu = () => {
    navToggle.setAttribute("aria-expanded", "false");
    navMenu.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    if (label) {
      label.textContent = "Open menu";
    }
  };

  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navMenu.classList.toggle("is-open", !isOpen);
    document.body.classList.toggle("nav-open", !isOpen);
    if (label) {
      label.textContent = isOpen ? "Open menu" : "Close menu";
    }
  });

  navMenu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      closeMenu();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}

/* ─── Page Loader ────────────────────────────────────────────────────────────── */

const loader = document.getElementById("page-loader");

if (loader) {
  if (prefersReducedMotion) {
    // Skip loader instantly for users who prefer no motion
    loader.classList.add("is-hidden");
  } else {
    // Hide after the fill animation completes (1.1s) + a tiny buffer
    window.addEventListener("load", () => {
      setTimeout(() => {
        loader.classList.add("is-hidden");
      }, 1200);
    });

    // Fallback: always hide after 2.5s even if load is slow
    setTimeout(() => {
      loader.classList.add("is-hidden");
    }, 2500);
  }
}

/* ─── Hero Deck Carousel ─────────────────────────────────────────────────────── */

const SERVICES = [
  { word: "Plumber",      slide: 0 },
  { word: "Electrician",  slide: 1 },
  { word: "Cleaner",      slide: 2 },
  { word: "Repair Pro",   slide: 3 },
  { word: "Painter",      slide: 4 },
  { word: "Handyman",     slide: 5 },
  { word: "Mover",        slide: 6 },
  { word: "Gardener",     slide: 7 },
];

const INTERVAL_MS = 3000;

const heroWord  = document.getElementById("hero-word");
const deckEl    = document.getElementById("hero-deck");
const slides    = deckEl ? Array.from(deckEl.querySelectorAll(".hero-deck__slide")) : [];
const dots      = deckEl ? Array.from(deckEl.querySelectorAll(".hero-deck__dot"))  : [];

if (heroWord && deckEl && slides.length > 0) {
  let currentIndex = 0;
  let timer        = null;
  let paused       = false;

  // ── Activate a specific slide ───────────────────────────────────────────────

  const goTo = (nextIndex) => {
    if (nextIndex === currentIndex) return;

    // Rotate the headline word
    if (!prefersReducedMotion) {
      heroWord.classList.add("is-out");
      setTimeout(() => {
        heroWord.textContent = SERVICES[nextIndex].word;
        heroWord.classList.remove("is-out");
        heroWord.classList.add("is-in");
        // Force reflow so the class takes effect
        void heroWord.offsetWidth;
        heroWord.classList.remove("is-in");
      }, 200);
    } else {
      heroWord.textContent = SERVICES[nextIndex].word;
    }

    // Swap slides
    slides[currentIndex].setAttribute("aria-hidden", "true");
    slides[nextIndex].setAttribute("aria-hidden", "false");

    // Update dots
    dots[currentIndex].classList.remove("is-active");
    dots[currentIndex].setAttribute("aria-selected", "false");
    dots[nextIndex].classList.add("is-active");
    dots[nextIndex].setAttribute("aria-selected", "true");

    currentIndex = nextIndex;
  };

  const next = () => goTo((currentIndex + 1) % SERVICES.length);
  const prev = () => goTo((currentIndex - 1 + SERVICES.length) % SERVICES.length);

  // ── Auto-rotate ─────────────────────────────────────────────────────────────

  const startTimer = () => {
    if (prefersReducedMotion) return;
    timer = setInterval(next, INTERVAL_MS);
  };

  const stopTimer = () => {
    clearInterval(timer);
  };

  startTimer();

  // Pause on hover / focus
  deckEl.addEventListener("mouseenter", () => { paused = true;  stopTimer(); });
  deckEl.addEventListener("mouseleave", () => { paused = false; startTimer(); });
  deckEl.addEventListener("focusin",    () => { paused = true;  stopTimer(); });
  deckEl.addEventListener("focusout",   () => { paused = false; startTimer(); });

  // ── Dot clicks ──────────────────────────────────────────────────────────────

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const idx = Number(dot.dataset.dot);
      goTo(idx);
      // Reset timer so the slide doesn't flip immediately after manual pick
      stopTimer();
      startTimer();
    });
  });

  // ── Keyboard arrows ─────────────────────────────────────────────────────────

  deckEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { next(); stopTimer(); startTimer(); }
    if (e.key === "ArrowLeft")  { prev(); stopTimer(); startTimer(); }
  });

  // ── Touch / swipe ────────────────────────────────────────────────────────────

  let touchStartX = 0;

  deckEl.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });

  deckEl.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 40) return; // ignore tiny movements
    if (dx < 0) { next(); } else { prev(); }
    stopTimer();
    startTimer();
  }, { passive: true });
}
