"use client";

import React, { useState, useEffect } from "react";
import {
  Upload, Download, Check, Loader2, AlertCircle, Database, Server,
  Clock, ChevronRight, ArrowLeft, Calendar, Tag,
} from "lucide-react";
import { Modal } from "./ui/Modal";
import {
  saveConfigAction,
  fetchConfigAction,
  fetchBackupsAction,
} from "@/app/(dashboard)/actions-precificacao";
import type { AppConfig, Category, BackupRecord } from "@/types/precificacao";

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: {
    startMkp: number;
    startCommission: number;
    categories: Category[];
    goldPrice: string;
    purchaseMin: number;
    purchaseMax: number;
    purchaseCommSplit?: number;
    goldCostPercentage?: number;
    receiveMin?: number;
    receiveMax?: number;
  };
  onLoadConfig: (config: AppConfig) => void;
  onShowToast: (msg: string, type: "success" | "error" | "info") => void;
}

const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onLoadConfig,
  onShowToast,
}) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const [viewMode, setViewMode] = useState<"menu" | "select_backup">("menu");
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [versionLabel, setVersionLabel] = useState("");

  useEffect(() => {
    if (isOpen) {
      setStatus("idle");
      setErrorMessage("");
      setViewMode("menu");
      setBackups([]);
      setVersionLabel("");
    }
  }, [isOpen]);

  const handleSaveToCloud = async () => {
    setLoading(true);
    setStatus("idle");
    setErrorMessage("");

    try {
      const configToSave: AppConfig = {
        ...currentConfig,
        lastUpdated: new Date().toISOString(),
      };

      await saveConfigAction(configToSave, versionLabel || undefined);

      setStatus("success");
      onShowToast("Nova versão salva no histórico!", "success");
      setVersionLabel("");
    } catch (error: unknown) {
      console.error(error);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  const handleListBackups = async () => {
    setLoading(true);
    setStatus("idle");
    setErrorMessage("");

    try {
      const list = await fetchBackupsAction();
      setBackups(list);
      setViewMode("select_backup");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Erro desconhecido");
      onShowToast("Erro ao listar backups", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSpecificBackup = async (id: string) => {
    setLoading(true);
    try {
      const config = await fetchConfigAction(id);
      if (config) {
        onLoadConfig(config);
        onShowToast("Versão carregada com sucesso!", "success");
        onClose();
      } else {
        onShowToast("Configuração vazia ou não encontrada.", "error");
      }
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : "Erro desconhecido");
      onShowToast("Erro ao restaurar versão", "error");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={viewMode === "select_backup" ? "md" : "sm"}>
      <div className="text-left">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3 relative">
          {viewMode === "select_backup" && (
            <button
              onClick={() => setViewMode("menu")}
              className="absolute -left-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
          )}

          <div className={`p-2 bg-emerald-50 rounded-lg text-emerald-600 ${viewMode === "select_backup" ? "ml-8" : ""}`}>
            {viewMode === "select_backup" ? <Clock size={20} /> : <Database size={20} />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              {viewMode === "select_backup" ? "Histórico de Versões" : "Backup em Nuvem"}
            </h3>
            <p className="text-[10px] text-slate-500">
              {viewMode === "select_backup" ? "Selecione para restaurar" : "Salva novo registro sem sobrescrever"}
            </p>
          </div>
        </div>

        {viewMode === "menu" && (
          <>
            <div className="space-y-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center gap-2">
                <Server size={24} className="text-slate-300" />
                <p className="text-xs text-slate-500">
                  Cria um novo ponto de restauração no histórico.
                </p>
              </div>

              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                  <Tag size={10} /> Nome desta Versão (Opcional)
                </label>
                <input
                  type="text"
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  placeholder="Ex: Ajuste de Março, Promoção Dia das Mães..."
                  className="w-full text-sm bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 outline-none focus:border-emerald-400 focus:bg-white transition-all text-slate-700"
                  autoFocus
                />
              </div>

              {status === "success" && (
                <div className="bg-emerald-50 p-2 rounded border border-emerald-100 flex items-center justify-center gap-2 animate-[fadeIn_0.3s_ease-out]">
                  <Check size={12} className="text-emerald-500" />
                  <span className="text-[10px] text-emerald-700 font-bold">
                    Backup salvo com sucesso!
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleSaveToCloud}
                disabled={loading}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                <span className="text-[10px] font-bold uppercase">Salvar Versão</span>
              </button>

              <button
                onClick={handleListBackups}
                disabled={loading}
                className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                <span className="text-[10px] font-bold uppercase">Ver Histórico</span>
              </button>
            </div>
          </>
        )}

        {viewMode === "select_backup" && (
          <div className="animate-[fadeIn_0.3s_ease-out]">
            <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Últimos 100 Backups</p>

            <div className="max-h-[350px] overflow-y-auto custom-scroll space-y-2 pr-1">
              {backups.length === 0 ? (
                <div className="text-center py-8 text-slate-400">Nenhum backup encontrado.</div>
              ) : (
                backups.map((backup, index) => (
                  <button
                    key={backup.id}
                    onClick={() => handleLoadSpecificBackup(backup.id)}
                    disabled={loading}
                    className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50/50 transition-all group text-left"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div
                        className={`p-2 rounded-full shrink-0 ${
                          index === 0 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <Calendar size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">
                          {backup.label ? (
                            backup.label
                          ) : (
                            <span className="text-slate-400 italic">Sem nome</span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {formatDate(backup.updated_at)}
                        </p>
                      </div>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600 shrink-0 ml-2">
                      {loading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {status === "error" && errorMessage && (
          <div className="mt-4 p-2 bg-red-50 text-red-600 text-[10px] rounded flex items-center gap-2 break-all justify-center text-center">
            <AlertCircle size={12} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SyncModal;
