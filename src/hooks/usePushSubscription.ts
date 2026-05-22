"use client";
import { useCallback, useEffect, useState } from "react";

export function usePushSubscription() {
  const [inscrito, setInscrito] = useState(false);
  const [suportado, setSuportado] = useState(false);

  useEffect(() => {
    setSuportado("serviceWorker" in navigator && "PushManager" in window);
  }, []);

  const inscrever = useCallback(async () => {
    if (!suportado) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setInscrito(true);
    } catch (e) {
      console.warn("[push]", e);
    }
  }, [suportado]);

  return { inscrito, suportado, inscrever };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
