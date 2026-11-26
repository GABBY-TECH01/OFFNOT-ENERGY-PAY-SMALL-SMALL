import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Shield,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { STAFF_ROLE_LABELS, type PageRoute } from '../types';

interface AuthPageProps {
  onNavigate: (route: PageRoute) => void;
}

export function AuthPage({ onNavigate }: AuthPageProps) {
  const {
    user,
    isStaff,
    staffRole,
    staffRecord,
    isBootstrapEmailUnverified,
    authReady,
    staffLoading,
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resetPassword,
    resendVerificationEmail,
    logout,
  } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pendingRedirect, setPendingRedirect] = useState(false);
  const [showEmailEnableGuide, setShowEmailEnableGuide] = useState(false);
  const [showPopupBlockedHelp, setShowPopupBlockedHelp] = useState(false);

  // Automatic Role-Based Redirection once auth + staff role snapshot resolve
  useEffect(() => {
    if (!authReady || staffLoading || !user) return;
    if (isBootstrapEmailUnverified) return;

    if (pendingRedirect) {
      setPendingRedirect(false);
      onNavigate(isStaff ? 'admin' : 'account');
    }
  }, [authReady, staffLoading, user, isStaff, isBootstrapEmailUnverified, pendingRedirect, onNavigate]);

  const switchMode = (nextMode: 'login' | 'register' | 'reset') => {
    setMode(nextMode);
    setError('');
    setInfo('');
    setShowEmailEnableGuide(false);
    setShowPopupBlockedHelp(false);
  };

  if (user && isBootstrapEmailUnverified) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14">
        <div className="rounded-2xl border border-amber-300 bg-white p-8 space-y-4 shadow-sm">
          <Shield className="w-10 h-10 text-amber-600 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900 text-center">
            Verify Super Admin Email ({user.email})
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            For security, Email/Password sign-ups require email verification before Super Admin
            privileges unlock. Click the verification link sent to <strong>{user.email}</strong>,
            or sign in with Google once (which verifies automatically and lets you set your password
            from the Admin Portal).
          </p>
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
              {info}
            </div>
          )}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setError('');
                setInfo('');
                setLoading(true);
                try {
                  setPendingRedirect(true);
                  await signInWithGoogle();
                } catch (err) {
                  setPendingRedirect(false);
                  const msg = err instanceof Error ? err.message : String(err);
                  if (msg.includes('auth/popup-blocked')) {
                    setError(
                      'Your browser blocked the Google pop-up inside this preview. Tap "Always show" at the top of your browser or open this page in a full browser tab to verify.'
                    );
                  } else {
                    setError(msg || 'Unable to verify with Google.');
                  }
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
            >
              {loading ? 'Verifying...' : `Verify Instantly with Google (${user.email})`}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setError('');
                setInfo('');
                setLoading(true);
                try {
                  await resendVerificationEmail();
                  setInfo('Verification email sent! Please check your inbox and then reload.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Unable to send verification email.');
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
            >
              Resend Verification Email
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">
            Signed in as {user.displayName || user.email}
          </h1>
          {staffLoading ? (
            <p className="text-sm text-slate-500">Checking role &amp; branch permissions...</p>
          ) : isStaff && staffRole ? (
            <>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-bold">
                <Shield className="w-3.5 h-3.5" />
                {STAFF_ROLE_LABELS[staffRole]}
                {staffRecord?.branch ? ` · ${staffRecord.branch}` : ''}
              </div>
              <p className="text-sm text-slate-600">
                Access your role-based OFFNOT ENERGY Staff &amp; Management Dashboard.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
              >
                Open {STAFF_ROLE_LABELS[staffRole]} Dashboard
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Access your orders, instalment schedule, receipts, and delivery addresses in your
                dashboard.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('account')}
                className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
              >
                Go to Customer Dashboard
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Sign Out &amp; Switch Account
          </button>
        </div>
      </div>
    );
  }

  const formatAuthError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('auth/popup-blocked')) {
      setShowPopupBlockedHelp(true);
      return 'Your browser blocked the Google sign-in pop-up inside this preview frame. Tap "Always show" at the top of your browser and try again, or open the login page directly in a full browser tab below.';
    }
    if (msg.includes('auth/cancelled-popup-request')) {
      setShowPopupBlockedHelp(true);
      return 'Google sign-in pop-up was interrupted. Tap "Continue with Google" again or open the app in a full browser tab below.';
    }
    if (msg.includes('auth/unauthorized-domain')) {
      return 'This preview domain is not yet authorized in Firebase Authentication Settings → Authorized domains.';
    }
    if (msg.includes('auth/operation-not-allowed')) {
      setShowEmailEnableGuide(true);
      return 'Email/Password sign-in is not enabled yet in Firebase Console. Click "Continue with Google" above to open the Admin Portal immediately, or enable Email/Password in Firebase Authentication Sign-in Providers.';
    }
    if (msg.includes('auth/invalid-email')) {
      return 'Please enter a valid email address.';
    }
    if (
      msg.includes('auth/invalid-credential') ||
      msg.includes('auth/wrong-password') ||
      msg.includes('auth/user-not-found')
    ) {
      return mode === 'reset'
        ? 'No email/password account was found for that email address. If you sign in with Google, use "Continue with Google" above.'
        : 'Incorrect email or password, or no password is linked to this email yet. If you previously signed in with Google (for example as Super Admin), click "Continue with Google" above and save your password inside Staff & Logins → Super Admin Password Login Setup—or use "Forgot password?" below.';
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists. Click "Back to Sign In", or click "Continue with Google" / "Forgot password?" if you signed up with Google earlier.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'Password should be at least 6 characters long.';
    }
    if (msg.includes('auth/too-many-requests')) {
      return 'Too many failed attempts. Please wait a moment, or sign in with Google above / reset your password.';
    }
    if (msg.includes('auth/popup-closed-by-user')) {
      return 'Google sign-in popup was closed before completion.';
    }
    return msg;
  };

  const handleGoogle = async () => {
    setError('');
    setInfo('');
    setShowEmailEnableGuide(false);
    setShowPopupBlockedHelp(false);
    setLoading(true);
    try {
      setPendingRedirect(true);
      await signInWithGoogle();
    } catch (err) {
      setPendingRedirect(false);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setShowEmailEnableGuide(false);
    setShowPopupBlockedHelp(false);
    setLoading(true);
    try {
      if (mode === 'login') {
        setPendingRedirect(true);
        await signInWithEmail(email, password);
      } else if (mode === 'register') {
        setPendingRedirect(true);
        await registerWithEmail(name, email, password, phone);
      } else {
        if (!email.trim()) {
          setError('Please enter your registered email address.');
          setLoading(false);
          return;
        }
        await resetPassword(email);
        setInfo(
          `Password reset link sent to ${email.trim()}. Please check your Inbox and Spam/Junk folder, follow the link to choose a new password, then sign in.`
        );
      }
    } catch (err) {
      setPendingRedirect(false);
      setError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-6">
          <img
            src="/assets/aistudio/IMG-20261027-WA0006_cf69d348.jpg"
            alt="OFFNOT ENERGY"
            className="h-14 w-auto object-contain mx-auto mb-3"
          />
          <h1 className="text-2xl font-extrabold text-slate-900">
            {mode === 'login'
              ? 'Customer & Staff Sign In'
              : mode === 'register'
                ? 'Create OFFNOT Account'
                : 'Reset Your Password'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'reset'
              ? 'Enter your email address to receive a secure password reset link'
              : 'Automatically routes to Customer Dashboard or your Staff Role Dashboard'}
          </p>
        </div>

        {/* Google Auth (Configured automatically by Firebase) */}
        <button
          type="button"
          disabled={loading}
          onClick={handleGoogle}
          className="w-full py-3 px-4 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 flex items-center justify-center gap-2.5 transition-colors cursor-pointer mb-5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          Continue with Google
        </button>

        <div className="relative flex py-2 items-center mb-5">
          <div className="grow border-t border-slate-200" />
          <span className="shrink mx-3 text-[11px] font-semibold text-slate-400 uppercase">
            Or Email &amp; Password
          </span>
          <div className="grow border-t border-slate-200" />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2.5 text-xs text-red-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            {showPopupBlockedHelp && typeof window !== 'undefined' && (
              <div className="pl-6 flex flex-wrap gap-2">
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                >
                  Open Login in Full Browser Tab
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
            {showEmailEnableGuide && (
              <a
                href="https://console.firebase.google.com/project/tactical-iterator-h4cnq/authentication/providers"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-bold underline text-red-900"
              >
                Enable Email/Password in Firebase Console
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {info && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0803..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
          >
            {mode === 'register' && <UserPlus className="w-4 h-4" />}
            {loading
              ? mode === 'reset'
                ? 'Sending Reset Email...'
                : mode === 'register'
                  ? 'Creating Account...'
                  : 'Signing in...'
              : mode === 'login'
                ? 'Sign In'
                : mode === 'register'
                  ? 'Create Account'
                  : 'Send Password Reset Email'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          {mode === 'login' ? (
            <>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                New customer? Register
              </button>
              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="text-slate-600 hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="font-semibold text-emerald-700 hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
