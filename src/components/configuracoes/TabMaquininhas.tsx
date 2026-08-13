"use client";

import { useState, useEffect } from "react";
import {
  RefreshCw,
} from "lucide-react";
import { Button, Spinner, MessageBox } from "@/components/ui";
import ListaDispositivos from "./maquininhas/ListaDispositivos";

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

interface MaqDevice {
  id: number;
  device_id: string;
  nome_legivel: string;
  vendedor_id: number | null;
  is_reserva: boolean;
  ativo: boolean;
  loja: string | null;
  parcelas_padrao_mp: number;
}

interface Vendedor {
  id_vendedor: number;
  nome: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab Maquininhas — Gerenciamento de devices Point por vendedor
// ═══════════════════════════════════════════════════════════════════════════════
export default function TabMaquininhas() {
  const [devices, setDevices] = useState<MaqDevice[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  // Estado modal edição inline
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editLoja, setEditLoja] = useState("");
  const [editVendedorId, setEditVendedorId] = useState<string>("");
  const [editIsReserva, setEditIsReserva] = useState(false);
  const [editAtivo, setEditAtivo] = useState(true);
  const [editParcelasPadrao, setEditParcelasPadrao] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveErro, setSaveErro] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const [devRes, vendRes] = await Promise.all([
        fetch("/api/mercado-pago/devices"),
        fetch("/api/vendedores"),
      ]);
      if (!devRes.ok) throw new Error("Erro ao carregar maquininhas");
      setDevices(await devRes.json());
      if (vendRes.ok) setVendedores(await vendRes.json());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function sincronizar() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/mercado-pago/devices", { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setSyncMsg({ tipo: "ok", texto: `Sincronizado: ${body.inserted} novas, ${body.updated} atualizadas (total ${body.total})` });
        await carregar();
      } else {
        setSyncMsg({ tipo: "erro", texto: body.error ?? "Erro ao sincronizar" });
      }
    } catch {
      setSyncMsg({ tipo: "erro", texto: "Erro de rede" });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  }

  function abrirEdicao(d: MaqDevice) {
    setEditandoId(d.id);
    setEditNome(d.nome_legivel);
    setEditLoja(d.loja ?? "");
    setEditVendedorId(d.vendedor_id != null ? String(d.vendedor_id) : "");
    setEditIsReserva(d.is_reserva);
    setEditAtivo(d.ativo);
    setEditParcelasPadrao(d.parcelas_padrao_mp ?? 1);
    setSaveErro(null);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setSaveErro(null);
  }

  async function salvar(id: number) {
    setSaving(true);
    setSaveErro(null);
    try {
      const body: Record<string, unknown> = {
        id,
        nome_legivel: editNome.trim() || undefined,
        loja: editLoja.trim() || null,
        ativo: editAtivo,
      };
      if (editVendedorId) {
        body.vendedor_id = Number(editVendedorId);
        body.is_reserva = false;
        body.parcelas_padrao_mp = editParcelasPadrao;
      } else {
        body.vendedor_id = null;
        body.is_reserva = editIsReserva;
      }
      const res = await fetch("/api/mercado-pago/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) throw new Error("Vendedor já tem outra maquininha atribuída");
        throw new Error(data.error ?? "Erro ao salvar");
      }
      setEditandoId(null);
      await carregar();
    } catch (e) {
      setSaveErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-sm" style={{ color: P.sage }}>
        <Spinner size={16} /> Carregando maquininhas...
      </div>
    );
  }

  if (erro) {
    return (
      <MessageBox tipo="erro" mensagem={erro} onFechar={() => setErro(null)} />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: P.creme }}>Maquininhas</h2>
          <p className="text-xs" style={{ color: P.muted }}>
            {devices.length === 0
              ? "Nenhuma maquininha sincronizada"
              : `${devices.length} maquininha${devices.length > 1 ? "s" : ""} cadastrada${devices.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <Button variant="primary" size="sm" loading={syncing} onClick={sincronizar}>
          <RefreshCw size={13} /> {syncing ? "Sincronizando..." : "Sincronizar com MP"}
        </Button>
      </div>

      {syncMsg && (
        <MessageBox tipo={syncMsg.tipo} mensagem={syncMsg.texto} onFechar={() => setSyncMsg(null)} />
      )}

      {devices.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: P.muted }}>
          Clique em &ldquo;Sincronizar com MP&rdquo; para importar as maquininhas cadastradas no Mercado Pago.
        </div>
      )}

      {devices.length > 0 && (
        <ListaDispositivos
          devices={devices}
          vendedores={vendedores}
          editandoId={editandoId}
          editNome={editNome}
          setEditNome={setEditNome}
          editLoja={editLoja}
          setEditLoja={setEditLoja}
          editVendedorId={editVendedorId}
          setEditVendedorId={setEditVendedorId}
          editIsReserva={editIsReserva}
          setEditIsReserva={setEditIsReserva}
          editAtivo={editAtivo}
          setEditAtivo={setEditAtivo}
          editParcelasPadrao={editParcelasPadrao}
          setEditParcelasPadrao={setEditParcelasPadrao}
          saving={saving}
          saveErro={saveErro}
          onEdit={abrirEdicao}
          onSave={salvar}
          onCancel={cancelarEdicao}
        />
      )}
    </div>
  );
}
