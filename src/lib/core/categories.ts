export type Category = "LIMPIEZA" | "JARDINERIA" | "GASFITERIA" | "GAS" | "ELECTRICIDAD";
export type License = "SEC_GAS" | "SEC_ELECTRICA";

export type CategoryInfo = {
  label: string;
  pricing: "HOURLY" | "VISIT";
  minHours: number;
  urgentAllowed: boolean;
  requiredLicense?: License;
};

export const CATEGORIES: Record<Category, CategoryInfo> = {
  LIMPIEZA: { label: "Limpieza", pricing: "HOURLY", minHours: 2, urgentAllowed: false },
  JARDINERIA: { label: "Jardinería", pricing: "HOURLY", minHours: 2, urgentAllowed: false },
  GASFITERIA: { label: "Gasfitería", pricing: "VISIT", minHours: 1, urgentAllowed: true },
  GAS: { label: "Gas (SEC)", pricing: "VISIT", minHours: 1, urgentAllowed: true, requiredLicense: "SEC_GAS" },
  ELECTRICIDAD: { label: "Electricidad (SEC)", pricing: "VISIT", minHours: 1, urgentAllowed: true, requiredLicense: "SEC_ELECTRICA" },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && v in CATEGORIES;
}
