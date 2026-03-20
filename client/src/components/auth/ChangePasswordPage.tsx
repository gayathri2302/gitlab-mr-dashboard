import React, { useState } from 'react';
import { authApi } from '../../auth/authApi';
import { useSession } from '../../auth/SessionContext';

export default function ChangePasswordPage() {
  const { user, refreshUser } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirm,         setConfirm]         = useState('');
  const [error,           setError]           = useState('');
  const [loading,         setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(user!.email, currentPassword, newPassword);
      refreshUser({ ...user!, mustChangePassword: false });
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to change password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <svg className="w-7 h-7 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
          </svg>
          <span className="text-lg font-bold text-gray-100">MR Dashboard</span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
          <h1 className="text-gray-100 text-lg font-semibold mb-1">Change password</h1>
          <p className="text-gray-500 text-xs mb-6">You must set a new password before continuing.</p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-red-900/40 border border-red-700 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500"
                placeholder="Min 8 chars, 1 uppercase, 1 number"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium text-sm rounded px-4 py-2.5 transition-colors"
            >
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
