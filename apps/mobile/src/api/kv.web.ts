/** Web key-value store: localStorage (see kv.ts for why not expo-sqlite here). */
export function kvGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null; // private mode / blocked storage
  }
}

export function kvSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // quota exceeded / blocked: the cache is a convenience, never required
  }
}
