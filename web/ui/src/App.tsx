import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './layouts/Layout'
import DashboardPage from './pages/DashboardPage'
import DeployPage from './pages/DeployPage'
import JobDetailPage from './pages/JobDetailPage'
import SettingsPage from './pages/SettingsPage'
import ActivityPage from './pages/ActivityPage'
import PlatformHealthPage from './pages/PlatformHealthPage'
export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* All routes use Layout */}
          <Route path="/"              element={<Layout><DashboardPage /></Layout>} />
          <Route path="/activity"      element={<Layout><ActivityPage /></Layout>} />
          <Route path="/health"        element={<Layout><PlatformHealthPage /></Layout>} />
          <Route path="/deploy"        element={<Layout><DeployPage /></Layout>} />
          <Route path="/jobs/:jobId"   element={<Layout><JobDetailPage /></Layout>} />
          <Route path="/settings"      element={<Layout><SettingsPage /></Layout>} />
          <Route path="*"              element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
