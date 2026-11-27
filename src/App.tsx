import React, { useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { CheckCircle2, ExternalLink, MessageCircle } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { BannerSlideshow } from './components/BannerSlideshow';
import { CartDrawer } from './components/CartDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { WhatsAppWidget } from './components/WhatsAppWidget';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider, useCart } from './context/CartContext';
import { StoreProvider, useStore } from './context/StoreContext';
import { ThemeProvider } from './context/ThemeContext';
import { db } from './firebase';
import { AboutPage } from './pages/AboutPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AuthPage } from './pages/AuthPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ContactPage } from './pages/ContactPage';
import { CustomerDashboardPage } from './pages/CustomerDashboardPage';
import { HomePage } from './pages/HomePage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { PackageDetailPage } from './pages/PackageDetailPage';
import { PackagesPage } from './pages/PackagesPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { ServicesPage } from './pages/ServicesPage';
import { ShopPage } from './pages/ShopPage';
import type {
  AccountPricingType,
  InstalmentScheduleItem,
  Order,
  PageRoute,
  SolarPackage,
} from './types';
import { formatNgn, INSTALLER_WHATSAPP_GROUP_URL } from './utils/instalments';

function AppShell() {
  const {
    user,
    profile,
    authReady,
    needsCustomerOnboarding,
    completeCustomerOnboarding,
    logout,
  } = useAuth();
  const { products, packages, logoUrl, faviconUrl, logAndSendNotification } = useStore();
  const { reconcileWithCatalog } = useCart();
  const [route, setRoute] = useState<PageRoute>('home');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(5);
  const [policyTab, setPolicyTab] = useState<string>('instalment');
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [paymentToast, setPaymentToast] = useState<string | null>(null);

  // Customer WhatsApp & Installer Network onboarding completion state
  const [onboardName, setOnboardName] = useState('');
  const [onboardPhone, setOnboardPhone] = useState('');
  const [onboardAccountType, setOnboardAccountType] = useState<AccountPricingType>('end_user');
  const [onboardJoinedGroup, setOnboardJoinedGroup] = useState(false);
  const [onboardError, setOnboardError] = useState('');
  const [savingOnboard, setSavingOnboard] = useState(false);

  // Sync live Firestore product/package edits into cart & active package selection immediately
  useEffect(() => {
    reconcileWithCatalog(products, packages);
  }, [products, packages, reconcileWithCatalog]);

  // Dynamically sync Super-Admin-configured website favicon
  useEffect(() => {
    if (!faviconUrl) return;
    const fav = document.getElementById('app-favicon') as HTMLLinkElement | null;
    if (fav) fav.href = faviconUrl;
    const apple = document.getElementById('app-apple-icon') as HTMLLinkElement | null;
    if (apple) apple.href = faviconUrl;
  }, [faviconUrl]);

  // Pre-fill onboarding modal defaults from profile
  useEffect(() => {
    if (!profile) return;
    setOnboardName((prev) => prev || profile.displayName || user?.displayName || '');
    setOnboardPhone((prev) => prev || profile.phone || '');
    setOnboardAccountType(profile.accountType === 'installer' ? 'installer' : 'end_user');
    setOnboardJoinedGroup(Boolean(profile.installerNetworkJoined));
  }, [profile, user]);

  // Google Maps Case A Quota Banner Listener
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Paystack & Flutterwave Redirect Callback Verification
  useEffect(() => {
    if (!authReady || !user) return;
    const params = new URLSearchParams(window.location.search);

    // 1. Check Paystack return (?reference=... or ?trxref=...)
    const pskReference = params.get('reference') || params.get('trxref');
    if (pskReference) {
      const pendingRaw = sessionStorage.getItem('offnot_pending_paystack');
      if (!pendingRaw) return;

      let pending: {
        orderId: string;
        orderNumber: string;
        amountNgn: number;
        instalmentNumber: number;
      };
      try {
        pending = JSON.parse(pendingRaw);
      } catch {
        sessionStorage.removeItem('offnot_pending_paystack');
        return;
      }

      sessionStorage.removeItem('offnot_pending_paystack');
      window.history.replaceState({}, document.title, window.location.pathname);

      (async () => {
        try {
          const res = await fetch('/api/payments/paystack/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reference: pskReference,
              expectedAmountNgn: pending.amountNgn,
            }),
          });
          const data = (await res.json()) as {
            verified?: boolean;
            amountNgn?: number;
            channel?: string;
            message?: string;
          };

          if (!res.ok || !data.verified) {
            setPaymentToast(data.message || 'Unable to verify Paystack transaction.');
            return;
          }

          const orderRef = doc(db, 'orders', pending.orderId);
          const orderSnap = await getDoc(orderRef);
          if (!orderSnap.exists()) return;
          const order = orderSnap.data() as Order;

          const paidAmt = Math.round(data.amountNgn || pending.amountNgn);
          const payId = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const receiptNumber = `RCP-${String(Date.now()).slice(-7)}`;

          await setDoc(doc(db, 'payments', payId), {
            id: payId,
            receiptNumber,
            reference: pskReference,
            orderId: order.id,
            orderNumber: order.orderNumber,
            userId: user.uid,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            amountNgn: paidAmt,
            method: 'paystack',
            channel: data.channel || 'Paystack Online',
            status: 'VERIFIED',
            instalmentNumber: pending.instalmentNumber || 1,
            notes: 'Server-verified Paystack payment',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const totalNgn = Math.round(order.totalAmountNgn || 0);
          const newPaid = Math.min(totalNgn, Math.round(order.amountPaidNgn || 0) + paidAmt);
          const newOutstanding = Math.max(0, totalNgn - newPaid);
          const fullyPaid = newOutstanding === 0;

          let remainingCovered = newPaid;
          const updatedSchedule: InstalmentScheduleItem[] | undefined = order.schedule?.map((item) => {
            if (remainingCovered >= item.amountNgn) {
              remainingCovered -= item.amountNgn;
              return {
                ...item,
                status: 'PAID',
                paidAt: item.paidAt || new Date().toISOString().split('T')[0],
                paymentReference: item.paymentReference || pskReference,
              };
            }
            return item;
          });

          const nextPending = updatedSchedule?.find((s) => s.status !== 'PAID');
          const nextDueDate = fullyPaid ? '' : nextPending?.dueDate || order.nextPaymentDueDate || '';

          await updateDoc(orderRef, {
            amountPaidNgn: newPaid,
            outstandingBalanceNgn: newOutstanding,
            paymentStatus: fullyPaid ? 'FULLY_PAID' : 'PARTIALLY_PAID',
            orderStatus: fullyPaid ? 'FULLY_PAID_AWAITING_DELIVERY' : 'IN_INSTALMENT',
            ...(updatedSchedule ? { schedule: updatedSchedule } : {}),
            nextPaymentDueDate: nextDueDate,
            updatedAt: serverTimestamp(),
          });

          await logAndSendNotification({
            userId: user.uid,
            recipientEmail: order.customerEmail,
            recipientPhone: order.customerPhone,
            type: fullyPaid ? 'FULL_PAYMENT_COMPLETED' : 'PAYMENT_VERIFIED',
            title: `Payment Confirmed (${receiptNumber})`,
            message: fullyPaid
              ? `Your Paystack payment of ${formatNgn(paidAmt)} is verified. Order ${order.orderNumber} is now FULLY PAID – AWAITING DELIVERY.`
              : `Your Paystack instalment payment of ${formatNgn(paidAmt)} is verified. Remaining balance: ${formatNgn(newOutstanding)}.`,
            orderId: order.id,
          });

          setPaymentToast(
            `Payment verified (${receiptNumber}). Order ${order.orderNumber} updated.`
          );
          setRoute('account');
        } catch (err) {
          setPaymentToast(err instanceof Error ? err.message : 'Payment verification error.');
        }
      })();
      return;
    }

    // 2. Check Flutterwave return (?status=...&tx_ref=...&transaction_id=...)
    const flwTxRef = params.get('tx_ref');
    const flwStatus = params.get('status');
    const flwTransactionId = params.get('transaction_id');
    if (flwTxRef || flwTransactionId) {
      const pendingRaw = sessionStorage.getItem('offnot_pending_flutterwave');
      if (!pendingRaw) return;

      let pending: {
        orderId: string;
        orderNumber: string;
        amountNgn: number;
        instalmentNumber: number;
      };
      try {
        pending = JSON.parse(pendingRaw);
      } catch {
        sessionStorage.removeItem('offnot_pending_flutterwave');
        return;
      }

      sessionStorage.removeItem('offnot_pending_flutterwave');
      window.history.replaceState({}, document.title, window.location.pathname);

      if (flwStatus === 'cancelled' || !flwTransactionId) {
        setPaymentToast('Flutterwave checkout was cancelled. You can retry payment anytime from My Account.');
        setRoute('account');
        return;
      }

      (async () => {
        try {
          const res = await fetch('/api/payments/flutterwave/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transactionId: flwTransactionId,
              expectedAmountNgn: pending.amountNgn,
            }),
          });
          const data = (await res.json()) as {
            verified?: boolean;
            reference?: string;
            amountNgn?: number;
            channel?: string;
            message?: string;
          };

          if (!res.ok || !data.verified) {
            setPaymentToast(data.message || 'Unable to verify Flutterwave transaction.');
            setRoute('account');
            return;
          }

          const orderRef = doc(db, 'orders', pending.orderId);
          const orderSnap = await getDoc(orderRef);
          if (!orderSnap.exists()) return;
          const order = orderSnap.data() as Order;

          const paidAmt = Math.round(data.amountNgn || pending.amountNgn);
          const flwRef = data.reference || flwTxRef || String(flwTransactionId);
          const payId = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const receiptNumber = `RCP-${String(Date.now()).slice(-7)}`;

          await setDoc(doc(db, 'payments', payId), {
            id: payId,
            receiptNumber,
            reference: flwRef.slice(0, 120),
            orderId: order.id,
            orderNumber: order.orderNumber,
            userId: user.uid,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            amountNgn: paidAmt,
            method: 'flutterwave',
            channel: data.channel || 'Flutterwave Online',
            status: 'VERIFIED',
            instalmentNumber: pending.instalmentNumber || 1,
            notes: 'Server-verified Flutterwave payment',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const totalNgn = Math.round(order.totalAmountNgn || 0);
          const newPaid = Math.min(totalNgn, Math.round(order.amountPaidNgn || 0) + paidAmt);
          const newOutstanding = Math.max(0, totalNgn - newPaid);
          const fullyPaid = newOutstanding === 0;

          let remainingCovered = newPaid;
          const updatedSchedule: InstalmentScheduleItem[] | undefined = order.schedule?.map((item) => {
            if (remainingCovered >= item.amountNgn) {
              remainingCovered -= item.amountNgn;
              return {
                ...item,
                status: 'PAID',
                paidAt: item.paidAt || new Date().toISOString().split('T')[0],
                paymentReference: item.paymentReference || flwRef,
              };
            }
            return item;
          });

          const nextPending = updatedSchedule?.find((s) => s.status !== 'PAID');
          const nextDueDate = fullyPaid ? '' : nextPending?.dueDate || order.nextPaymentDueDate || '';

          await updateDoc(orderRef, {
            amountPaidNgn: newPaid,
            outstandingBalanceNgn: newOutstanding,
            paymentStatus: fullyPaid ? 'FULLY_PAID' : 'PARTIALLY_PAID',
            orderStatus: fullyPaid ? 'FULLY_PAID_AWAITING_DELIVERY' : 'IN_INSTALMENT',
            ...(updatedSchedule ? { schedule: updatedSchedule } : {}),
            nextPaymentDueDate: nextDueDate,
            updatedAt: serverTimestamp(),
          });

          await logAndSendNotification({
            userId: user.uid,
            recipientEmail: order.customerEmail,
            recipientPhone: order.customerPhone,
            type: fullyPaid ? 'FULL_PAYMENT_COMPLETED' : 'PAYMENT_VERIFIED',
            title: `Payment Confirmed (${receiptNumber})`,
            message: fullyPaid
              ? `Your Flutterwave payment of ${formatNgn(paidAmt)} is verified. Order ${order.orderNumber} is now FULLY PAID – AWAITING DELIVERY.`
              : `Your Flutterwave instalment payment of ${formatNgn(paidAmt)} is verified. Remaining balance: ${formatNgn(newOutstanding)}.`,
            orderId: order.id,
          });

          setPaymentToast(
            `Payment verified (${receiptNumber}). Order ${order.orderNumber} updated.`
          );
          setRoute('account');
        } catch (err) {
          setPaymentToast(err instanceof Error ? err.message : 'Flutterwave verification error.');
        }
      })();
    }
  }, [authReady, user]);

  const handleNavigate = (nextRoute: PageRoute, section?: string) => {
    if (nextRoute === 'policies' && section) {
      setPolicyTab(section);
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectPackage = (pkg: SolarPackage, duration = 5) => {
    setSelectedPackageId(pkg.id);
    setSelectedDuration(duration);
    setRoute('package-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activePackage =
    packages.find((p) => p.id === selectedPackageId) || packages[0] || null;

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 overflow-x-clip">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 dark:text-amber-100 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {paymentToast && (
        <div className="bg-emerald-900 text-white px-4 py-2.5 text-xs sm:text-sm flex items-center justify-center gap-4">
          <span>{paymentToast}</span>
          <button
            type="button"
            onClick={() => setPaymentToast(null)}
            className="underline font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <Header currentRoute={route} onNavigate={handleNavigate} />
      <BannerSlideshow currentRoute={route} onNavigate={handleNavigate} />

      <main className="flex-1 min-w-0">
        {route === 'home' && (
          <HomePage onNavigate={handleNavigate} onSelectPackage={handleSelectPackage} />
        )}
        {route === 'shop' && <ShopPage onNavigate={handleNavigate} />}
        {route === 'packages' && <PackagesPage onSelectPackage={handleSelectPackage} />}
        {route === 'package-detail' && activePackage && (
          <PackageDetailPage
            pkg={activePackage}
            initialDuration={selectedDuration}
            onNavigate={handleNavigate}
          />
        )}
        {route === 'how-it-works' && <HowItWorksPage onNavigate={handleNavigate} />}
        {route === 'services' && <ServicesPage />}
        {route === 'about' && <AboutPage onNavigate={handleNavigate} />}
        {route === 'contact' && <ContactPage />}
        {route === 'policies' && <PoliciesPage initialTab={policyTab} />}
        {route === 'checkout' && <CheckoutPage onNavigate={handleNavigate} />}
        {route === 'auth' && <AuthPage onNavigate={handleNavigate} />}
        {route === 'account' && <CustomerDashboardPage onNavigate={handleNavigate} />}
        {route === 'admin' && <AdminDashboardPage onNavigate={handleNavigate} />}
      </main>

      <Footer currentRoute={route} onNavigate={handleNavigate} />
      <CartDrawer onNavigate={handleNavigate} />
      {route !== 'admin' && <WhatsAppWidget />}

      {/* Mandatory Customer WhatsApp & Installer Network Onboarding Modal */}
      {needsCustomerOnboarding && profile && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setOnboardError('');
              const trimmedPhone = onboardPhone.trim();
              if (trimmedPhone.replace(/\D/g, '').length < 10) {
                setOnboardError(
                  'Please enter a valid WhatsApp number (at least 10 digits) so OFFNOT ENERGY staff can follow up on you.'
                );
                return;
              }
              if (onboardAccountType === 'installer' && !onboardJoinedGroup) {
                setOnboardError(
                  'Installers/Dealers must join the OFFNOT ENERGY Installer Network WhatsApp group and confirm below to continue.'
                );
                return;
              }
              setSavingOnboard(true);
              try {
                await completeCustomerOnboarding({
                  displayName:
                    onboardName.trim() ||
                    profile.displayName ||
                    user?.displayName ||
                    user?.email?.split('@')[0] ||
                    'OFFNOT Customer',
                  phone: trimmedPhone,
                  accountType: onboardAccountType,
                  installerNetworkJoined:
                    onboardAccountType === 'installer' ? onboardJoinedGroup : false,
                });
              } catch (err) {
                setOnboardError(
                  err instanceof Error ? err.message : 'Unable to save your onboarding details.'
                );
              } finally {
                setSavingOnboard(false);
              }
            }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto"
          >
            <div className="text-center">
              <div className="inline-block bg-white rounded-xl p-1.5 mb-2">
                <img
                  src={logoUrl}
                  alt="OFFNOT ENERGY"
                  className="h-12 w-auto object-contain mx-auto"
                />
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Complete Your OFFNOT ENERGY Profile
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Enter your WhatsApp number so our team can follow up on your orders, quotes, and
                solar installations.
              </p>
            </div>

            {onboardError && (
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/60 p-3 text-xs font-semibold text-red-800 dark:text-red-200">
                {onboardError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Full Name *
              </label>
              <input
                required
                value={onboardName}
                onChange={(e) => setOnboardName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                WhatsApp Number *
              </label>
              <input
                required
                type="tel"
                minLength={10}
                value={onboardPhone}
                onChange={(e) => setOnboardPhone(e.target.value)}
                placeholder="e.g. 08031234567"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm"
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2.5">
              <p className="text-xs font-bold text-slate-900 dark:text-white">Are you an installer?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOnboardAccountType('end_user');
                    setOnboardJoinedGroup(false);
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                    onboardAccountType === 'end_user'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  No, Enduser
                </button>
                <button
                  type="button"
                  onClick={() => setOnboardAccountType('installer')}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                    onboardAccountType === 'installer'
                      ? 'border-orange-600 bg-orange-600 text-white'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Yes, Installer/Dealer
                </button>
              </div>
            </div>

            {onboardAccountType === 'installer' && (
              <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/40 p-3.5 space-y-2.5 text-xs">
                <p className="font-bold text-orange-950 dark:text-orange-200 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-orange-700 dark:text-orange-400 shrink-0" />
                  OFFNOT ENERGY Installer Network (Required)
                </p>
                <p className="text-orange-900 dark:text-orange-200 leading-relaxed">
                  All Installer/Dealer accounts must join the official OFFNOT ENERGY Installer
                  Network WhatsApp group before completing registration.
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
                <label className="flex items-start gap-2 pt-1 text-orange-950 dark:text-orange-100 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onboardJoinedGroup}
                    onChange={(e) => setOnboardJoinedGroup(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-emerald-700"
                  />
                  <span>I have joined the OFFNOT ENERGY Installer Network WhatsApp group</span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={savingOnboard}
              className="w-full py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {savingOnboard ? 'Saving Details...' : 'Save & Continue'}
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
            >
              Sign Out &amp; Switch Account
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';

  const content = (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <StoreProvider>
            <CartProvider>
              <AppShell />
            </CartProvider>
          </StoreProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );

  if (mapsApiKey) {
    return (
      <APIProvider
        apiKey={mapsApiKey}
        language="en"
        region="NG"
        libraries={['places', 'marker']}
      >
        {content}
      </APIProvider>
    );
  }

  return content;
}
