"use client";
import { useEffect, useRef, useState } from "react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function usePwa() {
  const [online, setOnline] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [secure, setSecure] = useState(true);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [workerState, setWorkerState] = useState("Menyediakan app…");
  const reloading = useRef(false);
  useEffect(() => {
    let mounted = true;
    const display = window.matchMedia("(display-mode: standalone)");
    const detect = () => {
      setOnline(navigator.onLine);
      setInstalled(display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    };
    const available = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallEvent); };
    const completed = () => { setInstalled(true); setInstallEvent(null); };
    const controlled = () => { if (reloading.current) window.location.reload(); };
    queueMicrotask(() => { if (mounted) { detect(); setSecure(window.isSecureContext); setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); } });
    window.addEventListener("online", detect); window.addEventListener("offline", detect);
    display.addEventListener("change", detect);
    window.addEventListener("beforeinstallprompt", available); window.addEventListener("appinstalled", completed);
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.addEventListener("controllerchange", controlled);
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(reg => {
        if (!mounted) return;
        void navigator.serviceWorker.ready.then(() => { if (mounted) setWorkerState("Skrin offline sedia"); });
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (mounted && worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(reg.waiting || worker);
          });
        });
      }).catch(() => { if (mounted) setWorkerState("Skrin offline belum tersedia. Cuba muat semula."); });
    } else queueMicrotask(() => { if (mounted) setWorkerState("PWA memerlukan HTTPS dan browser yang menyokongnya."); });
    return () => {
      mounted = false;
      window.removeEventListener("online", detect); window.removeEventListener("offline", detect); display.removeEventListener("change", detect);
      window.removeEventListener("beforeinstallprompt", available); window.removeEventListener("appinstalled", completed);
      navigator.serviceWorker?.removeEventListener("controllerchange", controlled);
    };
  }, []);
  async function install() {
    if (!installEvent) return false;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    return true;
  }
  function update() { if (waiting) { reloading.current = true; waiting.postMessage({ type: "ACTIVATE_UPDATE" }); } }
  return { online, installed, ios, secure, canInstall: !!installEvent, install, waiting: !!waiting, update, workerState };
}
