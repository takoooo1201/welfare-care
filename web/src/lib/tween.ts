// 數字變化時用短動畫跳到新的值（例如「很可能符合 2 → 6 項」）。
import { onBeforeUnmount, ref, watch } from 'vue';

export function useTween(source: () => number, ms = 600) {
  const shown = ref(source());
  let frame = 0;
  watch(source, (to) => {
    cancelAnimationFrame(frame);
    const from = shown.value;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      shown.value = to;
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      shown.value = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  });
  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return shown;
}

export const money = (n: number): string => n.toLocaleString('zh-TW');
