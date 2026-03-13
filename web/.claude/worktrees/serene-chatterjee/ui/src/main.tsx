import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './styles/globals.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1_000 * 10,      // 10 seconds
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#111827',
            color: '#E8DCCA',
            border: '1px solid #243452',
            borderRadius: '8px',
            fontSize: '13px',
            fontFamily: 'Inter, system-ui, sans-serif',
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.50)',
          },
          success: {
            iconTheme: { primary: '#22C55E', secondary: '#071A10' },
            style: { borderColor: 'rgba(34,197,94,0.25)' },
          },
          error: {
            iconTheme: { primary: '#EF4444', secondary: '#1E0909' },
            style: { borderColor: 'rgba(239,68,68,0.25)' },
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
)
