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

    // Setup date boundaries for comparison (Local Time)
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);

    const isDateInRange = (val: any) => {
      if (!val) return false;
      const d = new Date(val);
      if (isNaN(d.getTime())) return false;
      return d >= start && d <= end;
    };

    const inItems: TableRow[] = [];
    const outItems: TableRow[] = [];

    const isSalesTable = tableName && /venda|pedido|order|saida/i.test(tableName);
    const isPurchaseTable = tableName && /compra|entrada|purchase/i.test(tableName);

    data.forEach(row => {
      // Find all columns that look like dates
      const dateCols = Object.keys(row).filter(k => {
        const val = row[k];
        if (!val || typeof val !== 'string') return false;
        // Check if it's a valid date string (e.g., ISO format or YYYY-MM-DD)
        return /^\d{4}-\d{2}-\d{2}/.test(val) || (!isNaN(Date.parse(val)) && val.length > 8 && (val.includes('-') || val.includes('/')));
      });

      if (dateCols.length === 0) return; // No dates found in this row

      // Try to identify specific date columns
      const createdCol = dateCols.find(k => /created|criado|data_entrada|inserted/i.test(k)) || dateCols[0];
      const updatedCol = dateCols.find(k => /updated|atualizado|data_saida|modified/i.test(k));

      const createdDate = createdCol ? row[createdCol] : null;
      const updatedDate = updatedCol ? row[updatedCol] : null;

      const createdInRange = createdDate && isDateInRange(createdDate);
      const updatedInRange = updatedDate && isDateInRange(updatedDate);
      const anyDateInRange = dateCols.some(c => isDateInRange(row[c]));

      // Try to identify status/type
      const typeCol = Object.keys(row).find(k => /tipo|type|status/i.test(k));
      const typeVal = typeCol ? String(row[typeCol]).toLowerCase() : '';
      const isExplicitSaida = typeVal.includes('said') || typeVal.includes('out') || typeVal.includes('venda') || typeVal.includes('vendido');
      const isExplicitEntrada = typeVal.includes('entrad') || typeVal.includes('in') || typeVal.includes('compra') || typeVal.includes('novo');

      if (isSalesTable) {
        if (anyDateInRange) outItems.push(row);
      } else if (isPurchaseTable) {
        if (anyDateInRange) inItems.push(row);
      } else {
        // Generic table (e.g., produtos)
        let addedToIn = false;
        let addedToOut = false;

        if (isExplicitSaida && anyDateInRange) {
          outItems.push(row);
          addedToOut = true;
        } else if (isExplicitEntrada && anyDateInRange) {
          inItems.push(row);
          addedToIn = true;
        } else {
          // If created in range, it's an entry
          if (createdInRange) {
            inItems.push(row);
            addedToIn = true;
          }
          // If updated in range AND it's not just the creation event, it's an exit/update
          if (updatedInRange && (!createdDate || updatedDate !== createdDate)) {
            outItems.push(row);
            addedToOut = true;
          }
        }

        // Fallback: If we still haven't classified it, but it has a date in range
        if (!addedToIn && !addedToOut && anyDateInRange) {
          // If the column name suggests an update, it's a saida, otherwise entrada
          const matchingCol = dateCols.find(c => isDateInRange(row[c]));
          if (matchingCol && /updated|atualizado|saida/i.test(matchingCol)) {
            outItems.push(row);
          } else {
            inItems.push(row);
          }
        }
      }
    });

    return { entradas: inItems, saidas: outItems };
  }, [data, startDate, endDate, tableName]);

  const renderTable = (items: TableRow[], type: 'in' | 'out') => {
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
                    {String(row[col] || '-')}
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
            {renderTable(entradas, 'in')}
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
            {renderTable(saidas, 'out')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InventoryTab;
