import { inject } from 'vue';

export interface ToastOptions {
  /** 粗體標題（通知用） */
  title?: string;
  /** 點擊提示後前往的頁面 */
  link?: string;
}

export type ShowToast = (message: string, opts?: ToastOptions) => void;

export function useToast(): ShowToast {
  return inject<ShowToast>('toast', () => {});
}
