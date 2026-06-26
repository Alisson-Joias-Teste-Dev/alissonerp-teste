"use client";

import React, { useEffect } from "react";
import { ShieldCheck, X, Unlock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Adaptado para o ERP: não pede senha manual. Autoriza se o usuário logado
 * tiver role admin/desenvolvedor/gerente_loja/gerente_fabrica.
 */
const ALLOWED_ROLES = new Set(["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"]);

const SecurityModal: React.FC<SecurityModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { role, nome } = useAuth();
  const autorizado = role ? ALLOWED_ROLES.has(role) : false;

  useEffect(() => {
    if (!isOpen) return;
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white border border-creme-200 rounded-2xl shadow-2xl p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors">
          <X size={20} />
        </button>

        <div className="flex flex-col items-center mb-6">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors duration-500 ${
              autorizado ? "bg-alisson-gold/10 text-alisson-gold" : "bg-red-100 text-red-500"
            }`}
          >
            {autorizado ? <ShieldCheck size={32} /> : <ShieldAlert size={32} />}
          </div>
          <h2 className="text-xl font-serif font-bold text-gray-900 tracking-wide">Acesso Restrito</h2>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">
            {autorizado ? `Autorizado: ${nome ?? ""}` : "Perfil sem permissão"}
          </p>
        </div>

        <div className="space-y-3">
          {!autorizado ? (
            <p className="text-center text-sm text-red-600">
              Apenas <strong>Admin</strong>, <strong>Desenvolvedor</strong> ou <strong>Gerentes</strong> podem executar esta ação.
            </p>
          ) : (
            <p className="text-center text-sm text-gray-600">
              Você está logado como <span className="font-semibold text-alisson-gold">{role}</span>. Confirme para continuar.
            </p>
          )}

          <button
            onClick={onConfirm}
            disabled={!autorizado}
            className="w-full bg-alisson-gold text-white font-bold py-3 rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Unlock size={18} />
            {autorizado ? "AUTORIZAR" : "BLOQUEADO"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecurityModal;
