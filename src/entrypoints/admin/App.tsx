import { useCallback, useEffect, useState } from 'react';
import {
  isAdminSetup,
  setAdminPassword,
  verifyAdminPassword,
  getAdminConfig,
  saveAdminConfig,
  setUserCredits,
  deactivateUser,
  resetAllMonthlyUsage,
  getUserUsageSummary,
  type AdminConfig,
} from '@/core/storage/adminConfig';

export function App() {
  const [authed, setAuthed] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void isAdminSetup().then((setup) => {
      setNeedsSetup(!setup);
    });
  }, []);

  const handleLogin = async () => {
    setError('');
    if (needsSetup) {
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      await setAdminPassword(password);
      setNeedsSetup(false);
      setAuthed(true);
    } else {
      const valid = await verifyAdminPassword(password);
      if (valid) {
        setAuthed(true);
      } else {
        setError('Incorrect password.');
      }
    }
    setPassword('');
  };

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-800 p-8 shadow-2xl">
          <h1 className="mb-2 text-2xl font-bold text-white">
            {needsSetup ? '🔒 Set Admin Password' : '🔒 Admin Login'}
          </h1>
          <p className="mb-6 text-sm text-slate-400">
            {needsSetup
              ? 'First time? Set a password to protect the admin panel.'
              : 'Enter your admin password to continue.'}
          </p>
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder={needsSetup ? 'Create a strong password (8+ chars)' : 'Admin password'}
            className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleLogin}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500 transition"
          >
            {needsSetup ? 'Set Password & Enter' : 'Login'}
          </button>
        </div>
      </div>
    );
  }

  return <AdminDashboard />;
}

function AdminDashboard() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [tab, setTab] = useState<'users' | 'usage' | 'settings' | 'keys' | 'guide'>('users');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const c = await getAdminConfig();
    setConfig(c);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (updated: AdminConfig) => {
    setSaving(true);
    await saveAdminConfig(updated);
    setConfig(updated);
    setTimeout(() => setSaving(false), 500);
  };

  if (!config) return <div className="p-8 text-slate-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">OneClick Apply — Admin Panel</h1>
            <p className="text-sm text-slate-400">Manage users, credits, and API keys</p>
          </div>
          {saving && <span className="text-sm text-green-400">✓ Saved</span>}
        </div>
        {/* Tabs */}
        <nav className="mt-4 flex gap-1">
          {(['users', 'usage', 'settings', 'keys', 'guide'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === t
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {t === 'users' && '👥 Users'}
              {t === 'usage' && '📊 Usage'}
              {t === 'settings' && '⚙️ Settings'}
              {t === 'keys' && '🔑 API Keys'}
              {t === 'guide' && '📖 Guide'}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl p-6">
        {tab === 'users' && <UsersTab config={config} onSave={save} />}
        {tab === 'usage' && <UsageTab config={config} />}
        {tab === 'settings' && <SettingsTab config={config} onSave={save} />}
        {tab === 'keys' && <KeysTab config={config} onSave={save} />}
        {tab === 'guide' && <GuideTab />}
      </main>
    </div>
  );
}

// ─── Users Tab ─────────────────────────────────────────────────────────
function UsersTab({ config, onSave }: { config: AdminConfig; onSave: (c: AdminConfig) => void }) {
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editCredits, setEditCredits] = useState(0);

  const totalUsed = config.users.reduce((sum, u) => sum + u.creditsUsed, 0);
  const totalAlloc = config.users.reduce((sum, u) => sum + u.monthlyCredits, 0);

  const handleSetCredits = async (userId: string, credits: number) => {
    await setUserCredits(userId, credits);
    const updated = { ...config };
    updated.users = updated.users.map((u) =>
      u.id === userId ? { ...u, monthlyCredits: credits } : u,
    );
    onSave(updated);
    setEditingUser(null);
  };

  const handleDeactivate = async (userId: string) => {
    await deactivateUser(userId);
    const updated = { ...config };
    updated.users = updated.users.map((u) => (u.id === userId ? { ...u, isActive: false } : u));
    onSave(updated);
  };

  const handleReactivate = async (userId: string) => {
    const updated = { ...config };
    updated.users = updated.users.map((u) => (u.id === userId ? { ...u, isActive: true } : u));
    onSave(updated);
  };

  const handleResetAll = async () => {
    if (!confirm("Reset all users' monthly usage to 0? This cannot be undone.")) return;
    await resetAllMonthlyUsage();
    const updated = { ...config };
    updated.users = updated.users.map((u) => ({ ...u, creditsUsed: 0 }));
    onSave(updated);
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Users" value={config.users.length} />
        <StatCard label="Active Users" value={config.users.filter((u) => u.isActive).length} />
        <StatCard label="Credits Used (Month)" value={totalUsed} />
        <StatCard label="Credits Allocated" value={totalAlloc} />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleResetAll}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 transition"
        >
          Reset All Monthly Usage
        </button>
      </div>

      {/* User table */}
      <div className="overflow-hidden rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800">
            <tr>
              <th className="px-4 py-3 text-left text-slate-400">User</th>
              <th className="px-4 py-3 text-left text-slate-400">Status</th>
              <th className="px-4 py-3 text-left text-slate-400">Credits Used</th>
              <th className="px-4 py-3 text-left text-slate-400">Monthly Limit</th>
              <th className="px-4 py-3 text-left text-slate-400">Own Key</th>
              <th className="px-4 py-3 text-left text-slate-400">Last Active</th>
              <th className="px-4 py-3 text-left text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {config.users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No users registered yet. Users appear here after they install and use the
                  extension.
                </td>
              </tr>
            )}
            {config.users.map((user) => (
              <tr key={user.id} className={`${!user.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{user.name || 'Unknown'}</div>
                  <div className="text-xs text-slate-500">{user.email || user.id.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      user.isActive ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className={`h-full rounded-full transition-all ${
                          user.creditsUsed / user.monthlyCredits > 0.9
                            ? 'bg-red-500'
                            : user.creditsUsed / user.monthlyCredits > 0.7
                              ? 'bg-amber-500'
                              : 'bg-green-500'
                        }`}
                        style={{
                          width: `${Math.min(100, (user.creditsUsed / user.monthlyCredits) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-slate-300">
                      {user.creditsUsed}/{user.monthlyCredits}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editingUser === user.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={editCredits}
                        onChange={(e) => setEditCredits(Number(e.target.value))}
                        className="w-20 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-white"
                        min={0}
                        max={10000}
                      />
                      <button
                        onClick={() => handleSetCredits(user.id, editCredits)}
                        className="rounded bg-green-600 px-2 py-1 text-xs text-white"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingUser(null)}
                        className="rounded bg-slate-600 px-2 py-1 text-xs text-white"
                      >
                        ✗
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingUser(user.id);
                        setEditCredits(user.monthlyCredits);
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      {user.monthlyCredits}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.hasOwnKey ? (
                    <span className="text-green-400">
                      {user.ownKeyProvider} {user.ownKeyMasked}
                    </span>
                  ) : (
                    <span className="text-slate-500">None</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {user.lastActive ? new Date(user.lastActive).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
                  {user.isActive ? (
                    <button
                      onClick={() => handleDeactivate(user.id)}
                      className="rounded bg-red-700 px-3 py-1 text-xs text-white hover:bg-red-600"
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      onClick={() => handleReactivate(user.id)}
                      className="rounded bg-green-700 px-3 py-1 text-xs text-white hover:bg-green-600"
                    >
                      Enable
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Usage Tab ─────────────────────────────────────────────────────────
function UsageTab({ config }: { config: AdminConfig }) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  // Aggregate usage across all users for the overview
  const allUsage: Record<string, { calls: number; types: Record<string, number> }> = {};
  for (const user of config.users) {
    if (!user.usageLog) continue;
    for (const [date, data] of Object.entries(user.usageLog)) {
      if (!allUsage[date]) allUsage[date] = { calls: 0, types: {} };
      allUsage[date].calls += data.calls;
      for (const [type, count] of Object.entries(data.types)) {
        allUsage[date].types[type] = (allUsage[date].types[type] ?? 0) + count;
      }
    }
  }

  const selectedUserRecord = config.users.find((u) => u.id === selectedUser);
  const userUsage = selectedUserRecord ? getUserUsageSummary(selectedUserRecord, days) : [];

  // Top users by usage this month
  const sortedUsers = [...config.users].sort((a, b) => b.creditsUsed - a.creditsUsed);

  // Total calls today / this week / this month
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const todayCalls = Object.entries(allUsage)
    .filter(([d]) => d === today)
    .reduce((s, [, v]) => s + v.calls, 0);
  const weekCalls = Object.entries(allUsage)
    .filter(([d]) => d >= weekAgo)
    .reduce((s, [, v]) => s + v.calls, 0);
  const monthCalls = config.users.reduce((s, u) => s + u.creditsUsed, 0);

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Today" value={todayCalls} />
        <StatCard label="This Week" value={weekCalls} />
        <StatCard label="This Month" value={monthCalls} />
        <StatCard
          label="Avg/User/Day"
          value={
            config.users.filter((u) => u.isActive).length > 0
              ? Math.round(monthCalls / Math.max(1, config.users.filter((u) => u.isActive).length))
              : 0
          }
        />
      </div>

      {/* Top Users Leaderboard */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Top Users by Credits Used</h2>
        <div className="space-y-3">
          {sortedUsers.slice(0, 10).map((user, i) => (
            <div
              key={user.id}
              className="flex items-center gap-4 cursor-pointer hover:bg-slate-700/50 rounded-lg px-3 py-2 transition"
              onClick={() => setSelectedUser(user.id === selectedUser ? null : user.id)}
            >
              <span className="w-6 text-center text-sm font-bold text-slate-500">#{i + 1}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">
                    {user.name || user.email || user.id.slice(0, 8)}
                  </span>
                  <span className="text-sm text-slate-400">
                    {user.creditsUsed} / {user.monthlyCredits}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all ${
                      user.creditsUsed / user.monthlyCredits > 0.9
                        ? 'bg-red-500'
                        : user.creditsUsed / user.monthlyCredits > 0.7
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                    }`}
                    style={{
                      width: `${Math.min(100, (user.creditsUsed / user.monthlyCredits) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
          {sortedUsers.length === 0 && <p className="text-sm text-slate-500">No usage data yet.</p>}
        </div>
      </div>

      {/* Selected User Detail */}
      {selectedUserRecord && (
        <div className="rounded-xl border border-blue-700/50 bg-slate-800 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {selectedUserRecord.name ||
                selectedUserRecord.email ||
                selectedUserRecord.id.slice(0, 8)}{' '}
              — Daily Breakdown
            </h2>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded border border-slate-600 bg-slate-700 px-3 py-1 text-sm text-white"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>

          {userUsage.length === 0 ? (
            <p className="text-sm text-slate-500">No usage recorded for this period.</p>
          ) : (
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-7 gap-2 text-xs text-slate-500 font-medium px-2 pb-1 border-b border-slate-700">
                <span>Date</span>
                <span>Total</span>
                <span>Mapping</span>
                <span>Draft</span>
                <span>Extract</span>
                <span>Tailor</span>
                <span>Cover Letter</span>
              </div>
              {/* Rows */}
              {userUsage.map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-7 gap-2 text-sm px-2 py-1.5 rounded hover:bg-slate-700/30"
                >
                  <span className="text-slate-400">{day.date.slice(5)}</span>
                  <span className="font-medium text-white">{day.calls}</span>
                  <span className="text-blue-400">{day.types.mapping ?? 0}</span>
                  <span className="text-green-400">{day.types.draft ?? 0}</span>
                  <span className="text-purple-400">{day.types.extract ?? 0}</span>
                  <span className="text-amber-400">{day.types.tailor ?? 0}</span>
                  <span className="text-pink-400">{day.types.coverLetter ?? 0}</span>
                </div>
              ))}
              {/* Totals */}
              <div className="grid grid-cols-7 gap-2 text-sm px-2 py-2 border-t border-slate-700 font-medium">
                <span className="text-slate-300">Total</span>
                <span className="text-white">{userUsage.reduce((s, d) => s + d.calls, 0)}</span>
                <span className="text-blue-400">
                  {userUsage.reduce((s, d) => s + (d.types.mapping ?? 0), 0)}
                </span>
                <span className="text-green-400">
                  {userUsage.reduce((s, d) => s + (d.types.draft ?? 0), 0)}
                </span>
                <span className="text-purple-400">
                  {userUsage.reduce((s, d) => s + (d.types.extract ?? 0), 0)}
                </span>
                <span className="text-amber-400">
                  {userUsage.reduce((s, d) => s + (d.types.tailor ?? 0), 0)}
                </span>
                <span className="text-pink-400">
                  {userUsage.reduce((s, d) => s + (d.types.coverLetter ?? 0), 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Usage by Type (global) */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Usage by Call Type (All Users)</h2>
        <div className="grid grid-cols-5 gap-4">
          {(['mapping', 'draft', 'extract', 'tailor', 'coverLetter'] as const).map((type) => {
            const total = config.users.reduce((sum, u) => {
              if (!u.usageLog) return sum;
              return sum + Object.values(u.usageLog).reduce((s, d) => s + (d.types[type] ?? 0), 0);
            }, 0);
            const colors = {
              mapping: 'text-blue-400 border-blue-700/50',
              draft: 'text-green-400 border-green-700/50',
              extract: 'text-purple-400 border-purple-700/50',
              tailor: 'text-amber-400 border-amber-700/50',
              coverLetter: 'text-pink-400 border-pink-700/50',
            };
            const labels = {
              mapping: 'Field Mapping',
              draft: 'Answer Draft',
              extract: 'Resume Extract',
              tailor: 'Resume Tailor',
              coverLetter: 'Cover Letter',
            };
            return (
              <div
                key={type}
                className={`rounded-lg border ${colors[type]} bg-slate-900/50 p-4 text-center`}
              >
                <div className={`text-2xl font-bold ${colors[type].split(' ')[0]}`}>{total}</div>
                <div className="text-xs text-slate-400 mt-1">{labels[type]}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Settings Tab ──────────────────────────────────────────────────────
function SettingsTab({
  config,
  onSave,
}: {
  config: AdminConfig;
  onSave: (c: AdminConfig) => void;
}) {
  const [defaultCredits, setDefaultCredits] = useState(config.defaultMonthlyCredits);
  const [aiEnabled, setAiEnabled] = useState(config.aiEnabled);
  const [notes, setNotes] = useState(config.notes);

  const handleSave = () => {
    onSave({ ...config, defaultMonthlyCredits: defaultCredits, aiEnabled, notes });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Credit Settings</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">
              Default monthly credits for new users
            </label>
            <input
              type="number"
              value={defaultCredits}
              onChange={(e) => setDefaultCredits(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white"
              min={0}
              max={10000}
            />
            <p className="mt-1 text-xs text-slate-500">
              1 credit = 1 AI call (field mapping, answer draft, résumé tailor, cover letter).
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm text-slate-300">Global AI Kill Switch</label>
              <p className="text-xs text-slate-500">Disable AI for ALL users immediately.</p>
            </div>
            <button
              onClick={() => setAiEnabled(!aiEnabled)}
              className={`relative h-6 w-11 rounded-full transition ${
                aiEnabled ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  aiEnabled ? 'left-5.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Admin Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white placeholder-slate-500"
          placeholder="Notes, reminders, configuration log..."
        />
      </div>

      <button
        onClick={handleSave}
        className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-500 transition"
      >
        Save Settings
      </button>
    </div>
  );
}

// ─── Keys Tab ──────────────────────────────────────────────────────────
function KeysTab({ config, onSave }: { config: AdminConfig; onSave: (c: AdminConfig) => void }) {
  const [sharedKey, setSharedKey] = useState(config.sharedApiKey);
  const [sharedProvider, setSharedProvider] = useState(config.sharedApiProvider);
  const [showKey, setShowKey] = useState(false);

  const handleSaveKey = () => {
    onSave({ ...config, sharedApiKey: sharedKey, sharedApiProvider: sharedProvider });
  };

  // Estimate monthly cost based on users
  const activeUsers = config.users.filter((u) => u.isActive && !u.hasOwnKey).length;
  const totalCredits = config.users
    .filter((u) => u.isActive && !u.hasOwnKey)
    .reduce((sum, u) => sum + u.monthlyCredits, 0);
  const estimatedCost = (totalCredits * 0.02).toFixed(2); // ~$0.02 per call average

  return (
    <div className="max-w-2xl space-y-6">
      {/* Shared API Key */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Shared API Key (Your Key)</h2>
        <p className="mb-4 text-sm text-slate-400">
          This key is used for all users who don't have their own. Keep it secure.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-400">Provider</label>
            <select
              value={sharedProvider}
              onChange={(e) => setSharedProvider(e.target.value as 'openai' | 'anthropic')}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-400">API Key</label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={sharedKey}
                onChange={(e) => setSharedKey(e.target.value)}
                className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white"
                placeholder={sharedProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="rounded-lg border border-slate-600 px-3 py-2 text-slate-400 hover:text-white"
              >
                {showKey ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            onClick={handleSaveKey}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
          >
            Save Key
          </button>
        </div>
      </div>

      {/* Cost Estimate */}
      <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-6">
        <h2 className="mb-2 text-lg font-semibold text-amber-300">💰 Cost Estimate</h2>
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            Active users using shared key: <strong>{activeUsers}</strong>
          </p>
          <p>
            Total monthly credits allocated: <strong>{totalCredits}</strong>
          </p>
          <p>
            Estimated max monthly cost: <strong>${estimatedCost}</strong>
          </p>
          <p className="text-xs text-slate-500">
            Based on avg $0.02 per AI call. Actual cost depends on usage patterns.
          </p>
        </div>
      </div>

      {/* User Keys Overview */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">User-Provided Keys</h2>
        <p className="mb-4 text-sm text-slate-400">
          Users who have added their own API keys (no longer consuming your credits):
        </p>
        <div className="space-y-2">
          {config.users.filter((u) => u.hasOwnKey).length === 0 ? (
            <p className="text-sm text-slate-500">No users have provided their own keys yet.</p>
          ) : (
            config.users
              .filter((u) => u.hasOwnKey)
              .map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-lg border border-slate-700 px-4 py-3"
                >
                  <div>
                    <span className="text-white">{user.name || user.email}</span>
                    <span className="ml-2 text-xs text-slate-500">{user.ownKeyProvider}</span>
                  </div>
                  <span className="font-mono text-sm text-slate-400">{user.ownKeyMasked}</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Guide Tab ─────────────────────────────────────────────────────────
function GuideTab() {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">📖 Quick Admin Guide</h2>

        <div className="space-y-6 text-sm text-slate-300">
          <section>
            <h3 className="mb-2 font-semibold text-blue-400">How Credits Work</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                1 credit = 1 AI-assisted action (field mapping, answer draft, résumé tailor, cover
                letter)
              </li>
              <li>Credits reset automatically on the 1st of each month</li>
              <li>You set each user's monthly limit individually</li>
              <li>When credits are exhausted, users are prompted to add their own key</li>
              <li>Users with their own key don't consume your credits</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-blue-400">Managing Costs</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Set conservative limits</strong> — start with 50-100 credits/month per user
              </li>
              <li>
                <strong>Monitor the Cost Estimate</strong> in the Keys tab
              </li>
              <li>
                <strong>Set provider-side limits too</strong> — OpenAI/Anthropic both support
                monthly spending caps
              </li>
              <li>
                <strong>Use the kill switch</strong> if costs spike unexpectedly
              </li>
              <li>Encourage power users to get their own keys</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-blue-400">Adding New Users</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Users auto-register when they first install and use the extension</li>
              <li>They appear in the Users tab with default credits</li>
              <li>Adjust individual limits as needed</li>
              <li>Deactivate users to revoke all AI access immediately</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-blue-400">Security</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Your shared API key is stored in Chrome's encrypted local storage</li>
              <li>It never appears on any web page or is accessible to other extensions</li>
              <li>User-provided keys are also stored locally and encrypted</li>
              <li>The admin panel is password-protected (SHA-256 hashed, constant-time compare)</li>
              <li>All API calls go directly to OpenAI/Anthropic (HTTPS only) — no intermediary</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-semibold text-blue-400">Accessing This Panel</h3>
            <p>
              Navigate to:{' '}
              <code className="rounded bg-slate-700 px-2 py-0.5">
                chrome-extension://&lt;extension-id&gt;/admin.html
              </code>
            </p>
            <p className="mt-1 text-slate-500">
              This page is NOT linked anywhere in the extension UI. Only you (the admin) know the
              URL and password.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Components ─────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
