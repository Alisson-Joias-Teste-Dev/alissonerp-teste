import type { Category, CalculatedCategory } from "@/types/precificacao";

export const prepareCategories = (
  categories: Category[],
  startMkp: number,
  startCommission: number,
): CalculatedCategory[] => {
  const activeCats = categories.filter((c) => c.active !== false);
  const sorted = [...activeCats].sort((a, b) => a.maxWeight - b.maxWeight);

  let currentMkp = startMkp;
  let currentComm = startCommission;

  return sorted.map((cat) => {
    let targetMkp = parseFloat((currentMkp - cat.variation).toFixed(3));
    if (targetMkp < 1.0) targetMkp = 1.0;
    currentMkp = targetMkp;

    let targetComm = parseFloat(
      (currentComm - (cat.commVariation || 0)).toFixed(2),
    );
    if (targetComm < 0) targetComm = 0;
    currentComm = targetComm;

    return { ...cat, targetMkp, targetCommission: targetComm };
  });
};

export const getPricingFactors = (
  weight: number,
  startMkp: number,
  startCommission: number,
  categories: Category[],
) => {
  if (weight <= 0.1) return { mkp: startMkp, commission: startCommission };

  const sortedCats = prepareCategories(categories, startMkp, startCommission);

  let prevW = 0.1;
  let prevMkp = startMkp;
  let prevComm = startCommission;

  for (let i = 0; i < sortedCats.length; i++) {
    const cat = sortedCats[i];
    const limitW = cat.maxWeight;
    const targetMkp = cat.targetMkp;
    const targetComm = cat.targetCommission;

    if (weight <= limitW) {
      const rangeSize = limitW - prevW;
      if (rangeSize <= 0)
        return { mkp: targetMkp, commission: targetComm };

      const progress = (weight - prevW) / rangeSize;

      const mkpDiff = prevMkp - targetMkp;
      const calculatedMkp = prevMkp - mkpDiff * progress;

      const commDiff = prevComm - targetComm;
      const calculatedComm = prevComm - commDiff * progress;

      return {
        mkp: parseFloat(calculatedMkp.toFixed(4)),
        commission: parseFloat(calculatedComm.toFixed(2)),
      };
    }

    prevW = limitW;
    prevMkp = targetMkp;
    prevComm = targetComm;
  }

  if (sortedCats.length > 0) {
    const last = sortedCats[sortedCats.length - 1];
    return { mkp: last.targetMkp, commission: last.targetCommission };
  }

  return { mkp: startMkp, commission: startCommission };
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const getMkpForWeight = (
  weight: number,
  startMkp: number,
  categories: Category[],
): number => {
  return getPricingFactors(weight, startMkp, 0, categories).mkp;
};
