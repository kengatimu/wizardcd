import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './layouts/Layout'
import DashboardPage from './pages/DashboardPage'
import DeployPage from './pages/DeployPage'
import JobDetailPage from './pages/JobDetailPage'
import ApplicationPage from './pages/ApplicationPage'
import SettingsPage from './pages/SettingsPage'
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* All routes use Layout */}
          <Route path="/"              element={<Layout><DashboardPage /></Layout>} />
          <Route path="/deploy"        element={<Layout><DeployPage /></Layout>} />
          <Route path="/jobs/:jobId"   element={<Layout><JobDetailPage /></Layout>} />
          <Route path="/apps/:appName" element={<Layout><ApplicationPage /></Layout>} />
          <Route path="/settings"      element={<Layout><SettingsPage /></Layout>} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
