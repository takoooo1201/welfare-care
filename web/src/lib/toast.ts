import { inject } from 'vue';

export function useToast(): (message: string) => void {
  return inject<(message: string) => void>('toast', () => {});
}
