import { ref } from 'vue'

// Single global loading flag used for initial auth checks and route transitions
const isGlobalLoading = ref(true)

export function useGlobalLoading() {
  return { isGlobalLoading }
}

