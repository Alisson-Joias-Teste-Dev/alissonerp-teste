"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Captura o evento assim que o browser dispara — antes do React montar o componente.
// O Chrome pode disparar 'beforeinstallprompt' muito cedo (antes do useEffect rodar),
// então guardamos numa variável de módulo para não perder o evento.
let _deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    _deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export default function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    const jaInstalado =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (jaInstalado) return;

    const jaDispensado = sessionStorage.getItem("erp-install-dismissed");
    if (jaDispensado) return;

    // Evento já capturado antes do componente montar?
    if (_deferredPrompt) {
      setPromptEvent(_deferredPrompt);
      setVisivel(true);
      return;
    }

    // Ainda não disparou — continua escutando
    const handler = (e: Event) => {
      e.preventDefault();
      _deferredPrompt = e as BeforeInstallPromptEvent;
      setPromptEvent(_deferredPrompt);
      setVisivel(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visivel || !promptEvent) return null;

  async function instalar() {
    if (!promptEvent) return;
    setInstalando(true);
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        _deferredPrompt = null;
        setVisivel(false);
      }
    } finally {
      setInstalando(false);
    }
  }

  function dispensar() {
    sessionStorage.setItem("erp-install-dismissed", "1");
    setVisivel(false);
  }

  const modulos = [
    "Aprovações em 1 toque — sem abrir o computador",
    "Vendas, orçamentos e clientes",
    "Tarefas de produção e estoque",
    "Notificações em tempo real",
  ];

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl shadow-2xl border overflow-hidden"
      style={{ backgroundColor: "#fff", borderColor: "#E8DCC8" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: "#184036" }}>
        <span className="text-sm font-bold text-white">Instalar Alisson ERP</span>
        <button onClick={dispensar} className="text-white/70 hover:text-white transition-opacity">
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-96x96.png" alt="Alisson ERP" className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div>
            <p className="text-sm font-bold" style={{ color: "#184036" }}>Alisson ERP</p>
            <p className="text-xs" style={{ color: "#6B7280" }}>Acesse o ERP direto do celular</p>
          </div>
        </div>

        <ul className="space-y-1.5 mb-4">
          {modulos.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs" style={{ color: "#374151" }}>
              <span className="font-bold mt-0.5 flex-shrink-0" style={{ color: "#184036" }}>•</span>
              {item}
            </li>
          ))}
        </ul>

        <button
          onClick={instalar}
          disabled={instalando}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-60"
          style={{ backgroundColor: "#184036", color: "#fff" }}
        >
          <Download size={15} />
          {instalando ? "Instalando..." : "Instalar agora"}
        </button>
      </div>
    </div>
  );
}
