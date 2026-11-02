import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Normalize display text without changing stored names or taxonomy values.
export function displayName(value?: string) {
  return (value || "")
    .replace(/\s*[·ㆍ]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
