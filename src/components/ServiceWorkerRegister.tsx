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
    /**
     * REGRA DE NEGOCIO: se o usuario ja autorizou notificacoes, o ERP deve
     * reenviar a assinatura existente ao servidor para repopular
     * push_subscriptions quando o cadastro estiver ausente.
     * POR QUE: celulares ja autorizados podem ficar sem linha no banco e parar
     * de receber alertas de aprovacao/mencao.
     * IMPACTO: remover esta sincronizacao exige que o usuario clique de novo no
     * botao e dificulta recuperar assinaturas perdidas.
     */
    if (Notification.permission === "granted") {
      inscrever();
    }
  }, [suportado, inscrever]);

  return null;
}
