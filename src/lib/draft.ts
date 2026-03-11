/**
 * Draft persistence for CRM forms. Saves to sessionStorage so that when users
 * navigate back (browser back or Back button), their filled data is restored.
 */

const PREFIX = "crm-draft-";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function getDraft<T = Record<string, unknown>>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw) as { data: T; savedAt: number };
    if (Date.now() - savedAt > TTL_MS) {
      sessionStorage.removeItem(PREFIX + key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, data: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      PREFIX + key,
      JSON.stringify({ data, savedAt: Date.now() })
    );
  } catch {
    // ignore quota or parse errors
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
