"use client";

import { useState, useEffect } from "react";
import { RefreshCw, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import type { Parametros } from "./types";
import { fmtDate } from "./constants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";

const cotacoesMeta = [
  { key: "ouro", label: "Ouro", unit: "R$/g" },
  { key: "dollar", label: "Dólar", unit: "R$" },
  { key: "euro", label: "Euro", unit: "R$" },
  { key: "prata", label: "Prata", unit: "R$/g" },
];

export default function TabParametros({ parametros }: { parametros: Parametros }) {
  const [cotacoes, setCotacoes] = useState({ ouro: 0, dollar: 0, euro: 0, prata: 0 });
  const [autoAtivo, setAutoAtivo] = useState(false);
  const [ultimoUpdate, setUltimoUpdate] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comentariosAtivos, setComentariosAtivos] = useState(true);
  const [salvandoComentarios, setSalvandoComentarios] = useState(false);

  useEffect(() => { fetch("/api/configuracoes/sistema").then(r => r.json()).then((d: { comentarios_ordens_ativo?: boolean }) => setComentariosAtivos(d.comentarios_ordens_ativo ?? true)).catch(() => {}); }, []);
  useEffect(() => {
    fetch("/api/configuracoes/cotacoes").then(r => { if (!r.ok) throw new Error("Erro"); return r.json(); })
      .then(data => { setCotacoes(data.cotacoes); setAutoAtivo(data.config.auto_ativo); setUltimoUpdate(data.config.ultimo_update); })
      .catch(() => {});
  }, []);

  async function toggleComentarios(checked: boolean) { setSalvandoComentarios(true); await fetch("/api/configuracoes/sistema", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comentarios_ordens_ativo: checked }) }); setComentariosAtivos(checked); toast.success(checked ? "Comentários ativados" : "Comentários desativados"); setSalvandoComentarios(false); }

  async function toggleAuto(checked: boolean) { setSaving(true); const res = await fetch("/api/configuracoes/cotacoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auto_ativo: checked }) }); setSaving(false); if (res.ok) { setAutoAtivo(checked); toast.success(`Atualização automática ${checked ? "ativada" : "desativada"}`); } else toast.error("Erro ao salvar"); }

  async function atualizarAgora() {
    setAtualizando(true);
    try { const res = await fetch("/api/configuracoes/cotacoes", { method: "POST" }); const data = await res.json();
      if (res.ok) { setCotacoes(data.cotacoes); setUltimoUpdate(data.atualizado_em); toast.success("Cotações atualizadas"); }
      else toast.error(data.error ?? "Erro ao atualizar"); } catch { toast.error("Falha na requisição"); }
    setAtualizando(false);
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-4">
        {cotacoesMeta.map(({ key, label, unit }) => {
          const valor = cotacoes[key as keyof typeof cotacoes];
          const valorSalvo = parametros[key as keyof typeof parametros] as number || 0;
          const diff = valorSalvo > 0 ? ((valor - valorSalvo) / valorSalvo) * 100 : 0;
          const subiu = diff >= 0;
          return (
          <div key={key} className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6">
            <span className="text-sm text-gray-500">{label}</span>
            <h4 className="mt-2 font-bold text-2xl text-gray-900">
              {valor.toFixed(key === "dollar" || key === "euro" ? 4 : 2)}
              <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>
            </h4>
            <div className="mt-3 flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${subiu ? "bg-success-50 text-success-600" : "bg-error-50 text-error-600"}`}>
                {subiu ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                {Math.abs(diff).toFixed(2)}%
              </span>
              <span className="text-xs text-gray-400">vs parâmetro</span>
            </div>
          </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Última atualização: {fmtDate(parametros.updated_at ?? ultimoUpdate)}</span>
        <Button size="sm" variant="outline" onClick={atualizarAgora} loading={atualizando} startIcon={<RefreshCw size={13} />}>Atualizar</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        <Card title="Atualização Automática" desc="As cotações são obtidas via Open Exchange Rates">
          <Switch label={autoAtivo ? "Cotações atualizadas automaticamente" : "Atualização automática desativada"}
            checked={autoAtivo} onChange={toggleAuto} disabled={saving} color="brand" />
        </Card>

        <Card title="Comportamento do Sistema">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800">Comentários de Ordens</p>
              <p className="text-xs text-gray-500 mt-0.5">{comentariosAtivos ? "Colaboradores podem comentar" : "Comentários desativados"}</p>
            </div>
            <Switch checked={comentariosAtivos} onChange={toggleComentarios} disabled={salvandoComentarios} color="brand" />
          </div>
        </Card>
      </div>
    </div>
  );
}
