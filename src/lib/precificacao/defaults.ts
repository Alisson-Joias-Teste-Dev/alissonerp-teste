import type { Category } from "@/types/precificacao";

export const DEFAULT_START_MKP = 5.0;
export const DEFAULT_START_COMMISSION = 5.0;
export const DEFAULT_PURCHASE_MIN = 40.0;
export const DEFAULT_PURCHASE_MAX = 60.0;
export const DEFAULT_PURCHASE_COMM_SPLIT = 50.0;
export const DEFAULT_GOLD_COST_PERCENTAGE = 100.0;
export const DEFAULT_RECEIVE_MIN = 95.0;
export const DEFAULT_RECEIVE_MAX = 100.0;

export const DEFAULT_CATEGORIES: Category[] = [
  // Leves
  { id: 1, name: "Leves 1", maxWeight: 0.5, variation: 0.0, commVariation: 0.0, maxDiscount: 5, color: "text-slate-600", active: true },
  { id: 2, name: "Leves 2", maxWeight: 1.0, variation: 1.7, commVariation: 2.2, maxDiscount: 5, color: "text-slate-600", active: true },
  { id: 3, name: "Leves 3", maxWeight: 2.0, variation: 0.85, commVariation: 0.88, maxDiscount: 10, color: "text-slate-600", active: true },
  { id: 4, name: "Leves 4", maxWeight: 3.0, variation: 0.49, commVariation: 0.73, maxDiscount: 10, color: "text-slate-600", active: true },
  { id: 5, name: "Leves 5", maxWeight: 4.0, variation: 0.38, commVariation: 0.1, maxDiscount: 10, color: "text-slate-600", active: true },
  // Médias
  { id: 6, name: "Médias 1", maxWeight: 6.0, variation: 0.185, commVariation: 0.1, maxDiscount: 20, color: "text-blue-600", active: true },
  { id: 7, name: "Médias 2", maxWeight: 8.0, variation: 0.1, commVariation: 0.09, maxDiscount: 20, color: "text-blue-600", active: true },
  { id: 8, name: "Médias 3", maxWeight: 10.0, variation: 0.1, commVariation: 0.1, maxDiscount: 20, color: "text-blue-600", active: true },
  // Pesadas
  { id: 9, name: "Pesadas 1", maxWeight: 15.0, variation: 0.097, commVariation: 0.1, maxDiscount: 50, color: "text-indigo-600", active: true },
  { id: 10, name: "Pesadas 2", maxWeight: 20.0, variation: 0.098, commVariation: 0.1, maxDiscount: 50, color: "text-indigo-600", active: true },
  { id: 11, name: "Pesadas 3", maxWeight: 30.0, variation: 0.0, commVariation: 0.2, maxDiscount: 100, color: "text-indigo-600", active: true },
  { id: 12, name: "Pesadas 4", maxWeight: 60.0, variation: 0.0, commVariation: 0.2, maxDiscount: 300, color: "text-indigo-600", active: true },
  { id: 13, name: "Pesadas 5", maxWeight: 100.0, variation: 0.0, commVariation: 0.2, maxDiscount: 400, color: "text-indigo-600", active: true },
];
