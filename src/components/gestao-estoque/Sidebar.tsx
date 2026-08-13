"use client";

import React from "react";
import { LayoutDashboard, Grid, Layers, Sparkles } from "lucide-react";
import { ViewMode } from "@/lib/gestao-estoque/types";

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onToggleAI: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, onToggleAI }) => {
  return (
    <div className="w-72 shrink-0 border-r border-creme-200 bg-white flex flex-col">
      {/* Brand Header */}
      <div className="pt-6 pb-5 px-5 border-b border-creme-200">
        <h1 className="text-2xl font-serif font-bold text-alisson-gold tracking-wide">ALISSON</h1>
        <div className="flex items-center gap-2 mt-1 opacity-70">
          <div className="h-[1px] w-6 bg-alisson-gold"></div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Gestão de Estoque</p>
        </div>
      </div>

      {/* AI Button */}
      <div className="px-5 mt-5 mb-5">
        <button
          onClick={onToggleAI}
          className="w-full group rounded-xl p-[1px] bg-gradient-to-r from-alisson-gold via-emerald-300 to-alisson-gold"
        >
          <div className="bg-white rounded-xl p-3 flex items-center justify-center gap-2 group-hover:bg-creme-50 transition-colors">
            <Sparkles size={16} className="text-alisson-gold animate-pulse" />
            <span className="text-xs font-bold text-alisson-gold uppercase tracking-widest">
              Alisson AI
            </span>
          </div>
        </button>
      </div>

      {/* View Mode */}
      <div className="px-5 mb-6">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-2">
          Modo de Visualização
        </p>
        <div className="grid grid-cols-3 p-1 bg-creme-50 rounded-xl border border-creme-200">
          <button
            onClick={() => onViewChange("grid")}
            className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all ${
              currentView === "grid"
                ? "bg-alisson-gold text-white shadow-md"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Grid size={14} />
            Grade
          </button>
          <button
            onClick={() => onViewChange("dashboard")}
            className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all ${
              currentView === "dashboard"
                ? "bg-alisson-gold text-white shadow-md"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <LayoutDashboard size={14} />
            Análises
          </button>
          <button
            onClick={() => onViewChange("inventory")}
            className={`flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-all ${
              currentView === "inventory"
                ? "bg-alisson-gold text-white shadow-md"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            <Layers size={14} />
            Estoque
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="mt-auto px-5 pb-5 pt-4 border-t border-creme-200">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">
          Fonte de dados
        </p>
        <p className="text-xs text-gray-700 mt-1 font-mono">public.produtos</p>
      </div>
    </div>
  );
};

export default Sidebar;
