"use client";

import { useEffect, useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { Button, Spinner, Toggle } from "@/components/ui";
import {
  CAMPOS_LABELS,
  CAMPOS_ORDER,
  ROLES_CONFIGURAVEIS,
  ROLE_LABELS,
  VISIBILIDADE_DEFAULT,
  type CampoVisivel,
  type ProdutoVisibilidadeConfig,
} from "@/lib/produto-visibilidade";

export default function TabProdutoVisibilidade() {
  const [config, setConfig] = useState<ProdutoVisibilidadeConfig>({ ...VISIBILIDADE_DEFAULT });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes/produto-visibilidade")
      .then((r) => r.json())
      .then((d) => setConfig(d.config ?? VISIBILIDADE_DEFAULT))
      .finally(() => setLoading(false));
  }, []);

  function toggle(role: string, campo: keyof CampoVisivel) {
    setConfig((prev) => ({
      ...prev,
      [role]: { ...(prev[role] ?? VISIBILIDADE_DEFAULT[role]), [campo]: !prev[role]?.[campo] },
    }));
    setSaved(false);
  }

  function resetRole(role: string) {
    setConfig((prev) => ({ ...prev, [role]: { ...VISIBILIDADE_DEFAULT[role] } }));
    setSaved(false);
  }

  async function salvar() {
    setSaving(true);
    try {
      await fetch("/api/configuracoes/produto-visibilidade", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={22} className="text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-800">Visibilidade de campos por role</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Roles admin, desenvolvedor e diretor sempre veem tudo. Marque o que cada role pode visualizar no drawer de produto.
          </p>
        </div>
        <Button variant="primary" size="sm" loading={saving} onClick={salvar}>
          {saved ? "Salvo!" : <><Save size={14} /> Salvar</>}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wider w-36 border-b border-gray-100">
                Role
              </th>
              {CAMPOS_ORDER.map((campo) => (
                <th key={campo} className="px-3 py-3 font-semibold text-gray-500 uppercase tracking-wider text-center border-b border-gray-100 min-w-[90px]">
                  {CAMPOS_LABELS[campo]}
                </th>
              ))}
              <th className="px-3 py-3 border-b border-gray-100 w-16" />
            </tr>
          </thead>
          <tbody>
            {ROLES_CONFIGURAVEIS.map((role, ri) => {
              const campos = config[role] ?? VISIBILIDADE_DEFAULT[role];
              return (
                <tr key={role} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="px-4 py-3 font-medium text-gray-700 border-b border-gray-50">
                    {ROLE_LABELS[role] ?? role}
                  </td>
                  {CAMPOS_ORDER.map((campo) => (
                    <td key={campo} className="px-3 py-3 text-center border-b border-gray-50">
                      <Toggle ativo={campos[campo]} onChange={() => toggle(role, campo)} />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center border-b border-gray-50">
                    <button
                      type="button"
                      onClick={() => resetRole(role)}
                      title="Resetar para padrão"
                      className="text-gray-400 hover:text-gray-600 transition"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400">
        As alterações entram em vigor imediatamente após salvar — sem necessidade de reiniciar o sistema.
      </p>
    </div>
  );
}
