import { useState, useEffect } from 'react'
import {
  Wifi, WifiOff, Loader2, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import axios from 'axios'
import SectionCard from '../components/SectionCard'
import ToggleSwitch from '../components/ToggleSwitch'

// ── Persisted settings shape ──────────────────────────────────────

interface WizardSettings {
  apiUrl:               string
  dashboardRefreshRate: string
  showLifecycleStatus:  boolean
  showExecutionStatus:  boolean
  logTailLines:         string
  logAutoScroll:        boolean
  toastPosition:        string
}

const DEFAULTS: WizardSettings = {
  apiUrl:               'http://localhost:8081',
  dashboardRefreshRate: '5000',
  showLifecycleStatus:  true,
  showExecutionStatus:  true,
  logTailLines:         '200',
  logAutoScroll:        true,
  toastPosition:        'bottom-right',
}

function loadSettings(): WizardSettings {
  try {
    const raw = localStorage.getItem('wiz-settings')
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<WizardSettings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// ── Connection status ─────────────────────────────────────────────

interface ConnStatus {
  ok:  boolean
  ms:  number
}

// ── Preference row ────────────────────────────────────────────────

interface PrefRowProps {
  label:    string
  hint?:    string
  children: React.ReactNode
  border?:  boolean
}

function PrefRow({ label, hint, children, border = true }: PrefRowProps) {
  return (
    <div className={clsx(
      'flex items-center justify-between gap-4 px-4 py-3',
      border && 'border-b border-wiz-border/20 last:border-b-0',
    )}>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium text-wiz-cream">{label}</span>
        {hint && <span className="text-xs text-wiz-muted/50">{hint}</span>}
      </div>
      <div className="flex-shrink-0">
        {children}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<WizardSettings>(loadSettings)
  const [connStatus, setConnStatus]   = useState<ConnStatus | null>(null)
  const [testing, setTesting]         = useState(false)

  // Auto-persist to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem('wiz-settings', JSON.stringify(settings))
  }, [settings])

  const set = <K extends keyof WizardSettings>(key: K, value: WizardSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }))

  // Test the API connection
  const handleTest = async () => {
    setTesting(true)
    setConnStatus(null)
    try {
      const start = Date.now()
      await axios.get(`${settings.apiUrl}/jobs/summary`, { timeout: 5000 })
      setConnStatus({ ok: true, ms: Date.now() - start })
    } catch {
      setConnStatus({ ok: false, ms: 0 })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl animate-fade-in">

      {/* ── Page Title ── */}
      <div>
        <h1 className="text-2xl font-bold text-wiz-cream">Settings</h1>
        <p className="text-xs text-wiz-muted/50 mt-1">
          Configure WizardCD control plane behaviour and preferences.
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 1 — API CONNECTION
          ══════════════════════════════════════════════════════════════ */}

      <SectionCard
        title="API Connection"
        accent="gold"
      >
        <p className="text-xs text-wiz-muted/50 -mt-2 mb-3">
          Base URL for the WizardCD runner service REST API.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <label className="block text-xs font-medium text-wiz-gray mb-1.5">
                Runner API URL
              </label>
              <input
                type="url"
                value={settings.apiUrl}
                onChange={(e) => set('apiUrl', e.target.value)}
                placeholder="http://localhost:8081"
                className="wiz-input"
              />
              <p className="text-xs text-wiz-muted/50 mt-1.5">
                All API requests are sent to this endpoint.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing}
              className="btn-secondary gap-2 flex-shrink-0 mt-6"
            >
              {testing
                ? <Loader2 size={13} className="animate-spin" />
                : <RefreshCw size={13} />
              }
              {testing ? 'Testing…' : 'Test'}
            </button>
          </div>

          {/* Connection status */}
          {connStatus !== null && (
            <div className={clsx(
              'flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium',
              'border transition-all duration-200',
              connStatus.ok
                ? 'bg-sig-green-dim border-sig-green/20 text-sig-green'
                : 'bg-sig-red-dim  border-sig-red/20  text-sig-red',
            )}>
              {connStatus.ok
                ? <Wifi    size={14} />
                : <WifiOff size={14} />
              }
              {connStatus.ok
                ? `Connected — ${connStatus.ms}ms response`
                : 'Connection failed — check runner service is running'
              }
            </div>
          )}
        </div>
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 2 — PREFERENCES
          ══════════════════════════════════════════════════════════════ */}

      <SectionCard
        title="Preferences"
      >
        <p className="text-xs text-wiz-muted/50 -mt-2 mb-4">
          Customise the dashboard, log viewer, and notification behaviour.
        </p>

        <div className="flex flex-col gap-4">

          {/* ── Dashboard inner panel (sig-green) ── */}
          <div className="rounded-lg border border-wiz-border-mid border-l-[3px] border-l-sig-green/60 border-r-wiz-border-strong overflow-hidden">
            <div className="px-4 py-2.5 border-b border-wiz-border/40 bg-sig-green/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sig-green flex-shrink-0" />
              <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-sig-green">Dashboard</span>
            </div>
            <div>
              <PrefRow label="Auto-refresh Rate" hint="How often the jobs list polls for updates">
                <select
                  value={settings.dashboardRefreshRate}
                  onChange={(e) => set('dashboardRefreshRate', e.target.value)}
                  className="wiz-select text-xs w-36"
                >
                  <option value="2000">2 seconds</option>
                  <option value="5000">5 seconds</option>
                  <option value="10000">10 seconds</option>
                  <option value="30000">30 seconds</option>
                  <option value="0">Off</option>
                </select>
              </PrefRow>

              <PrefRow label="Lifecycle Status Column" hint="Show control-plane lifecycle state in job table">
                <ToggleSwitch
                  checked={settings.showLifecycleStatus}
                  onChange={(v) => set('showLifecycleStatus', v)}
                />
              </PrefRow>

              <PrefRow label="Execution Status Column" hint="Show execution-plane snapshot state in job table" border={false}>
                <ToggleSwitch
                  checked={settings.showExecutionStatus}
                  onChange={(v) => set('showExecutionStatus', v)}
                />
              </PrefRow>
            </div>
          </div>

          {/* ── Log Viewer inner panel (sig-blue) ── */}
          <div className="rounded-lg border border-wiz-border-mid border-l-[3px] border-l-sig-blue/60 border-r-wiz-border-strong overflow-hidden">
            <div className="px-4 py-2.5 border-b border-wiz-border/40 bg-sig-blue/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sig-blue flex-shrink-0" />
              <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-sig-blue">Log Viewer</span>
            </div>
            <div>
              <PrefRow label="Default Tail Lines" hint="Number of log lines fetched per request">
                <select
                  value={settings.logTailLines}
                  onChange={(e) => set('logTailLines', e.target.value)}
                  className="wiz-select text-xs w-36"
                >
                  <option value="50">50 lines</option>
                  <option value="100">100 lines</option>
                  <option value="200">200 lines</option>
                  <option value="500">500 lines</option>
                  <option value="1000">1,000 lines</option>
                </select>
              </PrefRow>

              <PrefRow label="Auto-scroll to Latest" hint="Scroll to bottom when new log lines arrive" border={false}>
                <ToggleSwitch
                  checked={settings.logAutoScroll}
                  onChange={(v) => set('logAutoScroll', v)}
                />
              </PrefRow>
            </div>
          </div>

          {/* ── Notifications inner panel (wiz-gold) ── */}
          <div className="rounded-lg border border-wiz-border-mid border-l-[3px] border-l-wiz-gold/60 border-r-wiz-border-strong overflow-hidden">
            <div className="px-4 py-2.5 border-b border-wiz-border/40 bg-wiz-gold/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold flex-shrink-0" />
              <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-wiz-gold">Notifications</span>
            </div>
            <div>
              <PrefRow label="Toast Position" hint="Where deployment notifications appear on screen" border={false}>
                <select
                  value={settings.toastPosition}
                  onChange={(e) => set('toastPosition', e.target.value)}
                  className="wiz-select text-xs w-36"
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="top-left">Top Left</option>
                  <option value="top-center">Top Center</option>
                  <option value="bottom-center">Bottom Center</option>
                </select>
              </PrefRow>
            </div>
          </div>

        </div>
      </SectionCard>

      {/* ══════════════════════════════════════════════════════════════
          ABOUT (compact footer row)
          ══════════════════════════════════════════════════════════════ */}

      <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-wiz-border/40 bg-wiz-surface/30">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden border border-wiz-border bg-wiz-bg">
          <img
            src="/wizardCD-logo.png"
            alt="WizardCD"
            className="w-full h-full object-contain p-0.5"
            style={{ objectPosition: 'left center' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-wiz-cream">
            Wizard<span className="text-wiz-gold">CD</span>
            <span className="text-2xs font-normal text-wiz-muted ml-2">v1.0.0</span>
          </p>
          <p className="text-2xs text-wiz-muted/50">
            One Config. One Command. Continuous Magic.
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-2xs text-wiz-muted/50">Engineered By Bytes Ltd</p>
          <p className="text-2xs text-wiz-muted/40">wizardcd.com</p>
        </div>
      </div>

      <div className="h-2" />
    </div>
  )
}
