"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
} from "lucide-react";
import { Button, Spinner, Toggle, Badge, MessageBox } from "@/components/ui";
import { ConfigIA, KeysStatus, PROVEDORES, P } from "./types";

export default function ConfigIAForm() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [config, setConfig] = useState<ConfigIA>({
    ia_ativa: "true",
    ia_provedor: "claude",
    ia_modelo_claude: "claude-haiku-4-5-20251001",
    ia_modelo_openai: "gpt-4o",
    ia_modelo_gemini: "gemini-2.0-flash",
  });
  const [keysStatus, setKeysStatus] = useState<KeysStatus>({
    claude: false,
    openai: false,
    gemini: false,
  });
  const [carregando, setCarregando] = useState(true);

  // Margem de pedras
  const [margemPedra, setMargemPedra] = useState("10");
  const [salvandoMargem, setSalvandoMargem] = useState(false);
  const [msgMargem, setMsgMargem] = useState<{
    ok: boolean;
    texto: string;
  } | null>(null);

  // Alterando provedor/ativa
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // Carregar config na montagem
  useEffect(() => {
    fetch("/api/configuracoes/ia")
      .then((r) => r.json())
      .then((data: { config: ConfigIA; keys_status: KeysStatus }) => {
        setConfig(data.config);
        setKeysStatus(data.keys_status);
        if (data.config.ia_margem_pedra_pct)
          setMargemPedra(data.config.ia_margem_pedra_pct);
        setCarregando(false);
      })
      .catch(() => setCarregando(false));
  }, []);

  async function salvarProvedor(novoProvedor: string) {
    setSalvandoConfig(true);
    const res = await fetch("/api/configuracoes/ia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provedor: novoProvedor }),
    });
    setSalvandoConfig(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsgMargem({
        ok: false,
        texto: "Erro ao salvar provedor: " + (body.error ?? res.status),
      });
      setTimeout(() => setMsgMargem(null), 4000);
      return;
    }
    setConfig((c) => ({ ...c, ia_provedor: novoProvedor }));
    startTransition(() => router.refresh());
  }

  async function toggleIA() {
    const novoValor = config.ia_ativa !== "true";
    setSalvandoConfig(true);
    const res = await fetch("/api/configuracoes/ia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativa: novoValor }),
    });
    setSalvandoConfig(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsgMargem({
        ok: false,
        texto: "Erro ao salvar: " + (body.error ?? res.status),
      });
      setTimeout(() => setMsgMargem(null), 4000);
      return;
    }
    setConfig((c) => ({ ...c, ia_ativa: novoValor ? "true" : "false" }));
  }

  async function salvarMargem() {
    const val = parseFloat(margemPedra);
    if (isNaN(val) || val < 0 || val > 50) {
      setMsgMargem({ ok: false, texto: "Margem deve ser entre 0 e 50%" });
      setTimeout(() => setMsgMargem(null), 3000);
      return;
    }
    setSalvandoMargem(true);
    const res = await fetch("/api/configuracoes/ia", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ margem_pedra_pct: val }),
    });
    setSalvandoMargem(false);
    if (res.ok) {
      setMsgMargem({ ok: true, texto: "Margem salva!" });
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsgMargem({ ok: false, texto: body.error ?? "Erro ao salvar." });
    }
    setTimeout(() => setMsgMargem(null), 3000);
  }

  if (carregando) {
    return (
      <div
        className="flex items-center gap-2 py-10 text-sm"
        style={{ color: P.muted }}
      >
        <Spinner size={16} /> Carregando configurações
        de IA...
      </div>
    );
  }

  const iaAtiva = config.ia_ativa === "true";
  const modeloAtual =
    config[`ia_modelo_${config.ia_provedor}` as keyof ConfigIA] ?? "—";

  return (
    <div className="space-y-7">
      {/* ── Toggle IA ── */}
      <div
        className="flex items-center justify-between px-5 py-4 rounded-xl"
        style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: P.creme }}>
            Validação por IA
          </p>
          <p className="text-xs mt-0.5" style={{ color: P.muted }}>
            {iaAtiva
              ? `Ativa — usando ${config.ia_provedor} · ${modeloAtual}`
              : "Desativada — peso aceito sem conferência da balança"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Toggle ativo={iaAtiva} onChange={toggleIA} disabled={salvandoConfig} />
          <Badge color={iaAtiva ? "success" : "neutral"}>{iaAtiva ? "Ativo" : "Inativo"}</Badge>
        </div>
      </div>

      {/* ── Provedor ativo ── */}
      <div className="space-y-2">
        <p
          className="text-[10px] uppercase tracking-widest font-medium"
          style={{ color: P.muted }}
        >
          Provedor Ativo
        </p>
        <div className="space-y-2">
          {PROVEDORES.map((prov) => {
            const selecionado = config.ia_provedor === prov.id;
            const temKey = keysStatus[prov.id as keyof KeysStatus];
            const modelo =
              config[`ia_modelo_${prov.id}` as keyof ConfigIA] ?? "—";
            return (
              <button
                key={prov.id}
                onClick={() => !selecionado && salvarProvedor(prov.id)}
                disabled={salvandoConfig}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all disabled:opacity-50 text-left"
                style={{
                  border: `1px solid ${selecionado ? P.sage : P.border}`,
                  backgroundColor: selecionado ? P.sage + "18" : P.card,
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{
                      borderColor: selecionado ? P.sage : P.muted,
                    }}
                  >
                    {selecionado && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: P.sage }}
                      />
                    )}
                  </div>
                  <div>
                    <span
                      className="text-sm font-medium"
                      style={{
                        color: selecionado ? P.creme : P.sage,
                      }}
                    >
                      {prov.nome}
                    </span>
                    <span className="text-xs ml-2" style={{ color: P.muted }}>
                      {prov.empresa}
                    </span>
                    <p
                      className="text-[10px] font-mono mt-0.5"
                      style={{ color: P.muted }}
                    >
                      {modelo}
                    </p>
                  </div>
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={
                    temKey
                      ? { backgroundColor: P.verde + "22", color: P.verde }
                      : {
                          backgroundColor: P.vermelho + "22",
                          color: P.vermelho,
                        }
                  }
                >
                  {temKey ? "✓ Key configurada" : "✗ Sem key"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tolerância de Validação ── */}
      <div className="space-y-2">
        <p
          className="text-[10px] uppercase tracking-widest font-medium"
          style={{ color: P.muted }}
        >
          Tolerância de Validação
        </p>
        <div
          className="p-4 rounded-xl space-y-4"
          style={{ border: `1px solid ${P.border}`, backgroundColor: P.card }}
        >
          {/* Metal */}
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
              style={{
                backgroundColor: P.dourado + "22",
                color: P.dourado,
              }}
            >
              🥇
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: P.creme }}>
                Ouro / Metal
              </p>
              <p className="text-xs mt-0.5" style={{ color: P.muted }}>
                Tolerância zero — o peso lido pela IA deve coincidir exatamente
                com o digitado (±0.005g)
              </p>
            </div>
          </div>

          {/* Divisor */}
          <div style={{ borderTop: `1px solid ${P.border}` }} />

          {/* Pedra */}
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
              style={{ backgroundColor: P.sage + "22", color: P.sage }}
            >
              💎
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: P.creme }}>
                Pedras
              </p>
              <p className="text-xs mt-0.5 mb-3" style={{ color: P.muted }}>
                Margem configurável — compara o peso calculado (qtd × peso
                unitário) com a balança
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label
                    className="text-xs whitespace-nowrap"
                    style={{ color: P.sage }}
                  >
                    Margem de erro:
                  </label>
                  <div
                    className="flex items-center rounded-lg overflow-hidden"
                    style={{ border: `1px solid ${P.border}` }}
                  >
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="1"
                      value={margemPedra}
                      onChange={(e) => setMargemPedra(e.target.value)}
                      className="w-16 bg-transparent px-3 py-1.5 text-sm font-mono outline-none text-right"
                      style={{ color: P.creme }}
                    />
                    <span className="px-2 text-xs" style={{ color: P.muted }}>
                      %
                    </span>
                  </div>
                  <Button variant="primary" size="sm" loading={salvandoMargem} onClick={salvarMargem}>
                    <Save size={11} /> Salvar
                  </Button>
                </div>
                {msgMargem && (
                  <MessageBox tipo={msgMargem.ok ? "ok" : "erro"} mensagem={msgMargem.texto} onFechar={() => setMsgMargem(null)} />
                )}
              </div>
              <p className="text-[10px] mt-2" style={{ color: P.muted }}>
                Ex: calculou 0.15g, balança mostra 0.14g → diferença 6.7% →
                dentro de {margemPedra}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
