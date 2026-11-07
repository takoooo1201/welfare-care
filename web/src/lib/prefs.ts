// 只存在這支手機的偏好設定（大字模式等）。localStorage 可能不可用，一律包 try/catch。
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 無痕模式等情況下忽略 */
  }
}

export function isLargeText(): boolean {
  return readLocal('wc.largeText', false);
}

export function setLargeText(on: boolean): void {
  writeLocal('wc.largeText', on);
  applyTextSize();
}

export function applyTextSize(): void {
  document.documentElement.classList.toggle('large-text', isLargeText());
}
