"use client";

import { useState, useEffect } from "react";

const PREFIX = "crm-view-";

/**
 * Persists and restores page view state so when the user navigates back,
 * they return to where they left off (e.g. selected brand/category, filters, tab).
 */
export function usePageView<T extends Record<string, unknown>>(
  key: string,
  defaultState: T
): [T, (state: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultState;
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (!raw) return defaultState;
      const parsed = JSON.parse(raw) as T;
      return typeof parsed === "object" && parsed !== null ? { ...defaultState, ...parsed } : defaultState;
    } catch {
      return defaultState;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [key, state]);

  return [state, setState];
}
