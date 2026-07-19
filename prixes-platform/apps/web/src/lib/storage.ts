/**
 * localStorage utilities with corruption detection and recovery.
 * Protects against cases where a tab crashes mid-write or becomes unavailable.
 */
import { logWarn } from "./logger";

const CORRUPTION_PREFIX = "__corrupt_";

export function getStorageItem(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return null;
    // Check if the value is valid UTF-8 (corrupted values often decode to invalid char sequences)
    try {
      new TextEncoder().encode(value);
      return value;
    } catch {
      logWarn("storage", `Corrupted localStorage key: ${key}, removing`);
      localStorage.removeItem(key);
      return null;
    }
  } catch (e) {
    logWarn("storage", `Failed to read localStorage.${key}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function setStorageItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    // Verify write succeeded by reading back
    const read = localStorage.getItem(key);
    if (read !== value) {
      logWarn("storage", `Failed to write localStorage.${key}: read-back mismatch`);
      return false;
    }
    // Clean up any previous corruption markers
    localStorage.removeItem(CORRUPTION_PREFIX + key);
    return true;
  } catch (e) {
    logWarn("storage", `Failed to write localStorage.${key}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export function removeStorageItem(key: string): void {
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(CORRUPTION_PREFIX + key);
  } catch (e) {
    logWarn("storage", `Failed to remove localStorage.${key}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
