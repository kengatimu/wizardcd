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
          className: 'wiz-toast',
          success: {
            iconTheme: { primary: '#16A34A', secondary: '#ECFDF5' },
          },
          error: {
            iconTheme: { primary: '#DC2626', secondary: '#FEF2F2' },
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
)
