"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Tag, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { hasRole, isFullAccess } from "@/lib/roles";
import { ROLES_CADASTRAR_RFID } from "@/lib/rfid/roles";

import { useImpressora } from "@/hooks/rfid/useImpressora";
import { usePrintFlow } from "@/hooks/rfid/usePrintFlow";
import { useQueryClient } from "@tanstack/react-query";
import { enviarEVerificar } from "@/lib/rfid/browser-print";
import type { ProdutoRfid } from "@/lib/rfid/tipos";

import { BannerImpressora } from "@/components/rfid/BannerImpressora";
import { BuscaProduto } from "@/components/rfid/BuscaProduto";
import { CardProdutoPreview } from "@/components/rfid/CardProdutoPreview";
import { BotaoImprimir } from "@/components/rfid/BotaoImprimir";
import { SessaoSidebar } from "@/components/rfid/SessaoSidebar";

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CadastroRfidClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, role, loading: authLoading } = useAuth();

  // ── Hooks globais ─────────────────────────────────────────────────────
  const { device, status, reconectar } = useImpressora();
  const { state: printState, actions: printActions } = usePrintFlow();

  // ── Estado local ──────────────────────────────────────────────────────
  const [selectedProduct, setSelectedProduct] = useState<ProdutoRfid | null>(null);
  const [reimprimindoEpc, setReimprimindoEpc] = useState<string | null>(null);

  // ── Derivados ─────────────────────────────────────────────────────────
  const conectado = status === "conectado" && device !== null;
  const imprimindo = printState.phase !== "idle";

  const podeImprimir = useMemo(() => {
    if (!selectedProduct || !selectedProduct.tem_sku_e_nome) return false;
    if (!conectado) return false;
    if (imprimindo) return false;
    return true;
  }, [selectedProduct, conectado, imprimindo]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleProdutoSelecionado = useCallback((produto: ProdutoRfid) => {
    setSelectedProduct(produto);
  }, []);

  const handleLimparSelecao = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  // ── Impressão ─────────────────────────────────────────────────────────

  const handleImprimir = useCallback(async () => {
    if (!podeImprimir || !selectedProduct || !device) return;

    try {
      // 1. Cadastrar EPC no backend
      const { epc, zpl } = await printActions.cadastrar(selectedProduct.id_produto);

      // 2. Enviar para impressora + verificar
      const resultado = await printActions.enviar(device, zpl);

      // 3. Reagir ao resultado
      switch (resultado.status) {
        case "ok":
          await printActions.confirmar(epc);
          toast.success("Tag gravada e conferida", {
            description: selectedProduct.sku ?? undefined,
          });
          // Invalida sessão para atualizar sidebar
          queryClient.invalidateQueries({ queryKey: ["rfid", "sessao"] });
          // Limpa seleção para próxima peça
          setSelectedProduct(null);
          break;

        case "void":
          await printActions.reverter(epc, resultado.mensagem);
          toast.error("Etiqueta saiu VOID", {
            description: resultado.mensagem,
          });
          break;

        case "no_tag":
          await printActions.reverter(epc, resultado.mensagem);
          toast.error("Nenhuma etiqueta detectada", {
            description: resultado.mensagem,
          });
          break;

        case "divergente":
          await printActions.reverter(epc, resultado.mensagem);
          toast.error("Divergência de EPC", {
            description: resultado.mensagem,
          });
          break;

        case "offline":
          await printActions.reverter(epc, resultado.mensagem);
          toast("Impressora não respondeu", {
            description: resultado.mensagem,
          });
          break;
      }
    } catch (err: unknown) {
      const mensagem =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Erro inesperado";

      toast.error("Falha na impressão", {
        description: mensagem,
      });
      printActions.reset();
    }
  }, [podeImprimir, selectedProduct, device, printActions, queryClient]);

  // ── Reimpressão ───────────────────────────────────────────────────────

  const handleReimprimir = useCallback(
    async (epc: string) => {
      if (!conectado || !device) {
        toast.error("Impressora não conectada", {
          description: "Verifique o Zebra Browser Print.",
        });
        return;
      }

      setReimprimindoEpc(epc);
      try {
        const res = await fetch("/api/rfid/reimprimir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ epc }),
        });
        const data = await res.json();

        if (!res.ok) {
          toast.error("Falha na reimpressão", {
            description: data.error ?? `Erro ${res.status}`,
          });
          return;
        }

        await enviarEVerificar(device, data.zpl);
        toast.success(`Tag ${epc} reimpressa`);
      } catch (err) {
        toast.error("Erro na reimpressão", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setReimprimindoEpc(null);
      }
    },
    [device, conectado],
  );

  // ── Atalhos de teclado ────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+P → imprimir
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        if (podeImprimir) {
          e.preventDefault();
          handleImprimir();
        }
        return;
      }
      // Esc → limpar seleção
      if (e.key === "Escape" && selectedProduct !== null) {
        e.preventDefault();
        handleLimparSelecao();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [podeImprimir, handleImprimir, selectedProduct, handleLimparSelecao]);

  // ── Auth guard ─────────────────────────────────────────────────────────

  // Autorização: full access OU role na lista de cadastro RFID
  const autorizado = useMemo(() => {
    if (!role) return false;
    if (isFullAccess(role)) return true;
    return hasRole(role, [...ROLES_CADASTRAR_RFID]);
  }, [role]);

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
          Sem permissão
        </h1>
        <p className="text-sm text-gray-600 max-w-md">
          Seu perfil ({role ?? "desconhecido"}) n&atilde;o tem acesso ao cadastro de tags
          RFID. Fale com um administrador ou gerente de f&aacute;brica.
        </p>
      </div>
    );
  }

  // ── Render principal ──────────────────────────────────────────────────

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
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2 text-emerald-800 font-serif">
            <Tag className="w-7 h-7" />
            Etiquetar Joia
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            M&oacute;dulo RFID &mdash; ZD500R
          </p>
        </div>

        {/* Banner status impressora */}
        <div className="mb-4">
          <BannerImpressora
            status={status}
            device={device}
            onReconectar={reconectar}
          />
        </div>

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 md:gap-6">
          {/* Coluna principal */}
          <div className="space-y-4">
            {/* Busca de produto */}
            <BuscaProduto
              onProdutoSelecionado={handleProdutoSelecionado}
              disabled={imprimindo}
            />

            {/* Card preview do produto */}
            <CardProdutoPreview
              produto={selectedProduct}
              carregando={false}
              onLimpar={handleLimparSelecao}
            />

            {/* Botão imprimir */}
            <BotaoImprimir
              disabled={!podeImprimir}
              imprimindo={imprimindo}
              onClick={handleImprimir}
            />
          </div>

          {/* Coluna lateral — sessão */}
          <SessaoSidebar
            onReimprimir={handleReimprimir}
            reimprimindoEpc={reimprimindoEpc}
            disabled={imprimindo || !conectado}
          />
        </div>
      </div>
    </div>
    </>
  );
}
