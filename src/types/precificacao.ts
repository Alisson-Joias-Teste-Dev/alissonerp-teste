export interface Category {
  id: number;
  name: string;
  maxWeight: number;
  variation: number;
  commVariation: number;
  maxDiscount: number;
  color: string;
  active?: boolean;
}

export interface CalculatedCategory extends Category {
  targetMkp: number;
  targetCommission: number;
}

export interface PricingResult {
  mkp: number;
  commissionPercent: number;
  commissionValue: number;
  basePrice: number;
  finalPrice: number;
  pricePerGram: number;
  discountAmount: number;
  categoryName: string;
  categoryColor: string;
}

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

export interface AppConfig {
  startMkp: number;
  startCommission: number;
  categories: Category[];
  goldPrice?: string;
  lastUpdated?: string;
  purchaseMin?: number;
  purchaseMax?: number;
  purchaseCommSplit?: number;
  goldCostPercentage?: number;
  receiveMin?: number;
  receiveMax?: number;
}

export interface BackupRecord {
  id: string;
  updated_at: string;
  label?: string | null;
}
