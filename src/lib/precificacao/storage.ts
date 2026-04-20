import type { Category } from "@/types/precificacao";
import {
  DEFAULT_START_MKP,
  DEFAULT_START_COMMISSION,
  DEFAULT_PURCHASE_MIN,
  DEFAULT_PURCHASE_MAX,
  DEFAULT_PURCHASE_COMM_SPLIT,
  DEFAULT_GOLD_COST_PERCENTAGE,
  DEFAULT_RECEIVE_MIN,
  DEFAULT_RECEIVE_MAX,
  DEFAULT_CATEGORIES,
} from "./defaults";

const KEYS = {
  GOLD_PRICE: "alisson_gold_v17_react",
  START_MKP: "alisson_start_mkp_v17_react",
  START_COMMISSION: "alisson_start_comm_v17",
  CATEGORIES: "alisson_cats_v17_react",
  CLOUD_ID: "alisson_cloud_id_firebase",
  WEBHOOK_URL: "alisson_webhook_url_v1",
  PURCHASE_MIN: "alisson_purchase_min_v1",
  PURCHASE_MAX: "alisson_purchase_max_v1",
  PURCHASE_COMM_SPLIT: "alisson_purchase_comm_split_v1",
  GOLD_COST_PERCENTAGE: "alisson_gold_cost_pct_v1",
  RECEIVE_MIN: "alisson_receive_min_v1",
  RECEIVE_MAX: "alisson_receive_max_v1",
};

const safeLS = () => (typeof window !== "undefined" ? window.localStorage : null);

export const saveGoldPrice = (price: string) => safeLS()?.setItem(KEYS.GOLD_PRICE, price);
export const getGoldPrice = (): string => safeLS()?.getItem(KEYS.GOLD_PRICE) || "";

export const saveConfig = (
  startMkp: number,
  startCommission: number,
  categories: Category[],
  purchaseMin?: number,
  purchaseMax?: number,
  purchaseCommSplit?: number,
  goldCostPercentage?: number,
  receiveMin?: number,
  receiveMax?: number,
) => {
  const ls = safeLS();
  if (!ls) return false;
  try {
    ls.setItem(KEYS.START_MKP, startMkp.toString());
    ls.setItem(KEYS.START_COMMISSION, startCommission.toString());
    ls.setItem(KEYS.CATEGORIES, JSON.stringify(categories));
    if (purchaseMin !== undefined) ls.setItem(KEYS.PURCHASE_MIN, purchaseMin.toString());
    if (purchaseMax !== undefined) ls.setItem(KEYS.PURCHASE_MAX, purchaseMax.toString());
    if (purchaseCommSplit !== undefined) ls.setItem(KEYS.PURCHASE_COMM_SPLIT, purchaseCommSplit.toString());
    if (goldCostPercentage !== undefined) ls.setItem(KEYS.GOLD_COST_PERCENTAGE, goldCostPercentage.toString());
    if (receiveMin !== undefined) ls.setItem(KEYS.RECEIVE_MIN, receiveMin.toString());
    if (receiveMax !== undefined) ls.setItem(KEYS.RECEIVE_MAX, receiveMax.toString());
    return true;
  } catch (e) {
    console.error("Error saving to localStorage", e);
    return false;
  }
};

export const loadConfig = () => {
  const ls = safeLS();
  if (!ls) {
    return {
      startMkp: DEFAULT_START_MKP,
      startCommission: DEFAULT_START_COMMISSION,
      categories: DEFAULT_CATEGORIES,
      purchaseMin: DEFAULT_PURCHASE_MIN,
      purchaseMax: DEFAULT_PURCHASE_MAX,
      purchaseCommSplit: DEFAULT_PURCHASE_COMM_SPLIT,
      goldCostPercentage: DEFAULT_GOLD_COST_PERCENTAGE,
      receiveMin: DEFAULT_RECEIVE_MIN,
      receiveMax: DEFAULT_RECEIVE_MAX,
    };
  }

  const savedStart = ls.getItem(KEYS.START_MKP);
  const savedStartComm = ls.getItem(KEYS.START_COMMISSION);
  const savedCats = ls.getItem(KEYS.CATEGORIES);
  const savedMin = ls.getItem(KEYS.PURCHASE_MIN);
  const savedMax = ls.getItem(KEYS.PURCHASE_MAX);
  const savedSplit = ls.getItem(KEYS.PURCHASE_COMM_SPLIT);
  const savedGoldCost = ls.getItem(KEYS.GOLD_COST_PERCENTAGE);
  const savedReceiveMin = ls.getItem(KEYS.RECEIVE_MIN);
  const savedReceiveMax = ls.getItem(KEYS.RECEIVE_MAX);

  let startMkp = DEFAULT_START_MKP;
  let startCommission = DEFAULT_START_COMMISSION;
  let categories = DEFAULT_CATEGORIES;
  let purchaseMin = DEFAULT_PURCHASE_MIN;
  let purchaseMax = DEFAULT_PURCHASE_MAX;
  let purchaseCommSplit = DEFAULT_PURCHASE_COMM_SPLIT;
  let goldCostPercentage = DEFAULT_GOLD_COST_PERCENTAGE;
  let receiveMin = DEFAULT_RECEIVE_MIN;
  let receiveMax = DEFAULT_RECEIVE_MAX;

  const parseNum = (s: string | null, fallback: number) => {
    if (!s) return fallback;
    const p = parseFloat(s);
    return isNaN(p) ? fallback : p;
  };

  startMkp = parseNum(savedStart, startMkp);
  startCommission = parseNum(savedStartComm, startCommission);
  purchaseMin = parseNum(savedMin, purchaseMin);
  purchaseMax = parseNum(savedMax, purchaseMax);
  purchaseCommSplit = parseNum(savedSplit, purchaseCommSplit);
  goldCostPercentage = parseNum(savedGoldCost, goldCostPercentage);
  receiveMin = parseNum(savedReceiveMin, receiveMin);
  receiveMax = parseNum(savedReceiveMax, receiveMax);

  if (savedCats) {
    try {
      const parsed = JSON.parse(savedCats);
      if (Array.isArray(parsed) && parsed.length > 0) {
        categories = parsed.map((c: Category) => ({
          ...c,
          active: c.active !== undefined ? c.active : true,
          commVariation: c.commVariation !== undefined ? c.commVariation : 0,
          maxDiscount: c.maxDiscount !== undefined ? c.maxDiscount : 15,
        }));
      }
    } catch (e) {
      console.error("Failed to parse categories", e);
    }
  }

  return {
    startMkp,
    startCommission,
    categories,
    purchaseMin,
    purchaseMax,
    purchaseCommSplit,
    goldCostPercentage,
    receiveMin,
    receiveMax,
  };
};

export const saveCloudId = (id: string) => safeLS()?.setItem(KEYS.CLOUD_ID, id);
export const getCloudId = (): string => safeLS()?.getItem(KEYS.CLOUD_ID) || "";

export const saveWebhookUrl = (url: string) => safeLS()?.setItem(KEYS.WEBHOOK_URL, url);
export const getWebhookUrl = (): string =>
  safeLS()?.getItem(KEYS.WEBHOOK_URL) ||
  "https://etl.alissonranyel.com.br/webhook/d9cad8f1-3f9a-445e-a380-a3333ba7b3fe";

// Re-export defaults for convenience
export {
  DEFAULT_START_MKP,
  DEFAULT_START_COMMISSION,
  DEFAULT_PURCHASE_MIN,
  DEFAULT_PURCHASE_MAX,
  DEFAULT_PURCHASE_COMM_SPLIT,
  DEFAULT_GOLD_COST_PERCENTAGE,
  DEFAULT_RECEIVE_MIN,
  DEFAULT_RECEIVE_MAX,
  DEFAULT_CATEGORIES,
};
