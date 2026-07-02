"use client";

import { useEffect } from "react";

// Registers the service worker once on the client. Required for the install
// ("Add to Home Screen") prompt to appear on Android Chrome. No-ops where
// service workers aren't supported (older browsers, insecure origins).
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
