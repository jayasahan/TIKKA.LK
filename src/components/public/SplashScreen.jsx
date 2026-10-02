import React, { useEffect, useRef, useState } from "react";

export default function SplashScreen({ activeImageRef, reducedMotion }) {
  const [hidden, setHidden] = useState(false);
  const [removed, setRemoved] = useState(false);
  const hiddenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let maximumTimer;
    let removeTimer;
    const startedAt = performance.now();
    const minimumVisibleMs = 500;
    const maximumVisibleMs = 1200;
    const waitForImage = () => {
      const image = activeImageRef.current;
      if (!image) return Promise.resolve();
      if (image.complete) return image.decode?.().catch(() => {}) || Promise.resolve();
      return new Promise((resolve) => {
        const finish = () => resolve(image.decode?.().catch(() => {}) || undefined);
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
      });
    };
    const dismiss = (force = false) => {
      if (cancelled || hiddenRef.current) return;
      const remaining = force ? 0 : Math.max(0, minimumVisibleMs - (performance.now() - startedAt));
      if (remaining) {
        window.setTimeout(() => dismiss(true), remaining);
        return;
      }
      hiddenRef.current = true;
      setHidden(true);
      removeTimer = window.setTimeout(() => { if (!cancelled) setRemoved(true); }, reducedMotion ? 0 : 450);
    };
    maximumTimer = window.setTimeout(() => dismiss(true), maximumVisibleMs);
    Promise.resolve(waitForImage()).then(() => dismiss(false));
    return () => {
      cancelled = true;
      window.clearTimeout(maximumTimer);
      window.clearTimeout(removeTimer);
    };
  }, [activeImageRef, reducedMotion]);

  if (removed) return null;
  return (
    <div className={`page-splash${hidden ? " is-hidden" : ""}`} aria-hidden="true">
      <div className="page-splash__inner">
        <img src="/public/brand/tikka-logo.jpg" alt="" width="140" height="140" className="page-splash__logo" />
        <div className="page-splash__bar" aria-hidden="true"><div className="page-splash__fill" /></div>
      </div>
    </div>
  );
}
