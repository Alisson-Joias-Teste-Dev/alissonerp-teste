"use client";

/**
 * MotoboyDrawer — Drawer lateral para gerenciar cadastro de motoboys.
 *
 * REGRA DE NEGÓCIO: cada motoboy é um entregador com acesso ao app via
 * email/senha. O cadastro cria um auth.user (Supabase Auth) e vincula
 * ao registro operacional em motoboys. Apenas admin/gerente/dev podem
 * cadastrar, editar ou desativar motoboys.
 *
 * O QUE: lista todos os motoboys (ativos + inativos), permite adicionar
 * novo (nome, email, senha, telefone, veículo, placa), editar campos e
 * ativar/desativar. A lista recarrega após cada ação.
 *
 * IMPACTO SE ALTERADO: a lista alimenta o select de entregador na criação
 * de entrega. Remover campos quebra a UI de seleção.
 */

import { useState, useEffect, useCallback } from "react";
import {
  X,
  UserPlus,
  Loader2,
  Bike,
  Phone,
  Mail,
  Car,
  Hash,
  Power,
  PowerOff,
  Pencil,
  DollarSign,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// ── Paleta ──────────────────────────────────────────────────────────────────────
const C = {
  esmeralda: "#184036",
  esmeraldaLt: "#18403612",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
  vermelho: "#DC2626",
  vermelhoLt: "#FEE2E2",
  ambar: "#D97706",
  ambarLt: "#FEF3C7",
  verde: "#059669",
  verdeLt: "#D1FAE5",
  cinza: "#6B7280",
  cinzaBorder: "#E5E7EB",
};

// ── Tipos ───────────────────────────────────────────────────────────────────────

interface MotoboyItem {
  id: number;
  user_id: string | null;
  nome: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  rua: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  complemento: string | null;
  placa: string | null;
  ativo: boolean;
  created_at: string;
}

// ── Props ───────────────────────────────────────────────────────────────────────

interface MotoboyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onPagar?: () => void;
}

// ── Componente ──────────────────────────────────────────────────────────────────

export default function MotoboyDrawer({ isOpen, onClose, onPagar }: MotoboyDrawerProps) {
  const [motoboys, setMotoboys] = useState<MotoboyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroLista, setErroLista] = useState("");

  // Formulário de novo motoboy
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState("");
  const [form, setForm] = useState({ nome: "", email: "", senha: "", telefone: "", cpf: "", rua: "", numero: "", bairro: "", cidade: "", uf: "", cep: "", complemento: "", placa: "" });

  // Edição inline
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editTelefone, setEditTelefone] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editRua, setEditRua] = useState("");
  const [editNumero, setEditNumero] = useState("");
  const [editBairro, setEditBairro] = useState("");
  const [editCidade, setEditCidade] = useState("");
  const [editUf, setEditUf] = useState("");
  const [editCep, setEditCep] = useState("");
  const [editComplemento, setEditComplemento] = useState("");
  const [editPlaca, setEditPlaca] = useState("");
  const [editSalvando, setEditSalvando] = useState(false);

  // ── Carregar lista ──────────────────────────────────────────────────────────
  const carregarMotoboys = useCallback(async () => {
    setLoading(true);
    setErroLista("");
    try {
      const data = await apiFetch<MotoboyItem[]>(
        "/api/entregas-venda/motoboys?todos=true",
      );
      setMotoboys(data);
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : "Erro ao carregar motoboys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) carregarMotoboys();
  }, [isOpen, carregarMotoboys]);

  // ── Criar motoboy ───────────────────────────────────────────────────────────
  async function handleCriar() {
    if (!form.nome.trim() || !form.email.trim() || !form.senha.trim() || !form.telefone.trim() || !form.cpf.trim() || !form.rua.trim() || !form.numero.trim() || !form.bairro.trim() || !form.cidade.trim() || !form.uf.trim()) {
      setErroForm("Preencha todos os campos obrigatórios (*).");
      return;
    }
    setSalvando(true);
    setErroForm("");
    try {
      await apiFetch("/api/entregas-venda/motoboys", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ nome: "", email: "", senha: "", telefone: "", cpf: "", rua: "", numero: "", bairro: "", cidade: "", uf: "", cep: "", complemento: "", placa: "" });
      setMostrarForm(false);
      await carregarMotoboys();
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Erro ao cadastrar motoboy");
    } finally {
      setSalvando(false);
    }
  }

  // ── Salvar edição ───────────────────────────────────────────────────────────
  async function handleSalvarEdicao(motoboyId: number) {
    setEditSalvando(true);
    try {
      await apiFetch(`/api/entregas-venda/motoboys/${motoboyId}`, {
        method: "PUT",
        body: JSON.stringify({
          nome: editNome.trim() || undefined,
          telefone: editTelefone.trim() || undefined,
          cpf: editCpf.trim() || undefined,
          rua: editRua.trim() || undefined,
          numero: editNumero.trim() || undefined,
          bairro: editBairro.trim() || undefined,
          cidade: editCidade.trim() || undefined,
          uf: editUf.trim() || undefined,
          cep: editCep.trim() || undefined,
          complemento: editComplemento.trim() || undefined,
          placa: editPlaca.trim() || undefined,
        }),
      });
      setEditandoId(null);
      await carregarMotoboys();
    } catch {
      // ignora — o usuário pode tentar de novo
    } finally {
      setEditSalvando(false);
    }
  }

  // ── Ativar/Desativar ────────────────────────────────────────────────────────
  async function handleToggleAtivo(motoboy: MotoboyItem) {
    try {
      await apiFetch(`/api/entregas-venda/motoboys/${motoboy.id}`, {
        method: "PUT",
        body: JSON.stringify({ ativo: !motoboy.ativo }),
      });
      await carregarMotoboys();
    } catch {
      // ignora
    }
  }

  // ── Iniciar edição ──────────────────────────────────────────────────────────
  function iniciarEdicao(m: MotoboyItem) {
    setEditandoId(m.id);
    setEditNome(m.nome);
    setEditTelefone(m.telefone ?? "");
    setEditCpf(m.cpf ?? "");
    setEditRua(m.rua ?? "");
    setEditNumero(m.numero ?? "");
    setEditBairro(m.bairro ?? "");
    setEditCidade(m.cidade ?? "");
    setEditUf(m.uf ?? "");
    setEditCep(m.cep ?? "");
    setEditComplemento(m.complemento ?? "");
    setEditPlaca(m.placa ?? "");
  }

  // ── Agrupar ─────────────────────────────────────────────────────────────────
  const ativos = motoboys.filter((m) => m.ativo);
  const inativos = motoboys.filter((m) => !m.ativo);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50,
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(480px, 100vw)", background: "#fff", zIndex: 60,
          display: "flex", flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: `1px solid ${C.cremeBorder}`,
          background: C.cremeBg, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bike size={18} color={C.esmeralda} />
            <span style={{ fontWeight: 700, fontSize: 16, color: C.esmeralda }}>
              Motoboys
            </span>
            <span style={{ fontSize: 12, color: C.cinza }}>
              ({motoboys.length})
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onPagar && (
              <button onClick={onPagar}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.cremeBorder}`,
                  background: "#fff", color: C.esmeralda, fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                }}>
                <DollarSign size={14} /> Pagar
              </button>
            )}
            <button
              onClick={() => { setMostrarForm(true); setErroForm(""); }}
              disabled={mostrarForm}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", borderRadius: 6, border: "none",
                background: mostrarForm ? "#9CA3AF" : C.esmeralda,
                color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: mostrarForm ? "not-allowed" : "pointer",
              }}
            >
              <UserPlus size={14} /> Novo Motoboy
            </button>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <X size={18} color={C.cinza} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>

          {/* ── Formulário de criação ─────────────────────────────────────── */}
          {mostrarForm && (
            <div style={{
              padding: "16px", borderRadius: 10,
              background: "#fff", border: `2px solid ${C.esmeralda}`,
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.esmeralda, marginBottom: 14 }}>
                Novo Motoboy
              </div>

              {/* ── Dados Pessoais ──────────────────────────────────────── */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.cinza, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Dados pessoais
                </div>
                <label style={labelStyle}>Nome completo *</label>
                <input type="text" placeholder="Ex: João da Silva"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  style={inputStyle} />
                <label style={labelStyle}>CPF *</label>
                <input type="text" placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  style={inputStyle} />
                <label style={labelStyle}>E-mail *</label>
                <input type="email" placeholder="joao@email.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={inputStyle} />
                <label style={labelStyle}>WhatsApp *</label>
                <input type="tel" placeholder="(85) 99999-9999"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  style={inputStyle} />
              </div>

              {/* ── Endereço ────────────────────────────────────────────── */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.cinza, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Endereço
                </div>
                <label style={labelStyle}>Rua *</label>
                <input type="text" placeholder="Av. Dom Luís"
                  value={form.rua}
                  onChange={(e) => setForm({ ...form, rua: e.target.value })}
                  style={inputStyle} />
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Número *</label>
                    <input type="text" placeholder="123"
                      value={form.numero}
                      onChange={(e) => setForm({ ...form, numero: e.target.value })}
                      style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>CEP</label>
                    <input type="text" placeholder="60000-000"
                      value={form.cep}
                      onChange={(e) => setForm({ ...form, cep: e.target.value })}
                      style={inputStyle} />
                  </div>
                </div>
                <label style={labelStyle}>Bairro *</label>
                <input type="text" placeholder="Aldeota"
                  value={form.bairro}
                  onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                  style={inputStyle} />
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 3 }}>
                    <label style={labelStyle}>Cidade *</label>
                    <input type="text" placeholder="Fortaleza"
                      value={form.cidade}
                      onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                      style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>UF *</label>
                    <input type="text" maxLength={2} placeholder="CE"
                      value={form.uf}
                      onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                      style={inputStyle} />
                  </div>
                </div>
                <label style={labelStyle}>Complemento</label>
                <input type="text" placeholder="Apto 101, Bloco B"
                  value={form.complemento}
                  onChange={(e) => setForm({ ...form, complemento: e.target.value })}
                  style={inputStyle} />
              </div>

              {/* ── Veículo ─────────────────────────────────────────────── */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.cinza, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Veículo
                </div>
                <label style={labelStyle}>Placa</label>
                <input type="text" placeholder="ABC-1234"
                  value={form.placa}
                  onChange={(e) => setForm({ ...form, placa: e.target.value })}
                  style={inputStyle} />
              </div>

              {/* ── Senha de acesso ─────────────────────────────────────── */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.cinza, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Acesso ao app
                </div>
                <label style={labelStyle}>Senha *</label>
                <input type="password" placeholder="Mínimo 6 caracteres"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  style={inputStyle} />
                <p style={{ margin: "4px 0 0", fontSize: 11, color: C.cinza }}>
                  O motoboy usará o e-mail acima e esta senha para acessar o app de entregas.
                </p>
              </div>

              {erroForm && (
                <div style={{
                  padding: "8px 12px", borderRadius: 6, background: C.vermelhoLt,
                  color: C.vermelho, fontSize: 12, fontWeight: 600, marginBottom: 10,
                }}>{erroForm}</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleCriar} disabled={salvando}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 6, border: "none",
                    background: C.esmeralda, color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: salvando ? "not-allowed" : "pointer", opacity: salvando ? 0.6 : 1,
                  }}>
                  {salvando ? "Criando..." : "Cadastrar Motoboy"}
                </button>
                <button onClick={() => { setMostrarForm(false); setErroForm(""); }}
                  style={{
                    padding: "10px 18px", borderRadius: 6, border: `1px solid ${C.cremeBorder}`,
                    background: "#fff", color: C.cinza, fontSize: 13, cursor: "pointer",
                  }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── Erro / Loading ────────────────────────────────────────────── */}
          {loading && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Loader2 size={20} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
          {erroLista && (
            <div style={{
              padding: "12px", borderRadius: 8, background: C.vermelhoLt,
              color: C.vermelho, fontSize: 12, fontWeight: 600, marginBottom: 12,
            }}>
              {erroLista}
            </div>
          )}

          {/* ── Lista ─────────────────────────────────────────────────────── */}
          {!loading && !erroLista && (
            <>
              {/* Seção: Ativos */}
              {ativos.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.cinza, marginBottom: 8, textTransform: "uppercase" }}>
                    Ativos ({ativos.length})
                  </div>
                  {ativos.map((m) => motoboyRow(m, editandoId === m.id, iniciarEdicao, handleSalvarEdicao, handleToggleAtivo, editNome, editTelefone, editCpf, editRua, editNumero, editBairro, editCidade, editUf, editCep, editComplemento, editPlaca, setEditNome, setEditTelefone, setEditCpf, setEditRua, setEditNumero, setEditBairro, setEditCidade, setEditUf, setEditCep, setEditComplemento, setEditPlaca, editSalvando, setEditandoId))}
                </div>
              )}

              {/* Seção: Inativos */}
              {inativos.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.cinza, marginBottom: 8, textTransform: "uppercase" }}>
                    Inativos ({inativos.length})
                  </div>
                  {inativos.map((m) => motoboyRow(m, editandoId === m.id, iniciarEdicao, handleSalvarEdicao, handleToggleAtivo, editNome, editTelefone, editCpf, editRua, editNumero, editBairro, editCidade, editUf, editCep, editComplemento, editPlaca, setEditNome, setEditTelefone, setEditCpf, setEditRua, setEditNumero, setEditBairro, setEditCidade, setEditUf, setEditCep, setEditComplemento, setEditPlaca, editSalvando, setEditandoId))}
                </div>
              )}

              {motoboys.length === 0 && (
                <p style={{ fontSize: 13, color: C.cinza, textAlign: "center", padding: 40 }}>
                  Nenhum motoboy cadastrado.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 13,
  border: "1px solid #E8DCC8", borderRadius: 6,
  outline: "none", background: "#fff", color: "#1f2937",
  marginBottom: 10, boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "#6B7280", marginBottom: 4,
};

/**
 * Renderiza uma linha de motoboy.
 * REGRA DE NEGÓCIO: linha pode estar em modo visualização ou edição.
 * No modo edição, nome/telefone/veículo/placa viram inputs inline.
 */
function motoboyRow(
  m: MotoboyItem,
  editando: boolean,
  iniciarEdicao: (m: MotoboyItem) => void,
  handleSalvarEdicao: (id: number) => void,
  handleToggleAtivo: (m: MotoboyItem) => void,
  editNome: string, editTelefone: string, editCpf: string,
  editRua: string, editNumero: string, editBairro: string, editCidade: string, editUf: string,
  editCep: string, editComplemento: string, editPlaca: string,
  setEditNome: (v: string) => void, setEditTelefone: (v: string) => void,
  setEditCpf: (v: string) => void,
  setEditRua: (v: string) => void, setEditNumero: (v: string) => void,
  setEditBairro: (v: string) => void, setEditCidade: (v: string) => void, setEditUf: (v: string) => void,
  setEditCep: (v: string) => void, setEditComplemento: (v: string) => void, setEditPlaca: (v: string) => void,
  editSalvando: boolean, setEditandoId: (id: null) => void,
) {
  // Bypass the type import issue by using the inline constant
  const C_val = {
    esmeralda: "#184036", esmeraldaLt: "#18403612",
    creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7",
    vermelho: "#DC2626", vermelhoLt: "#FEE2E2", ambar: "#D97706",
    ambarLt: "#FEF3C7", verde: "#059669", verdeLt: "#D1FAE5",
    cinza: "#6B7280", cinzaBorder: "#E5E7EB",
  };

  return (
    <div key={m.id} style={{
      padding: "12px 14px", borderRadius: 8,
      background: m.ativo ? "#fff" : "#F9FAFB",
      border: `1px solid ${m.ativo ? C_val.cremeBorder : "#E5E7EB"}`,
      marginBottom: 6, opacity: m.ativo ? 1 : 0.7,
    }}>
      {editando ? (
        /* ── Modo Edição ──────────────────────────────── */
        <div>
          {/* ── Dados pessoais ──────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: C_val.cinza, marginBottom: 6, textTransform: "uppercase" }}>
            Dados pessoais
          </div>
          <label style={labelStyle}>Nome completo</label>
          <input type="text" value={editNome}
            onChange={(e) => setEditNome(e.target.value)}
            style={inputStyle} />
          <label style={labelStyle}>CPF</label>
          <input type="text" value={editCpf}
            onChange={(e) => setEditCpf(e.target.value)}
            style={inputStyle} />
          <label style={labelStyle}>WhatsApp</label>
          <input type="tel" value={editTelefone}
            onChange={(e) => setEditTelefone(e.target.value)}
            style={inputStyle} />
          {/* ── Endereço ────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: C_val.cinza, marginBottom: 6, marginTop: 8, textTransform: "uppercase" }}>
            Endereço
          </div>
          <label style={labelStyle}>Rua</label>
          <input type="text" value={editRua}
            onChange={(e) => setEditRua(e.target.value)}
            style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Número</label>
              <input type="text" value={editNumero}
                onChange={(e) => setEditNumero(e.target.value)}
                style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>CEP</label>
              <input type="text" value={editCep}
                onChange={(e) => setEditCep(e.target.value)}
                style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle}>Bairro</label>
          <input type="text" value={editBairro}
            onChange={(e) => setEditBairro(e.target.value)}
            style={inputStyle} />
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 3 }}>
              <label style={labelStyle}>Cidade</label>
              <input type="text" value={editCidade}
                onChange={(e) => setEditCidade(e.target.value)}
                style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>UF</label>
              <input type="text" maxLength={2} value={editUf}
                onChange={(e) => setEditUf(e.target.value.toUpperCase())}
                style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle}>Complemento</label>
          <input type="text" value={editComplemento}
            onChange={(e) => setEditComplemento(e.target.value)}
            style={inputStyle} />
          {/* ── Veículo ─────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: C_val.cinza, marginBottom: 6, marginTop: 8, textTransform: "uppercase" }}>
            Veículo
          </div>
          <label style={labelStyle}>Placa</label>
          <input type="text" value={editPlaca}
            onChange={(e) => setEditPlaca(e.target.value)}
            style={inputStyle} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => handleSalvarEdicao(m.id)} disabled={editSalvando}
              style={{
                flex: 1, padding: "8px", borderRadius: 4, border: "none",
                background: C_val.esmeralda, color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: editSalvando ? "not-allowed" : "pointer",
              }}>
              {editSalvando ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={() => setEditandoId(null)}
              style={{
                padding: "8px 14px", borderRadius: 4, border: `1px solid ${C_val.cremeBorder}`,
                background: "#fff", color: C_val.cinza, fontSize: 12, cursor: "pointer",
              }}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        /* ── Modo Visualização ────────────────────────── */
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#1f2937" }}>{m.nome}</span>
                <span style={{
                  fontSize: 10, padding: "2px 6px", borderRadius: 4,
                  background: m.ativo ? C_val.verdeLt : "#E5E7EB",
                  color: m.ativo ? C_val.verde : C_val.cinza, fontWeight: 600,
                }}>
                  {m.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12, color: C_val.cinza }}>
                {m.email && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Mail size={11} /> {m.email}
                  </span>
                )}
                {m.telefone && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Phone size={11} /> {m.telefone}
                  </span>
                )}
                {m.cpf && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Hash size={11} /> {m.cpf}
                  </span>
                )}
                {(m.rua || m.bairro || m.cidade) && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3, flexBasis: "100%", marginTop: 2, fontSize: 11 }}>
                    <Car size={11} />
                    {[m.rua, m.numero ? `, ${m.numero}` : "", m.bairro ? ` – ${m.bairro}` : "", m.cidade ? `, ${m.cidade}` : "", m.uf ? `/${m.uf}` : ""].filter(Boolean).join("")}
                  </span>
                )}
                {m.placa && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Hash size={11} /> {m.placa}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => iniciarEdicao(m)}
                style={{
                  padding: "4px 8px", borderRadius: 4, border: "none",
                  background: C_val.esmeraldaLt, color: C_val.esmeralda,
                  fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                }}>
                <Pencil size={11} /> Editar
              </button>
              <button onClick={() => handleToggleAtivo(m)}
                style={{
                  padding: "4px 8px", borderRadius: 4, border: "none",
                  background: m.ativo ? C_val.ambarLt : C_val.verdeLt,
                  color: m.ativo ? C_val.ambar : C_val.verde,
                  fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 3,
                }}>
                {m.ativo ? <PowerOff size={11} /> : <Power size={11} />}
                {m.ativo ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
