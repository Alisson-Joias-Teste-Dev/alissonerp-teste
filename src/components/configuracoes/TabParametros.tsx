"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, CheckCircle } from "lucide-react";
import { Button, Toggle, StatusBadge, MessageBox, Input } from "@/components/ui";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export default function TabParametros({ parametros }: { parametros: Record<string, unknown> }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [form, setForm] = useState({
    ouro:   String(parametros.ouro   ?? ""),
    dollar: String(parametros.dollar ?? ""),
    euro:   String(parametros.euro   ?? ""),
    prata:  String(parametros.prata  ?? ""),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState("");
  const [comentariosAtivos, setComentariosAtivos] = useState(true);
  const [salvandoComentarios, setSalvandoComentarios] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes/sistema")
      .then(r => r.json())
      .then((d: { comentarios_ordens_ativo?: boolean }) => setComentariosAtivos(d.comentarios_ordens_ativo ?? true))
      .catch(() => {});
  }, []);

  async function toggleComentarios() {
    setSalvandoComentarios(true);
    const novoValor = !comentariosAtivos;
    await fetch("/api/configuracoes/sistema", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentarios_ordens_ativo: novoValor }),
    });
    setComentariosAtivos(novoValor);
    setSalvandoComentarios(false);
  }

  async function handleSave() {
    setSaving(true); setErro(""); setSaved(false);
    const res = await fetch("/api/configuracoes/parametros", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ouro:   Number(form.ouro),
        dollar: Number(form.dollar),
        euro:   Number(form.euro),
        prata:  Number(form.prata),
      }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setErro(d.error ?? "Erro ao salvar"); return; }
    setSaved(true);
    startTransition(() => router.refresh());
    setTimeout(() => setSaved(false), 3000);
  }

  const campos = [
    { key: "ouro",   label: "Cotação Ouro", prefix: "R$/g" },
    { key: "dollar", label: "Dólar",        prefix: "R$"   },
    { key: "euro",   label: "Euro",         prefix: "R$"   },
    { key: "prata",  label: "Prata",        prefix: "R$/g" },
  ] as const;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-gray-400">
          Atualizado em: {fmtDate((parametros.updated_at as string) ?? null)}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {campos.map(({ key, label, prefix }) => (
          <Input
            key={key}
            label={label}
            prefix={prefix}
            type="number"
            step="0.01"
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          />
        ))}
      </div>

      {/* ── Comentários de Ordens ── */}
      <div className="flex items-center justify-between px-5 py-4 rounded-xl border border-gray-200 bg-white">
        <div>
          <p className="text-sm font-semibold text-gray-900">Comentários de Ordens</p>
          <p className="text-xs mt-0.5 text-gray-400">
            {comentariosAtivos
              ? "Ativos — colaboradores podem comentar em ordens"
              : "Desativados — campo de comentário oculto"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Toggle ativo={comentariosAtivos} onChange={toggleComentarios} disabled={salvandoComentarios} />
          <StatusBadge ativo={comentariosAtivos} />
        </div>
      </div>

      {erro && (
        <MessageBox tipo="erro" mensagem={erro} onFechar={() => setErro("")} />
      )}

      <Button variant="primary" loading={saving} onClick={handleSave}>
        {saved ? <><CheckCircle size={15} /> Salvo!</> : <><Save size={15} /> Salvar Cotações</>}
      </Button>
    </div>
  );
}
