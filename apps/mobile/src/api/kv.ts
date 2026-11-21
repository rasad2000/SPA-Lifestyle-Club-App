/**
 * Tiny synchronous key-value store (native): expo-sqlite/kv-store.
 * Sync reads matter here — the first render can show the cached feed with no
 * loading flash. Web uses kv.web.ts (localStorage) because expo-sqlite's web
 * build needs WASM + COOP/COEP headers the plain feed server doesn't send.
 */
import Storage from 'expo-sqlite/kv-store';

export function kvGet(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function kvSet(key: string, value: string): void {
  // Async write: never block the JS thread on persistence.
  Storage.setItem(key, value).catch(() => {});
}
