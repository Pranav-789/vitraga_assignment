import React, { useState } from 'react';
import axios from 'axios';
import { LogIn, UserPlus, Sparkles, AlertCircle, Compass, Lock, Mail, User } from 'lucide-react';

export default function AuthModal({ apiBase, onAuthSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!username.trim() || username.length < 3) {
          setError('Username must be at least 3 characters long');
          setLoading(false);
          return;
        }
        if (!email.trim() || !password) {
          setError('All fields are required');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters long');
          setLoading(false);
          return;
        }

        const res = await axios.post(`${apiBase}/auth/register`, {
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password
        });

        onAuthSuccess(res.data.token, res.data.user);
      } else {
        if (!email.trim() || !password) {
          setError('Email and password are required');
          setLoading(false);
          return;
        }

        const res = await axios.post(`${apiBase}/auth/login`, {
          email: email.trim().toLowerCase(),
          password
        });

        onAuthSuccess(res.data.token, res.data.user);
      }
    } catch (err) {
      console.error('Auth error:', err);
      const msg = err.response?.data?.error || err.message || 'Authentication failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden relative">
        {/* Glow accent */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="p-6 pb-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white mx-auto mb-3 shadow-md">
            <Compass className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            {mode === 'login' ? 'Welcome Back' : 'Create an Account'}
          </h2>
          <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
            Sign in to start planning fact-grounded travel itineraries with multi-agent orchestration.
          </p>

          {/* Toggle buttons */}
          <div className="flex bg-gray-100 p-1 rounded-2xl mt-5 text-xs font-semibold text-gray-600">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                mode === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'hover:text-gray-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                mode === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'hover:text-gray-900'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-3.5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Username</label>
              <div className="relative">
                <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="e.g. travel_explorer"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : mode === 'login' ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>

        <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-400">
            Protected chat mode. Only authenticated users can access the LangGraph travel orchestrator.
          </p>
        </div>
      </div>
    </div>
  );
}
