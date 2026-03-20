import React, { useState } from 'react';
import { authApi } from '../../auth/authApi';

interface Props {
  onBack: () => void;
}

export default function ForgotPasswordPage({ onBack }: Props) {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
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
          {sent ? (
            <>
              <h1 className="text-gray-100 text-lg font-semibold mb-2">Check your email</h1>
              <p className="text-gray-400 text-sm mb-6">
                If an account exists for <span className="text-gray-200">{email}</span>, a reset link has been sent.
              </p>
              <button
                onClick={onBack}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                ← Back to sign in
              </button>
            </>
          ) : (
            <>
              <h1 className="text-gray-100 text-lg font-semibold mb-1">Forgot password</h1>
              <p className="text-gray-500 text-xs mb-6">Enter your email and we'll send a reset link.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-orange-500"
                    placeholder="you@company.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-medium text-sm rounded px-4 py-2.5 transition-colors"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <button
                onClick={onBack}
                className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                ← Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
