import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MessageCircle,
  Shield,
  UserCheck,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { STAFF_ROLE_LABELS, type AccountPricingType, type PageRoute } from '../types';
import { INSTALLER_WHATSAPP_GROUP_URL } from '../utils/instalments';

interface AuthPageProps {
  onNavigate: (route: PageRoute) => void;
}

export function AuthPage({ onNavigate }: AuthPageProps) {
  const { logoUrl } = useStore();
  const {
    user,
    isStaff,
    isInstaller,
    needsCustomerOnboarding,
    accountTypeChoice,
    setInstallerChoice,
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
  const [selectedInstaller, setSelectedInstaller] = useState<boolean>(
    accountTypeChoice === 'installer'
  );
  const [hasPickedInstallerOption, setHasPickedInstallerOption] = useState<boolean>(
    accountTypeChoice !== null
  );
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [joinedInstallerGroup, setJoinedInstallerGroup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pendingRedirect, setPendingRedirect] = useState(false);
  const [showEmailEnableGuide, setShowEmailEnableGuide] = useState(false);
  const [showPopupBlockedHelp, setShowPopupBlockedHelp] = useState(false);

  // Automatic Role-Based Redirection once auth + staff role snapshot + onboarding resolve
  useEffect(() => {
    if (!authReady || staffLoading || !user) return;
    if (isBootstrapEmailUnverified || needsCustomerOnboarding) return;

    if (pendingRedirect) {
      setPendingRedirect(false);
      onNavigate(isStaff ? 'admin' : 'account');
    }
  }, [
    authReady,
    staffLoading,
    user,
    isStaff,
    isBootstrapEmailUnverified,
    needsCustomerOnboarding,
    pendingRedirect,
    onNavigate,
  ]);

  const switchMode = (nextMode: 'login' | 'register' | 'reset') => {
    setMode(nextMode);
    setError('');
    setInfo('');
    setShowEmailEnableGuide(false);
    setShowPopupBlockedHelp(false);
  };

  const handleSelectInstallerOption = (isInst: boolean) => {
    setSelectedInstaller(isInst);
    setHasPickedInstallerOption(true);
    void setInstallerChoice(isInst);
  };

  const selectedAccountTypeParam: AccountPricingType | undefined = hasPickedInstallerOption
    ? selectedInstaller
      ? 'installer'
      : 'end_user'
    : undefined;

  if (user && isBootstrapEmailUnverified) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14">
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-4 shadow-sm">
          <Shield className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white text-center">
            Verify Super Admin Email ({user.email})
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            For security, Email/Password sign-ups require email verification before Super Admin
            privileges unlock. Click the verification link sent to <strong>{user.email}</strong>,
            or sign in with Google once (which verifies automatically and lets you set your password
            from the Admin Portal).
          </p>
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 p-3 text-xs text-red-800 dark:text-red-300">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 p-3 text-xs text-emerald-800 dark:text-emerald-300">
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
                  await signInWithGoogle(selectedAccountTypeParam);
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
              className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
            >
              Resend Verification Email
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-4">
          <CheckCircle2 className="w-10 h-10 text-emerald-700 dark:text-emerald-400 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Signed in as {user.displayName || user.email}
          </h1>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold">
            {isInstaller ? (
              <>
                <Wrench className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                Account Type: Installer/Dealer
              </>
            ) : (
              <>
                <UserCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                Account Type: Enduser
              </>
            )}
          </div>
          {staffLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Checking role &amp; branch permissions...</p>
          ) : isStaff && staffRole ? (
            <>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                <Shield className="w-3.5 h-3.5" />
                {STAFF_ROLE_LABELS[staffRole]}
                {staffRecord?.branch ? ` · ${staffRecord.branch}` : ''}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
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
              <p className="text-sm text-slate-600 dark:text-slate-300">
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
            className="w-full py-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
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
      await signInWithGoogle(selectedAccountTypeParam);
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
        await signInWithEmail(email, password, selectedAccountTypeParam);
      } else if (mode === 'register') {
        if (phone.replace(/\D/g, '').length < 10) {
          setError(
            'Please enter a valid WhatsApp number (at least 10 digits) so OFFNOT ENERGY staff can follow up on you.'
          );
          setLoading(false);
          return;
        }
        if (selectedInstaller && !joinedInstallerGroup) {
          setError(
            'Installers/Dealers must join the OFFNOT ENERGY Installer Network WhatsApp group and confirm below.'
          );
          setLoading(false);
          return;
        }
        setPendingRedirect(true);
        await registerWithEmail(
          name,
          email,
          password,
          phone,
          selectedInstaller ? 'installer' : 'end_user',
          selectedInstaller ? joinedInstallerGroup : false
        );
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
    <div className="max-w-md mx-auto px-4 py-10 sm:py-14">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-5">
          <img
            src={logoUrl}
            alt="OFFNOT ENERGY"
            className="h-14 w-auto object-contain mx-auto mb-3 rounded-lg bg-white p-1"
          />
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {mode === 'login'
              ? 'Customer & Staff Sign In'
              : mode === 'register'
                ? 'Create OFFNOT Account'
                : 'Reset Your Password'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {mode === 'reset'
              ? 'Enter your email address to receive a secure password reset link'
              : 'Automatically routes to Customer Dashboard or your Staff Role Dashboard'}
          </p>
        </div>

        {/* Installer vs Enduser Question */}
        {mode !== 'reset' && (
          <div className="mb-5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/35 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Are you an installer?</p>
              <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">Account Type</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  handleSelectInstallerOption(false);
                  setJoinedInstallerGroup(false);
                }}
                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                  !selectedInstaller
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                No, Enduser
              </button>
              <button
                type="button"
                onClick={() => handleSelectInstallerOption(true)}
                className={`py-2 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                  selectedInstaller
                    ? 'border-orange-600 bg-orange-600 text-white'
                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Yes, Installer/Dealer
              </button>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
              {selectedInstaller
                ? 'Installer/Dealer account selected. Registered installers join the official OFFNOT ENERGY Installer Network.'
                : 'Enduser customer account selected for home and business solar orders.'}
            </p>
          </div>
        )}

        {/* Google Auth (Configured automatically by Firebase) */}
        <button
          type="button"
          disabled={loading}
          onClick={handleGoogle}
          className="w-full py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2.5 transition-colors cursor-pointer mb-5"
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
          <div className="grow border-t border-slate-200 dark:border-slate-800" />
          <span className="shrink mx-3 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase">
            Or Email &amp; Password
          </span>
          <div className="grow border-t border-slate-200 dark:border-slate-800" />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 p-3 space-y-2.5 text-xs text-red-800 dark:text-red-300">
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
                className="inline-flex items-center gap-1 font-bold underline text-red-900 dark:text-red-200"
              >
                Enable Email/Password in Firebase Console
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {info && (
          <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 p-3 flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp Number *
                </label>
                <input
                  required
                  type="tel"
                  minLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 08031234567"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Required so OFFNOT ENERGY staff can follow up on your orders and solar inquiries.
                </p>
              </div>
              {selectedInstaller && (
                <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/40 p-3.5 space-y-2.5 text-xs">
                  <p className="font-bold text-orange-950 dark:text-orange-200 flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-orange-700 dark:text-orange-400 shrink-0" />
                    Join OFFNOT ENERGY Installer Network (Required)
                  </p>
                  <p className="text-orange-900 dark:text-orange-200/90 leading-relaxed">
                    Every Installer/Dealer registering must join the official OFFNOT ENERGY
                    Installer Network WhatsApp group:
                  </p>
                  <a
                    href={INSTALLER_WHATSAPP_GROUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-lg bg-emerald-700 text-white font-bold hover:bg-emerald-800"
                  >
                    Join OFFNOT ENERGY Installer Network
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <label className="flex items-start gap-2 pt-1 text-orange-950 dark:text-orange-200 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={joinedInstallerGroup}
                      onChange={(e) => setJoinedInstallerGroup(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-emerald-700"
                    />
                    <span>I have joined the OFFNOT ENERGY Installer Network WhatsApp group</span>
                  </label>
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
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

        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          {mode === 'login' ? (
            <>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                New customer? Register
              </button>
              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
