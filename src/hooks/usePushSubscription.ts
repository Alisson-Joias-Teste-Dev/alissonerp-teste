"use client";
import { useCallback, useEffect } from "react";
import { create } from "zustand";

type PushPermission = NotificationPermission | "unsupported";

interface PushState {
  inscrito: boolean;
  suportado: boolean;
  carregando: boolean;
  erro: string | null;
  permissao: PushPermission;
  setInscrito: (v: boolean) => void;
  setSuportado: (v: boolean) => void;
  setCarregando: (v: boolean) => void;
  setErro: (v: string | null) => void;
  setPermissao: (v: PushPermission) => void;
}

/**
 * REGRA DE NEGOCIO: o estado de push deve ser compartilhado entre todos os
 * componentes que usam usePushSubscription, para que o drawer e o registro
 * automatico do ServiceWorker enxerguem a mesma ativacao.
 * POR QUE: cada chamada de hook criava um estado isolado, entao o drawer
 * pedia para ativar de novo mesmo apos o SW ja ter registrado.
 * IMPACTO: se voltar a usar useState local em vez do store, o botao de
 * ativacao volta a aparecer a cada recarga mesmo com permissao concedida.
 */
const usePushStore = create<PushState>((set) => ({
  inscrito: false,
  suportado: false,
  carregando: false,
  erro: null,
  permissao: "default",
  setInscrito: (v) => set({ inscrito: v }),
  setSuportado: (v) => set({ suportado: v }),
  setCarregando: (v) => set({ carregando: v }),
  setErro: (v) => set({ erro: v }),
  setPermissao: (v) => set({ permissao: v }),
}));

export function usePushSubscription() {
  const inscrito = usePushStore((s) => s.inscrito);
  const suportado = usePushStore((s) => s.suportado);
  const carregando = usePushStore((s) => s.carregando);
  const erro = usePushStore((s) => s.erro);
  const permissao = usePushStore((s) => s.permissao);
  const setInscrito = usePushStore((s) => s.setInscrito);
  const setSuportado = usePushStore((s) => s.setSuportado);
  const setCarregando = usePushStore((s) => s.setCarregando);
  const setErro = usePushStore((s) => s.setErro);
  const setPermissao = usePushStore((s) => s.setPermissao);

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    /**
     * REGRA DE NEGOCIO: o celular so pode receber notificacao fora do ERP se o
     * navegador suportar Web Push e se a chave publica VAPID estiver publicada.
     * POR QUE: sem esses requisitos, a tentativa falha silenciosamente e o banco
     * fica sem linhas em push_subscriptions.
     * IMPACTO: remover esta validacao volta a esconder o motivo real da falha.
     */
    const browserSuporta =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setSuportado(browserSuporta && Boolean(vapidPublicKey));
    setPermissao(browserSuporta ? Notification.permission : "unsupported");
    if (browserSuporta && !vapidPublicKey) {
      setErro("Chave publica de notificacao nao configurada.");
    }
  }, [vapidPublicKey, setSuportado, setPermissao, setErro]);

  const registrarNoServidor = useCallback(async (sub: PushSubscription) => {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? "Nao foi possivel salvar a assinatura push.");
    }
  }, []);

  const inscrever = useCallback(async () => {
    if (!suportado || !vapidPublicKey) return;
    setCarregando(true);
    setErro(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existente = await reg.pushManager.getSubscription();

      if (existente) {
        await registrarNoServidor(existente);
        setInscrito(true);
        setPermissao(Notification.permission);
        return;
      }

      const perm = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

      setPermissao(perm);
      if (perm !== "granted") return;

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      await registrarNoServidor(sub);
      setInscrito(true);
    } catch (e) {
      console.warn("[push]", e);
      setErro(e instanceof Error ? e.message : "Erro ao ativar notificacoes.");
    } finally {
      setCarregando(false);
    }
  }, [registrarNoServidor, suportado, vapidPublicKey, setCarregando, setErro, setInscrito, setPermissao]);

  return { inscrito, suportado, carregando, erro, permissao, inscrever };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
