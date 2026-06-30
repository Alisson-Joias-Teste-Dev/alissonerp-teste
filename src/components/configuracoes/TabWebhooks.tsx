"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
} from "lucide-react";
import { Button, Toggle, StatusBadge, Badge } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { dispararWebhook } from "@/lib/webhooks";

// ─── Paleta (tema claro — alinhado com aba Usuários) ─────────────────────────
const P = {
  bg:       "#f9fafb",  // gray-50
  card:     "#ffffff",  // white
  border:   "#e5e7eb",  // gray-200
  creme:    "#111827",  // gray-900 — texto principal
  sage:     "#6b7280",  // gray-500 — texto secundário
  muted:    "#9ca3af",  // gray-400 — texto mutado
  dourado:  "#d97706",  // amber-600
  verde:    "#16a34a",  // green-600
  vermelho: "#dc2626",  // red-600
};

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface WebhookLog {
  id: number;
  webhook_nome: string | null;
  response_status: number | null;
  erro: string | null;
  created_at: string;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export default function TabWebhooks({ webhooks, logs }: { webhooks: any[]; logs: any[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toggling, setToggling] = useState<number | null>(null);
  const [testando, setTestando] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const supabase = createClient();

  async function toggleAtivo(wh: any) {
    setToggling(wh.id);
    await supabase
      .from("webhook_config")
      .update({ ativo: !wh.ativo })
      .eq("id", wh.id);
    setToggling(null);
    startTransition(() => router.refresh());
  }

  async function testar(nome: string) {
    setTestando(nome);
    const result = await dispararWebhook(nome, { teste: true, ts: Date.now() });
    setTestResult((r) => ({
      ...r,
      [nome]: {
        ok: result.success,
        msg: result.success
          ? `HTTP ${result.status}`
          : (result.error ?? "Erro desconhecido"),
      },
    }));
    setTestando(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      {/* Tabela de webhooks */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
              {["Nome", "Descrição", "Disparos", "Último", "Ativo", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium"
                  style={{ color: P.muted }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {webhooks.map((wh: any) => {
              const tr = testResult[wh.nome];
              return (
                <tr
                  key={wh.id}
                  style={{ borderBottom: `1px solid ${P.bg}` }}
                  className="hover:bg-[#0F2922]/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs" style={{ color: P.dourado }}>
                      {wh.nome}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: P.sage }}>
                    {wh.descricao ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-xs text-center" style={{ color: P.creme }}>
                    {wh.total_disparos}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: P.muted }}>
                    {wh.ultimo_disparo ? fmtDate(wh.ultimo_disparo) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Toggle ativo={wh.ativo} onChange={() => toggleAtivo(wh)} disabled={toggling === wh.id} />
                      <StatusBadge ativo={wh.ativo} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {tr && (
                        <Badge color={tr.ok ? "success" : "error"}>
                          {tr.msg}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        loading={testando === wh.nome}
                        disabled={!wh.ativo}
                        onClick={() => testar(wh.nome)}
                      >
                        <RefreshCw size={10} /> Testar
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Log de disparos */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: P.muted }}>
          Log — últimos 30 disparos
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0">
                <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                  {["Data", "Webhook", "Status", "Erro"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[10px] uppercase tracking-widest font-medium"
                      style={{ color: P.muted }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(logs as WebhookLog[]).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center" style={{ color: P.muted }}>
                      Nenhum disparo registrado ainda
                    </td>
                  </tr>
                ) : (
                  (logs as WebhookLog[]).map((l) => (
                    <tr
                      key={l.id}
                      style={{ borderBottom: `1px solid ${P.bg}` }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: P.muted }}>
                        {fmtDate(l.created_at)}
                      </td>
                      <td className="px-3 py-2 font-mono" style={{ color: P.dourado }}>
                        {l.webhook_nome ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {l.response_status ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{
                              backgroundColor:
                                l.response_status < 300 ? P.verde + "22" : P.vermelho + "22",
                              color: l.response_status < 300 ? P.verde : P.vermelho,
                            }}
                          >
                            {l.response_status}
                          </span>
                        ) : (
                          <span style={{ color: P.muted }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: P.vermelho }}>
                        {l.erro ?? ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
