"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { ArrowLeft, Loader2, XCircle } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { hasRole, isFullAccess } from "@/lib/roles";
import { ROLES_CALIBRAR_RFID } from "@/lib/rfid/roles";

import { useImpressora } from "@/hooks/rfid/useImpressora";

import { BannerImpressora } from "@/components/rfid/BannerImpressora";
import { PainelLayoutEtiqueta } from "@/components/rfid/PainelLayoutEtiqueta";

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function CalibrarRfidClient() {
  const router = useRouter();
  const { user, role, loading: authLoading } = useAuth();
  const { device, status, reconectar } = useImpressora();

  // ── Auth guard ─────────────────────────────────────────────────────────
  const autorizado = useMemo(() => {
    if (!role) return false;
    if (isFullAccess(role)) return true;
    return hasRole(role, [...ROLES_CALIBRAR_RFID]);
  }, [role]);

  // ── Auth guard render ─────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-800" />
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  if (!autorizado) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <XCircle className="w-12 h-12 mb-3 text-red-500" />
        <h1 className="text-xl font-semibold mb-2 text-emerald-800 font-serif">
          Sem permiss&atilde;o
        </h1>
        <p className="text-sm text-gray-600 max-w-md">
          Seu perfil ({role ?? "desconhecido"}) n&atilde;o tem acesso &agrave;
          calibra&ccedil;&atilde;o RFID. Apenas admin, desenvolvedor e
          gerente de f&aacute;brica podem calibrar a ZD500R.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <Script
        src="/browser-print/BrowserPrint-3.1.250.min.js"
        strategy="afterInteractive"
      />
      <Script
        src="/browser-print/BrowserPrint-Zebra-1.1.250.min.js"
        strategy="afterInteractive"
      />
      <div className="min-h-full bg-stone-50">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Voltar */}
        <button
          type="button"
          onClick={() => router.push("/rfid/cadastro")}
          className="flex items-center gap-1.5 text-sm text-emerald-800 hover:text-emerald-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Cadastro RFID
        </button>

        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-emerald-800 font-serif">
            Calibra&ccedil;&atilde;o e layout da etiqueta
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Calibra o chip, ajusta o layout e salva o modelo &mdash; ZD500R
          </p>
        </div>

        {/* Banner status impressora */}
        <BannerImpressora
          status={status}
          device={device}
          onReconectar={reconectar}
        />

        {/* Painel de calibração + layout + modelos */}
        <PainelLayoutEtiqueta />
      </div>
    </div>
    </>
  );
}
