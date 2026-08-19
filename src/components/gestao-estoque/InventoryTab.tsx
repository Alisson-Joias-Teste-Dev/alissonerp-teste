"use client";

import React, { useState, useMemo } from "react";
import { TableRow } from "@/lib/gestao-estoque/types";
import { Calendar, ArrowDownRight, ArrowUpRight } from "lucide-react";

interface InventoryTabProps {
  data: TableRow[];
  loading: boolean;
  error?: string | null;
  tableName?: string;
}

const InventoryTab: React.FC<InventoryTabProps> = ({ data, loading, error, tableName }) => {
  // Define start date (default to 7 days ago) and end date (today)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const { entradas, saidas } = useMemo(() => {
    if (!data || data.length === 0) return { entradas: [], saidas: [] };

    // Comparacao por TEXTO (YYYY-MM-DD): datas do banco sao date-only; converter
    // pra Date misturava UTC com hora local de Fortaleza (UTC-3) e o PRIMEIRO
    // dia do periodo escolhido caia fora do filtro.
    const isDateInRange = (val: unknown) => {
      if (!val) return false;
      const dia = String(val).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}/.test(dia)) return false;
      return dia >= startDate && dia <= endDate;
    };

    const inItems: TableRow[] = [];
    const outItems: TableRow[] = [];

    // O QUE: reposicao (data_ultima_compra) = ENTRADA; venda (data_ultima_venda)
    // = SAIDA. O PORQUE: a heuristica generica antiga pegava a 1a coluna de data
    // e jogava a VENDA em Entradas — Saidas ficava 0 pra sempre (grave n2 do
    // pente-fino 18/08; a heuristica morta foi removida na leva 2).
    // IMPACTO se inverter: a tela volta a mostrar o movimento do estoque errado.
    data.forEach(row => {
      const compraVal = row['data_ultima_compra'] ?? row['ultima_compra'];
      if (compraVal && isDateInRange(compraVal)) inItems.push(row);
      if (row['data_ultima_venda'] && isDateInRange(row['data_ultima_venda'])) outItems.push(row);
    });

    return { entradas: inItems, saidas: outItems };
  }, [data, startDate, endDate]);

  const renderTable = (items: TableRow[]) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500 text-sm">
          Nenhum registro encontrado para este período.
        </div>
      );
    }

    const cols = Object.keys(items[0]).filter(k => !/id|uuid/i.test(k)).slice(0, 5);

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-creme-200 text-xs uppercase tracking-wider text-gray-600">
              {cols.map(col => (
                <th key={col} className="p-3 font-medium">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            {items.map((row, i) => (
              <tr key={i} className="border-b border-creme-200 hover:bg-white border border-creme-200 transition-colors">
                {cols.map(col => (
                  <td key={col} className="p-3 text-gray-700 truncate max-w-[150px]">
                    {/* ?? e nao ||: saldo/peso/preco 0 e valor real, nao ausencia */}
                    {String(row[col] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-alisson-gold"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <p>Erro ao carregar dados: {error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-creme-50">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-1">Movimentação de Estoque</h2>
          <p className="text-sm text-gray-600">Acompanhe entradas e saídas por período</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white border border-creme-200 p-2 rounded-xl border border-creme-200">
          <Calendar size={18} className="text-alisson-gold ml-2" />
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent border-none text-gray-900 focus:ring-0 text-sm cursor-pointer outline-none"
            />
            <span className="text-gray-500">até</span>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent border-none text-gray-900 focus:ring-0 text-sm cursor-pointer outline-none mr-2"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entradas */}
        <div className="bg-white border border-creme-200 border border-creme-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-creme-200 flex items-center justify-between bg-gradient-to-r from-green-900/20 to-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <ArrowDownRight size={20} className="text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">Entradas</h3>
            </div>
            <span className="text-2xl font-bold text-green-400">{entradas.length}</span>
          </div>
          <div className="p-0 flex-1 overflow-y-auto max-h-[600px]">
            {renderTable(entradas)}
          </div>
        </div>

        {/* Saídas */}
        <div className="bg-white border border-creme-200 border border-creme-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-5 border-b border-creme-200 flex items-center justify-between bg-gradient-to-r from-red-900/20 to-transparent">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <ArrowUpRight size={20} className="text-red-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">Saídas</h3>
            </div>
            <span className="text-2xl font-bold text-red-400">{saidas.length}</span>
          </div>
          <div className="p-0 flex-1 overflow-y-auto max-h-[600px]">
            {renderTable(saidas)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryTab;
