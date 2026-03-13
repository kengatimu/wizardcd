import axios from 'axios'

/**
 * WizardCD API client
 * Base URL is configured via VITE_API_BASE_URL environment variable.
 * Falls back to localhost:8081 (runner-service-ms default port).
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8081',
  timeout: 30_000,
  headers: {
    Accept: 'application/json',
  },
})

// Response interceptor — normalize errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status  = error.response?.status
      const message = (error.response?.data as { message?: string } | undefined)?.message
        ?? error.message
        ?? 'An unexpected error occurred'

      // Log for telemetry in prod — replace with proper logger if needed
      console.error(`[WizardCD API] ${status ?? 'network'}: ${message}`)
    }
    return Promise.reject(error)
  },
)

export default apiClient
