import { useState, useEffect } from 'react'
import {
  Wifi, WifiOff, Save, Loader2, RefreshCw, Check,
  FlaskConical, ShieldCheck, Rocket,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import axios from 'axios'
import SectionCard from '../components/SectionCard'
import { SelectField } from '../components/FormField'
import ToggleSwitch from '../components/ToggleSwitch'
import { useTheme, type ActiveEnv } from '../context/ThemeContext'

// ── Environment metadata ──────────────────────────────────────────

const ENV_META = {
  SIT: {
    label:       'SIT',
    full:        'System Integration Testing',
    icon:        FlaskConical,
    badge:       'bg-sig-blue-dim text-sig-blue border border-sig-blue/25',
    dot:         'bg-sig-blue',
    description: 'Used by developers and QA to test new features before UAT sign-off. Data is synthetic and resets frequently. Safe to trigger and abort deployments freely.',
  },
  UAT: {
    label:       'UAT',
    full:        'User Acceptance Testing',
    icon:        ShieldCheck,
    badge:       'bg-sig-yellow-dim text-sig-yellow border border-sig-yellow/25',
    dot:         'bg-sig-yellow',
    description: 'Business stakeholders validate features here before production release. Treat deployments with care — co-ordinate with the UAT team before triggering jobs.',
  },
  PROD: {
    label:       'PROD',
    full:        'Production',
    icon:        Rocket,
    badge:       'bg-sig-purple-dim text-sig-purple border border-sig-purple/25',
    dot:         'bg-sig-purple',
    description: 'Live production environment. Every action here affects real end-users. Double-check configuration before submitting a deployment.',
  },
} as const

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

// ── About table row ───────────────────────────────────────────────

function AboutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-wiz-border/40 last:border-b-0">
      <span className="w-24 flex-shrink-0 section-label text-wiz-muted">{label}</span>
      <span className="text-sm text-wiz-gray">{value}</span>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const { activeEnv, setActiveEnv } = useTheme()
  const [settings, setSettings] = useState<WizardSettings>(loadSettings)
  const [connStatus, setConnStatus]   = useState<ConnStatus | null>(null)
  const [testing, setTesting]         = useState(false)
  const [saving, setSaving]           = useState(false)

  // Persist to localStorage whenever settings change
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

  // Save settings (already auto-persisted, but gives user a clear confirmation)
  const handleSave = async () => {
    setSaving(true)
    await new Promise((r) => setTimeout(r, 400))
    localStorage.setItem('wiz-settings', JSON.stringify(settings))
    setSaving(false)
    toast.success('Settings saved successfully.')
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl animate-fade-in">

      {/* ── Page Title ── */}
      <div>
        <h1 className="text-2xl font-bold text-wiz-cream">Settings</h1>
        <p className="text-sm text-wiz-muted mt-0.5">
          Configure WizardCD control plane behaviour and preferences.
        </p>
      </div>

      {/* ══ Active Environment ══ */}
      <SectionCard
        title="Active Environment"
        description="Select which backend environment this control plane targets. Changes take effect immediately."
        accent="gold"
      >
        <div className="flex flex-col gap-3">
          {(Object.values(ENV_META) as typeof ENV_META[keyof typeof ENV_META][]).map((e) => {
            const EIcon    = e.icon
            const isActive = e.label === activeEnv
            return (
              <button
                key={e.label}
                type="button"
                onClick={() => setActiveEnv(e.label as ActiveEnv)}
                className={clsx(
                  'w-full flex items-start gap-4 px-4 py-3.5 rounded-xl border-2',
                  'text-left transition-all duration-150',
                  isActive
                    ? [e.badge.replace('border', 'border-2'), 'shadow-card']
                    : 'bg-wiz-bg border-wiz-border hover:border-wiz-border-mid hover:bg-wiz-raised',
                )}
              >
                {/* Env pill */}
                <span className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-xs font-bold flex-shrink-0 mt-0.5',
                  isActive ? e.badge : 'bg-wiz-surface text-wiz-muted border border-wiz-border',
                )}>
                  <EIcon size={11} />
                  {e.label}
                </span>

                {/* Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={clsx(
                      'text-sm font-semibold',
                      isActive ? 'text-wiz-cream' : 'text-wiz-gray',
                    )}>
                      {e.full}
                    </p>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-wiz-gold bg-wiz-gold-dim border border-wiz-gold/20 px-1.5 py-0.5 rounded">
                        <Check size={8} />
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className={clsx(
                    'text-xs mt-0.5 leading-relaxed',
                    isActive ? 'text-wiz-muted' : 'text-wiz-dim',
                  )}>
                    {e.description}
                  </p>
                </div>

                {/* Selection indicator */}
                <span className={clsx(
                  'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 transition-all',
                  isActive
                    ? [e.dot, 'border-current']
                    : 'border-wiz-border-mid bg-transparent',
                )} />
              </button>
            )
          })}
        </div>
      </SectionCard>

      {/* ══ API Connection ══ */}
      <SectionCard
        title="API Connection"
        description="Runner service endpoint configuration."
        accent="gold"
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 items-end">
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
              <p className="text-xs text-wiz-muted mt-1">
                Proxied via Vite — change target in <span className="font-mono">vite.config.ts</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing}
              className="btn-secondary gap-2 flex-shrink-0 h-10"
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

      {/* ══ Dashboard ══ */}
      <SectionCard title="Dashboard" description="Job list display and polling preferences.">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Auto-refresh Rate"
              name="dashboardRefreshRate"
              value={settings.dashboardRefreshRate}
              onChange={(e) => set('dashboardRefreshRate', e.target.value)}
              hint="How often the jobs list polls for updates"
              options={[
                { value: '2000',  label: '2 seconds' },
                { value: '5000',  label: '5 seconds' },
                { value: '10000', label: '10 seconds' },
                { value: '30000', label: '30 seconds' },
                { value: '0',     label: 'Off' },
              ]}
            />
          </div>
          <div className="flex flex-col gap-3">
            <ToggleSwitch
              checked={settings.showLifecycleStatus}
              onChange={(v) => set('showLifecycleStatus', v)}
              label="Show Lifecycle Status column"
              hint="Display the control-plane lifecycle state in the job table"
            />
            <ToggleSwitch
              checked={settings.showExecutionStatus}
              onChange={(v) => set('showExecutionStatus', v)}
              label="Show Execution Status column"
              hint="Display the execution-plane snapshot state in the job table"
            />
          </div>
        </div>
      </SectionCard>

      {/* ══ Log Viewer ══ */}
      <SectionCard title="Log Viewer" description="Log streaming and display preferences.">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Default Tail Lines"
              name="logTailLines"
              value={settings.logTailLines}
              onChange={(e) => set('logTailLines', e.target.value)}
              hint="Number of log lines fetched by default"
              options={[
                { value: '50',   label: '50 lines' },
                { value: '100',  label: '100 lines' },
                { value: '200',  label: '200 lines' },
                { value: '500',  label: '500 lines' },
                { value: '1000', label: '1000 lines' },
              ]}
            />
          </div>
          <ToggleSwitch
            checked={settings.logAutoScroll}
            onChange={(v) => set('logAutoScroll', v)}
            label="Auto-scroll to latest log line"
            hint="Automatically scroll to the bottom when new log lines arrive"
          />
        </div>
      </SectionCard>

      {/* ══ Notifications ══ */}
      <SectionCard title="Notifications" description="Toast notification display settings.">
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Toast Position"
            name="toastPosition"
            value={settings.toastPosition}
            onChange={(e) => set('toastPosition', e.target.value)}
            options={[
              { value: 'bottom-right', label: 'Bottom Right' },
              { value: 'bottom-left',  label: 'Bottom Left' },
              { value: 'top-right',    label: 'Top Right' },
              { value: 'top-left',     label: 'Top Left' },
              { value: 'top-center',   label: 'Top Center' },
              { value: 'bottom-center',label: 'Bottom Center' },
            ]}
            hint="Where deployment notifications appear on screen"
          />
        </div>
      </SectionCard>

      {/* ══ About ══ */}
      <SectionCard title="About" description="Platform identity and build information.">
        <div className="flex items-start gap-5">
          {/* Logo */}
          <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-wiz-border bg-wiz-bg">
            <img
              src="/wizardCD-logo.png"
              alt="WizardCD"
              className="w-full h-full object-contain p-1"
              style={{ objectPosition: 'left center' }}
            />
          </div>
          {/* Brand metadata */}
          <div className="flex-1">
            <p className="text-lg font-bold text-wiz-cream">
              Wizard<span className="text-wiz-gold">CD</span>
            </p>
            <p className="section-label mt-0.5 mb-3">Deployment Control Plane</p>
            <div className="wiz-divider" />
            <AboutRow label="VENDOR"  value="Engineered By Bytes Ltd" />
            <AboutRow label="WEBSITE" value="wizardcd.com" />
            <AboutRow label="CONTACT" value="info@engineeredbytes.com" />
            <AboutRow label="SLOGAN"  value="One Config. One Command. Continuous Magic." />
            <AboutRow label="VERSION" value="1.0.0" />
          </div>
        </div>
      </SectionCard>

      {/* ══ Save bar ══ */}
      <div className="flex justify-end pb-6">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="btn-primary gap-2"
        >
          {saving
            ? <Loader2 size={14} className="animate-spin" />
            : <Save size={14} />
          }
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

    </div>
  )
}
