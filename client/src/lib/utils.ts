import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Approximate fixed FX rates for consistent HKD-equivalent calculations
// (used for monthly spending, portfolio values, snapshots, etc.)
export const USD_TO_HKD = 7.8;
export const CNY_TO_HKD = 1.08; // 1 CNY ≈ 1.08 HKD (fixed approx for comparability)

export function toHkd(value: number, currency: string | null | undefined): number {
  const ccy = (currency || "HKD").toUpperCase();
  if (ccy === "USD") return value * USD_TO_HKD;
  if (ccy === "CNY") return value * CNY_TO_HKD;
  return value; // HKD and unknown currencies are treated as HKD
}
