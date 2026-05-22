"use client";

import { useEffect } from "react";
import { usePushSubscription } from "@/hooks/usePushSubscription";

export function ServiceWorkerRegister() {
  const { suportado, inscrever } = usePushSubscription();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[PWA] Service Worker registrado:", reg.scope);
      })
      .catch((err) => {
        console.error("[PWA] Erro ao registrar Service Worker:", err);
      });
  }, []);

  useEffect(() => {
    if (!suportado) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      inscrever();
    }
  }, [suportado, inscrever]);

  return null;
}
