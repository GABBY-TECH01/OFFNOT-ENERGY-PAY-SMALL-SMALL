import React, { useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { CartDrawer } from './components/CartDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { WhatsAppWidget } from './components/WhatsAppWidget';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { StoreProvider, useStore } from './context/StoreContext';
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
import type { InstalmentScheduleItem, Order, PageRoute, SolarPackage } from './types';
import { formatNgn } from './utils/instalments';

function AppShell() {
  const { user, authReady } = useAuth();
  const { packages, logAndSendNotification } = useStore();
  const [route, setRoute] = useState<PageRoute>('home');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(5);
  const [policyTab, setPolicyTab] = useState<string>('instalment');
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [paymentToast, setPaymentToast] = useState<string | null>(null);

  // Google Maps Case A Quota Banner Listener
  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Paystack Redirect Callback Verification
  useEffect(() => {
    if (!authReady || !user) return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') || params.get('trxref');
    if (!reference) return;

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
            reference,
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

        const paidAmt = data.amountNgn || pending.amountNgn;
        const payId = `pay_${Date.now()}`;
        const receiptNumber = `RCP-${String(Date.now()).slice(-7)}`;

        await setDoc(doc(db, 'payments', payId), {
          id: payId,
          receiptNumber,
          reference,
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

        const newPaid = Math.min(order.totalAmountNgn, (order.amountPaidNgn || 0) + paidAmt);
        const newOutstanding = Math.max(0, order.totalAmountNgn - newPaid);
        const fullyPaid = newOutstanding === 0;

        let remainingCovered = newPaid;
        const updatedSchedule: InstalmentScheduleItem[] | undefined = order.schedule?.map((item) => {
          if (remainingCovered >= item.amountNgn) {
            remainingCovered -= item.amountNgn;
            return {
              ...item,
              status: 'PAID',
              paidAt: item.paidAt || new Date().toISOString().split('T')[0],
              paymentReference: item.paymentReference || reference,
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
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
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

      <main className="flex-1">
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

      <Footer onNavigate={handleNavigate} />
      <CartDrawer onNavigate={handleNavigate} />
      <WhatsAppWidget />
    </div>
  );
}

export default function App() {
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';

  const content = (
    <ErrorBoundary>
      <AuthProvider>
        <CartProvider>
          <StoreProvider>
            <AppShell />
          </StoreProvider>
        </CartProvider>
      </AuthProvider>
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
