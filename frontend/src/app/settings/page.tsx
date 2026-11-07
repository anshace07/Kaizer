"use client";

import { useEffect, useState } from "react";

import {
  Settings,
  User,
  Globe,
  Bell,
  Volume2,
  Clock,
  Save,
  RotateCcw,
  Check,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-violet-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-4 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-900">
          {title}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      </div>

      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700">
        <Icon className="h-5 w-5" />
      </div>

      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">
          {title}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [language, setLanguage] = useState("English");
  const [shift, setShift] = useState("Day Shift");

  const [notifications, setNotifications] = useState(true);
  const [criticalAlerts, setCriticalAlerts] = useState(true);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState(true);

  const [voiceAnnouncements, setVoiceAnnouncements] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);

  const [saved, setSaved] = useState(false);

  // LOAD SAVED SETTINGS
  useEffect(() => {
    const stored = localStorage.getItem("plantpulse-settings");

    if (stored) {
      try {
        const settings = JSON.parse(stored);

        setLanguage(settings.language ?? "English");
        setShift(settings.shift ?? "Day Shift");

        setNotifications(settings.notifications ?? true);
        setCriticalAlerts(settings.criticalAlerts ?? true);
        setMaintenanceAlerts(settings.maintenanceAlerts ?? true);

        setVoiceAnnouncements(settings.voiceAnnouncements ?? true);
        setSoundEffects(settings.soundEffects ?? true);
      } catch {
        console.error("Unable to load saved settings.");
      }
    }
  }, []);

  // SAVE SETTINGS
  function saveSettings() {
    localStorage.setItem(
      "plantpulse-settings",
      JSON.stringify({
        language,
        shift,
        notifications,
        criticalAlerts,
        maintenanceAlerts,
        voiceAnnouncements,
        soundEffects,
      })
    );

    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2500);
  }

  // RESET SETTINGS
  function resetSettings() {
    setLanguage("English");
    setShift("Day Shift");

    setNotifications(true);
    setCriticalAlerts(true);
    setMaintenanceAlerts(true);

    setVoiceAnnouncements(true);
    setSoundEffects(true);

    localStorage.removeItem("plantpulse-settings");
    setSaved(false);
  }

  return (
    <div className="min-h-full space-y-7">

      {/* HEADER */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            <Settings className="h-3.5 w-3.5" />
            SYSTEM CONFIGURATION
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Settings
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage your preferences, notifications and PlantPulse AI experience.
          </p>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-2">

          <button
            onClick={resetSettings}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>

          <button
            onClick={saveSettings}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </button>

        </div>
      </div>

      {/* SUCCESS MESSAGE */}
      {saved && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          <Check className="h-4 w-4" />
          Your preferences have been saved successfully.
        </div>
      )}

      {/* GENERAL PREFERENCES */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5 sm:p-6">

          <SectionHeading
            icon={User}
            title="General Preferences"
            description="Configure your basic account and factory preferences."
          />

          <div className="grid gap-6 md:grid-cols-2">

            {/* USER ROLE */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                User Role
              </label>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="rounded-lg bg-violet-100 p-2.5 text-violet-700">
                  <User className="h-5 w-5" />
                </div>

                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Factory Supervisor
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Plant operations access
                  </p>
                </div>
              </div>
            </div>

            {/* DEFAULT SHIFT */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Default Shift
              </label>

              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                >
                  <option>Day Shift</option>
                  <option>Evening Shift</option>
                  <option>Night Shift</option>
                </select>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* VOICE & LANGUAGE */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5 sm:p-6">

          <SectionHeading
            icon={Globe}
            title="Voice & Language"
            description="Configure the multilingual voice reporting experience."
          />

          <div className="grid gap-6 md:grid-cols-2">

            {/* LANGUAGE */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Preferred Language
              </label>

              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              >
                <option>English</option>
                <option>Hindi</option>
                <option>Hinglish</option>
              </select>

              <p className="mt-2 text-xs text-slate-500">
                Used as your preferred voice reporting language.
              </p>
            </div>

            {/* VOICE INTELLIGENCE */}
            <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex items-center gap-2 text-violet-700">
                <Volume2 className="h-5 w-5" />

                <p className="text-sm font-bold">
                  Voice Intelligence
                </p>
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                Powered by Gnani Prisma v3.0 for multilingual speech
                recognition and voice processing.
              </p>

              <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                Voice service configured
              </span>
            </div>

          </div>

          <div className="mt-5">

            <SettingRow
              title="Voice Announcements"
              description="Enable spoken announcements for incident updates."
              checked={voiceAnnouncements}
              onChange={setVoiceAnnouncements}
            />

            <SettingRow
              title="Sound Effects"
              description="Play audio feedback for important system actions."
              checked={soundEffects}
              onChange={setSoundEffects}
            />

          </div>
        </CardContent>
      </Card>

      {/* NOTIFICATIONS */}
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="p-5 sm:p-6">

          <SectionHeading
            icon={Bell}
            title="Notifications & Alerts"
            description="Choose which operational alerts you want to receive."
          />

          <SettingRow
            title="System Notifications"
            description="Enable or disable operational notifications."
            checked={notifications}
            onChange={setNotifications}
          />

          <SettingRow
            title="Critical Incident Alerts"
            description="Receive alerts when a critical incident is reported."
            checked={criticalAlerts}
            onChange={setCriticalAlerts}
          />

          <SettingRow
            title="Maintenance Reminders"
            description="Get notified about upcoming and overdue maintenance."
            checked={maintenanceAlerts}
            onChange={setMaintenanceAlerts}
          />

        </CardContent>
      </Card>

      {/* FOOTER */}
      <p className="pb-2 text-center text-xs text-slate-400">
        PlantPulse AI · Industrial Voice Intelligence Platform
      </p>

    </div>
  );
}