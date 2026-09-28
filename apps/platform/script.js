/* ─── Helpers ────────────────────────────────────────────────────────────────── */

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let prefersReducedMotion = reducedMotionQuery.matches;

/* ─── Nav ────────────────────────────────────────────────────────────────────── */

const navToggle = document.querySelector("[data-nav-toggle]");
const navMenu = document.querySelector("[data-nav-menu]");

if (navToggle && navMenu) {
  TikkaUI.setupMenu(navToggle, navMenu, { desktopQuery: "(min-width: 1040px)", itemSelector: "[data-nav-item]" });
}

const publicSectionLinks = Array.from(document.querySelectorAll("[data-nav-menu] a[href^='#']"));
const syncPublicCurrent = () => {
  const current = window.location.hash || "#home";
  publicSectionLinks.forEach((link) => {
    if (link.getAttribute("href") === current) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  });
};
syncPublicCurrent();
window.addEventListener("hashchange", syncPublicCurrent);

/* ─── Page Splash ────────────────────────────────────────────────────────────── */

const splash = document.getElementById("page-splash");

if (splash) {
  const splashStartedAt = performance.now();
  const minimumVisibleMs = 500;
  const maximumVisibleMs = 1200;
  const activeHeroImage = document.querySelector('.hero-deck__slide[aria-hidden="false"] img[src]');
  let splashHidden = false;

  const waitForActiveHero = () => {
    if (!activeHeroImage) return Promise.resolve();

    const decode = () => (
      typeof activeHeroImage.decode === "function"
        ? activeHeroImage.decode().catch(() => {})
        : undefined
    );

    if (activeHeroImage.complete) return decode();

    return new Promise((resolve) => {
      const finish = () => resolve(decode());
      activeHeroImage.addEventListener("load", finish, { once: true });
      activeHeroImage.addEventListener("error", finish, { once: true });
    });
  };

  const domReady = document.readyState === "loading"
    ? new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();

  const hideSplash = (force = false) => {
    if (splashHidden) return;

    const elapsed = performance.now() - splashStartedAt;
    const remaining = force ? 0 : Math.max(0, minimumVisibleMs - elapsed);
    if (remaining > 0) {
      window.setTimeout(() => hideSplash(true), remaining);
      return;
    }

    splashHidden = true;
    splash.classList.add("is-hidden");
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
    window.setTimeout(() => splash.remove(), 450);
  };

  const maximumTimer = window.setTimeout(() => hideSplash(true), maximumVisibleMs);
  Promise.all([domReady, waitForActiveHero()]).then(() => {
    window.clearTimeout(maximumTimer);
    hideSplash();
  });
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
const PRELOAD_LEAD_MS = 1500;

const heroWord  = document.getElementById("hero-word");
const deckEl    = document.getElementById("hero-deck");
const slides    = deckEl ? Array.from(deckEl.querySelectorAll(".hero-deck__slide")) : [];
const dots      = deckEl ? Array.from(deckEl.querySelectorAll(".hero-deck__dot"))  : [];
const carouselToggle = deckEl?.querySelector("[data-carousel-toggle]");

if (heroWord && deckEl && slides.length > 0) {
  let currentIndex = 0;
  let rotationTimer = null;
  let preloadTimer = null;
  let isPointerOver = false;
  let isFocusWithin = false;
  let isInViewport = true;
  let navigationRequest = 0;
  let userPaused = prefersReducedMotion;
  let explicitlyStarted = false;

  const syncCarouselToggle = () => {
    if (!carouselToggle) return;
    carouselToggle.textContent = userPaused ? "Play" : "Pause";
    carouselToggle.setAttribute("aria-label", userPaused ? "Play carousel" : "Pause carousel");
    carouselToggle.setAttribute("aria-pressed", String(!userPaused));
  };
  syncCarouselToggle();

  const loadSlide = (index) => {
    const image = slides[index]?.querySelector("img");
    if (!image) return Promise.resolve();

    if (image.dataset.src) {
      image.src = image.dataset.src;
      delete image.dataset.src;
    }

    const loaded = image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });

    return loaded.then(() => (
      typeof image.decode === "function" ? image.decode().catch(() => {}) : undefined
    ));
  };

  // ── Activate a specific slide ───────────────────────────────────────────────

  const goTo = async (nextIndex) => {
    if (nextIndex === currentIndex) return;
    const request = ++navigationRequest;
    await loadSlide(nextIndex);
    if (request !== navigationRequest || nextIndex === currentIndex) return;

    // Rotate the headline word
    if (!prefersReducedMotion) {
      heroWord.classList.add("is-out");
      setTimeout(() => {
        heroWord.textContent = SERVICES[nextIndex].word;
        heroWord.classList.remove("is-out");
        heroWord.classList.add("is-in");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => heroWord.classList.remove("is-in"));
        });
      }, 200);
    } else {
      heroWord.textContent = SERVICES[nextIndex].word;
    }

    // Swap slides
    slides[currentIndex].setAttribute("aria-hidden", "true");
    slides[nextIndex].setAttribute("aria-hidden", "false");

    // Update dots
    dots[currentIndex].classList.remove("is-active");
    dots[currentIndex].setAttribute("aria-pressed", "false");
    dots[nextIndex].classList.add("is-active");
    dots[nextIndex].setAttribute("aria-pressed", "true");

    currentIndex = nextIndex;
  };

  const next = () => goTo((currentIndex + 1) % SERVICES.length);
  const prev = () => goTo((currentIndex - 1 + SERVICES.length) % SERVICES.length);

  // ── Auto-rotate ─────────────────────────────────────────────────────────────

  const isPaused = () => (
    (prefersReducedMotion && !explicitlyStarted) ||
    userPaused ||
    document.hidden ||
    !isInViewport ||
    (isPointerOver && !explicitlyStarted) ||
    (isFocusWithin && !explicitlyStarted)
  );

  const clearTimers = () => {
    clearTimeout(rotationTimer);
    clearTimeout(preloadTimer);
    rotationTimer = null;
    preloadTimer = null;
  };

  const scheduleRotation = () => {
    clearTimers();
    if (isPaused()) return;

    const nextIndex = (currentIndex + 1) % SERVICES.length;
    preloadTimer = setTimeout(() => {
      loadSlide(nextIndex);
    }, INTERVAL_MS - PRELOAD_LEAD_MS);
    rotationTimer = setTimeout(async () => {
      await goTo(nextIndex);
      scheduleRotation();
    }, INTERVAL_MS);
  };

  scheduleRotation();

  carouselToggle?.addEventListener("click", () => {
    userPaused = !userPaused;
    explicitlyStarted = !userPaused;
    syncCarouselToggle();
    scheduleRotation();
  });

  reducedMotionQuery.addEventListener?.("change", (event) => {
    prefersReducedMotion = event.matches;
    userPaused = true;
    explicitlyStarted = false;
    syncCarouselToggle();
    scheduleRotation();
  });

  // Pause on hover / focus, in background tabs, and while outside the viewport.
  deckEl.addEventListener("mouseenter", () => {
    isPointerOver = true;
    scheduleRotation();
  });
  deckEl.addEventListener("mouseleave", () => {
    isPointerOver = false;
    scheduleRotation();
  });
  deckEl.addEventListener("focusin", () => {
    isFocusWithin = true;
    scheduleRotation();
  });
  deckEl.addEventListener("focusout", (event) => {
    if (deckEl.contains(event.relatedTarget)) return;
    isFocusWithin = false;
    scheduleRotation();
  });

  document.addEventListener("visibilitychange", scheduleRotation);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      isInViewport = entry.isIntersecting;
      scheduleRotation();
    }, { threshold: 0.1 });
    observer.observe(deckEl);
  }

  // ── Dot clicks ──────────────────────────────────────────────────────────────

  dots.forEach((dot) => {
    dot.addEventListener("click", async () => {
      const idx = Number(dot.dataset.dot);
      await goTo(idx);
      scheduleRotation();
    });
  });

  // ── Keyboard arrows ─────────────────────────────────────────────────────────

  deckEl.addEventListener("keydown", async (e) => {
    if (e.target.closest("[data-carousel-toggle]")) return;
    if (e.key === "ArrowRight") {
      const index = (currentIndex + 1) % SERVICES.length;
      await goTo(index);
      dots[index]?.focus();
      scheduleRotation();
    }
    if (e.key === "ArrowLeft") {
      const index = (currentIndex - 1 + SERVICES.length) % SERVICES.length;
      await goTo(index);
      dots[index]?.focus();
      scheduleRotation();
    }
  });

  // ── Touch / swipe ────────────────────────────────────────────────────────────

  let touchStartX = 0;

  deckEl.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });

  deckEl.addEventListener("touchend", async (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 40) return; // ignore tiny movements
    if (dx < 0) { await next(); } else { await prev(); }
    scheduleRotation();
  }, { passive: true });
}
