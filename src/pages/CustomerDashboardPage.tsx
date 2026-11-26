import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Star,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { ReceiptModal } from '../components/ReceiptModal';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { Order, PageRoute, PaymentRecord } from '../types';
import { buildWhatsAppLink, formatNgn, formatOrderStatusLabel } from '../utils/instalments';

interface CustomerDashboardPageProps {
  onNavigate: (route: PageRoute) => void;
}

export function CustomerDashboardPage({ onNavigate }: CustomerDashboardPageProps) {
  const {
    user,
    profile,
    isStaff,
    savedAddresses,
    logout,
    updateUserProfile,
    addSavedAddress,
    deleteSavedAddress,
  } = useAuth();
  const {
    customerOrders,
    customerPayments,
    customerNotifications,
    storeSettings,
    gatewayConfig,
    logAndSendNotification,
  } = useStore();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'orders' | 'payments' | 'addresses' | 'profile' | 'review'
  >('overview');
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);
  const [payOrderModal, setPayOrderModal] = useState<Order | null>(null);
  const [payAmountNgn, setPayAmountNgn] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'paystack' | 'flutterwave' | 'bank_transfer'>(
    'bank_transfer'
  );
  const [transferRef, setTransferRef] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState('');

  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [orderActionMsg, setOrderActionMsg] = useState('');

  // Profile form state
  const [pName, setPName] = useState(profile?.displayName || user?.displayName || '');
  const [pPhone, setPPhone] = useState(profile?.phone || '');
  const [pAddress, setPAddress] = useState(profile?.defaultAddress || '');
  const [pCity, setPCity] = useState(profile?.defaultCity || 'Ibadan');
  const [pState, setPState] = useState(profile?.defaultState || 'Oyo State');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Address form
  const [addrLabel, setAddrLabel] = useState('Home');
  const [addrRecipient, setAddrRecipient] = useState(profile?.displayName || '');
  const [addrPhone, setAddrPhone] = useState(profile?.phone || '');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrCity, setAddrCity] = useState('Ibadan');
  const [addrState, setAddrState] = useState('Oyo State');
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrError, setAddrError] = useState('');
  const [addrSuccess, setAddrSuccess] = useState('');

  // Review form
  const [revLocation, setRevLocation] = useState('Ibadan, Oyo State');
  const [revProduct, setRevProduct] = useState('OFFNOT 4KVA SOLAR PACKAGE');
  const [revRating, setRevRating] = useState(5);
  const [revQuote, setRevQuote] = useState('');
  const [revBusy, setRevBusy] = useState(false);
  const [revSubmitted, setRevSubmitted] = useState(false);
  const [revError, setRevError] = useState('');

  // Sync profile fields when Firestore profile loads asynchronously
  useEffect(() => {
    if (!profile) return;
    setPName((prev) => prev || profile.displayName || '');
    setPPhone((prev) => prev || profile.phone || '');
    setPAddress((prev) => prev || profile.defaultAddress || '');
    setPCity((prev) => prev || profile.defaultCity || 'Ibadan');
    setPState((prev) => prev || profile.defaultState || 'Oyo State');
    setAddrRecipient((prev) => prev || profile.displayName || '');
    setAddrPhone((prev) => prev || profile.phone || '');
  }, [profile]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-4">
          <User className="w-10 h-10 text-emerald-700 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">Sign In to View My Account</h1>
          <p className="text-sm text-slate-600">
            Track your orders, instalment balances, upcoming payment dates, and download receipts.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
          >
            Sign In / Register
          </button>
        </div>
      </div>
    );
  }

  // Dashboard Metrics
  const activeOrders = customerOrders.filter((o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED');
  const totalPaid = customerOrders.reduce((acc, o) => acc + (o.amountPaidNgn || 0), 0);
  const totalOutstanding = activeOrders.reduce((acc, o) => acc + (o.outstandingBalanceNgn || 0), 0);
  const nextDueOrder = activeOrders.find(
    (o) => o.outstandingBalanceNgn > 0 && o.approvalStatus !== 'PENDING_APPROVAL'
  );
  const totalValueAllActive = activeOrders.reduce((acc, o) => acc + (o.totalAmountNgn || 0), 0);
  const overallProgressPct =
    totalValueAllActive > 0 ? Math.min(100, Math.round((totalPaid / totalValueAllActive) * 100)) : 0;

  const openPayModal = (order: Order) => {
    setPayOrderModal(order);
    const nextPending = order.schedule?.find((s) => s.status === 'PENDING');
    setPayAmountNgn(
      nextPending ? Math.min(order.outstandingBalanceNgn, nextPending.amountNgn) : order.outstandingBalanceNgn
    );
    setPayMethod(
      gatewayConfig.paystackConfigured
        ? 'paystack'
        : gatewayConfig.flutterwaveConfigured
          ? 'flutterwave'
          : 'bank_transfer'
    );
    setTransferRef('');
    setPayMsg('');
  };

  const handleSubmitInstalmentPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrderModal) return;
    setPayMsg('');

    const roundedPayAmount = Math.round(payAmountNgn);
    if (roundedPayAmount <= 0 || roundedPayAmount > payOrderModal.outstandingBalanceNgn) {
      setPayMsg('Payment amount must be greater than ₦0 and not exceed the outstanding balance.');
      return;
    }

    const nextPendingIdx = payOrderModal.schedule?.findIndex((s) => s.status === 'PENDING') ?? 0;
    const instalmentNumber = nextPendingIdx >= 0 ? nextPendingIdx + 1 : 1;

    setPayBusy(true);
    try {
      if (payMethod === 'paystack') {
        const res = await fetch('/api/payments/paystack/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            amountNgn: roundedPayAmount,
            orderId: payOrderModal.id,
            orderNumber: payOrderModal.orderNumber,
            instalmentNumber,
            callbackUrl: window.location.href,
          }),
        });
        const data = (await res.json()) as { authorizationUrl?: string; message?: string };
        if (!res.ok) {
          setPayMsg(
            data.message ||
              'Paystack keys are not configured yet. Please choose Direct Bank Transfer below.'
          );
          setPayBusy(false);
          return;
        }
        if (data.authorizationUrl) {
          sessionStorage.setItem(
            'offnot_pending_paystack',
            JSON.stringify({
              orderId: payOrderModal.id,
              orderNumber: payOrderModal.orderNumber,
              amountNgn: roundedPayAmount,
              instalmentNumber,
            })
          );
          window.location.assign(data.authorizationUrl);
          return;
        }
      }

      if (payMethod === 'flutterwave') {
        const res = await fetch('/api/payments/flutterwave/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            customerName: payOrderModal.customerName,
            amountNgn: roundedPayAmount,
            orderId: payOrderModal.id,
            orderNumber: payOrderModal.orderNumber,
            instalmentNumber,
            callbackUrl: window.location.href,
          }),
        });
        const data = (await res.json()) as { authorizationUrl?: string; message?: string };
        if (!res.ok) {
          setPayMsg(
            data.message ||
              'Flutterwave keys are not configured yet. Please choose Direct Bank Transfer below.'
          );
          setPayBusy(false);
          return;
        }
        if (data.authorizationUrl) {
          sessionStorage.setItem(
            'offnot_pending_flutterwave',
            JSON.stringify({
              orderId: payOrderModal.id,
              orderNumber: payOrderModal.orderNumber,
              amountNgn: roundedPayAmount,
              instalmentNumber,
            })
          );
          window.location.assign(data.authorizationUrl);
          return;
        }
      }

      if (transferRef.trim().length < 4) {
        setPayMsg('Enter your bank transfer reference or sender name for Accounts verification.');
        setPayBusy(false);
        return;
      }

      const paymentId = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      await setDoc(doc(db, 'payments', paymentId), {
        id: paymentId,
        receiptNumber: `RCP-${String(Date.now()).slice(-7)}`,
        reference: transferRef.trim().slice(0, 120),
        orderId: payOrderModal.id,
        orderNumber: payOrderModal.orderNumber,
        userId: user.uid,
        customerName: payOrderModal.customerName,
        customerEmail: payOrderModal.customerEmail,
        amountNgn: roundedPayAmount,
        method: 'bank_transfer',
        channel: 'Direct Bank Transfer',
        status: 'PENDING_VERIFICATION',
        instalmentNumber,
        notes: `Instalment transfer submitted by customer for ${payOrderModal.orderNumber}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'orders', payOrderModal.id), {
        paymentStatus: 'AWAITING_VERIFICATION',
        updatedAt: serverTimestamp(),
      });

      await logAndSendNotification({
        userId: user.uid,
        recipientEmail: user.email || '',
        recipientPhone: payOrderModal.customerPhone,
        type: 'PAYMENT_SUBMITTED',
        title: `Transfer Proof Submitted (${payOrderModal.orderNumber})`,
        message: `Your transfer of ${formatNgn(roundedPayAmount)} (Ref: ${transferRef.trim()}) has been submitted for Accounts Staff verification.`,
        orderId: payOrderModal.id,
      });

      setPayOrderModal(null);
      setOrderActionMsg(`Transfer proof for ${payOrderModal.orderNumber} submitted for verification.`);
    } catch (err) {
      setPayMsg(err instanceof Error ? err.message : 'Unable to submit payment.');
    } finally {
      setPayBusy(false);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    setOrderActionMsg('');
    setCancelBusy(true);
    try {
      await updateDoc(doc(db, 'orders', order.id), {
        orderStatus: 'CANCELLED',
        updatedAt: serverTimestamp(),
      });
      setConfirmCancelOrderId(null);
      setOrderActionMsg(`Order ${order.orderNumber} has been cancelled.`);
    } catch (err) {
      setOrderActionMsg('Unable to cancel order.');
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setCancelBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSaved(false);
    if (!pName.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }
    setProfileSaving(true);
    try {
      await updateUserProfile({
        displayName: pName,
        phone: pPhone,
        defaultAddress: pAddress,
        defaultCity: pCity,
        defaultState: pState,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddrError('');
    setAddrSuccess('');
    const recipient = (addrRecipient || profile?.displayName || '').trim();
    const phone = (addrPhone || profile?.phone || '').trim();
    const street = addrStreet.trim();
    const city = addrCity.trim();
    const state = addrState.trim();

    if (!recipient) {
      setAddrError('Recipient name is required.');
      return;
    }
    if (phone.length < 5) {
      setAddrError('Enter a valid phone number (at least 5 digits).');
      return;
    }
    if (street.length < 3) {
      setAddrError('Enter a valid street address (at least 3 characters).');
      return;
    }
    if (!city || !state) {
      setAddrError('City and state are required.');
      return;
    }

    setAddrBusy(true);
    try {
      await addSavedAddress({
        label: addrLabel.trim() || 'Home',
        recipientName: recipient,
        phone,
        streetAddress: street,
        city,
        state,
      });
      setAddrStreet('');
      setAddrSuccess('Delivery address saved.');
      setTimeout(() => setAddrSuccess(''), 3000);
    } catch (err) {
      setAddrError(err instanceof Error ? err.message : 'Unable to save address.');
    } finally {
      setAddrBusy(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    setAddrError('');
    try {
      await deleteSavedAddress(addressId);
      setAddrSuccess('Address deleted.');
      setTimeout(() => setAddrSuccess(''), 3000);
    } catch (err) {
      setAddrError(err instanceof Error ? err.message : 'Unable to delete address.');
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setRevError('');
    setRevSubmitted(false);
    if (!revLocation.trim() || !revProduct.trim()) {
      setRevError('Please enter your location and the package or product purchased.');
      return;
    }
    if (revQuote.trim().length < 5) {
      setRevError('Please write at least 5 characters for your review.');
      return;
    }
    const id = `rev_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    setRevBusy(true);
    try {
      await setDoc(doc(db, 'reviews', id), {
        id,
        userId: user.uid,
        customerName: (profile?.displayName || user.displayName || 'Verified Customer').trim().slice(0, 120),
        location: revLocation.trim().slice(0, 120),
        packageOrProduct: revProduct.trim().slice(0, 160),
        rating: revRating,
        quote: revQuote.trim().slice(0, 1000),
        isPublished: false,
        createdAt: serverTimestamp(),
      });
      setRevSubmitted(true);
      setRevQuote('');
    } catch (err) {
      setRevError('Unable to submit review.');
      handleFirestoreError(err, OperationType.CREATE, `reviews/${id}`);
    } finally {
      setRevBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase mb-1">
            Customer Portal
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Welcome, {profile?.displayName || user.displayName || user.email}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isStaff && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              Open Staff / Admin Dashboard
            </button>
          )}
          <a
            href={buildWhatsAppLink('Hello OFFNOT ENERGY, I have a question about my account/order.')}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-bold hover:bg-emerald-100"
          >
            <MessageCircle className="w-4 h-4" />
            Contact Customer Service
          </a>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500 font-medium">Total Orders</p>
          <p className="text-2xl font-extrabold text-slate-900 font-mono-num mt-1">
            {customerOrders.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500 font-medium">Total Amount Paid</p>
          <p className="text-2xl font-extrabold text-emerald-800 font-mono-num mt-1">
            {formatNgn(totalPaid)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500 font-medium">Outstanding Balance</p>
          <p className="text-2xl font-extrabold text-orange-700 font-mono-num mt-1">
            {formatNgn(totalOutstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500 font-medium">Next Payment Due</p>
          <p className="text-base font-bold text-slate-900 font-mono-num mt-1.5">
            {nextDueOrder?.nextPaymentDueDate || 'None Due'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs text-slate-500 font-medium">Payment Progress</p>
          <p className="text-2xl font-extrabold text-slate-900 font-mono-num mt-1">
            {overallProgressPct}%
          </p>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-emerald-700 transition-all"
              style={{ width: `${overallProgressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'overview', label: 'Orders & Instalments' },
          { id: 'payments', label: `Payments & Receipts (${customerPayments.length})` },
          { id: 'addresses', label: `Saved Addresses (${savedAddresses.length})` },
          { id: 'profile', label: 'Profile Settings' },
          { id: 'review', label: 'Submit Review' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer ${
              activeTab === t.id
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Orders & Instalments Tab */}
      {(activeTab === 'overview' || activeTab === 'orders') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-5">
            {orderActionMsg && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-900">
                {orderActionMsg}
              </div>
            )}
            {customerOrders.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
                <Package className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-base font-bold text-slate-900">No orders placed yet</p>
                <p className="text-sm text-slate-500">
                  Explore our solar packages with up to 5-month instalments or shop individual
                  products.
                </p>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('packages')}
                    className="px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Browse Solar Packages
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('shop')}
                    className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-800 text-xs font-bold cursor-pointer"
                  >
                    Shop Products
                  </button>
                </div>
              </div>
            ) : (
              customerOrders.map((order) => {
                const progress =
                  order.totalAmountNgn > 0
                    ? Math.min(100, Math.round((order.amountPaidNgn / order.totalAmountNgn) * 100))
                    : 0;
                const canPayNow =
                  order.outstandingBalanceNgn > 0 &&
                  order.approvalStatus !== 'PENDING_APPROVAL' &&
                  order.approvalStatus !== 'REJECTED' &&
                  order.orderStatus !== 'CANCELLED';

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-xs font-mono-num text-slate-500">
                          Order #{order.orderNumber} ·{' '}
                          {order.orderType === 'package_order' ? 'Solar Package' : 'Individual Products'}
                        </p>
                        <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                          {order.packageName ||
                            order.items?.map((i) => `${i.name} (×${i.quantity})`).join(', ')}
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                          Delivery Address: {order.deliveryAddress}
                        </p>
                      </div>
                      <div className="text-left sm:text-right shrink-0">
                        <span
                          className={`inline-block text-xs font-bold px-2.5 py-1 rounded-md ${
                            order.orderStatus === 'COMPLETED' ||
                            order.orderStatus === 'FULLY_PAID_AWAITING_DELIVERY'
                              ? 'bg-emerald-50 text-emerald-800'
                              : order.orderStatus === 'REJECTED' || order.orderStatus === 'CANCELLED'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-orange-50 text-orange-800'
                          }`}
                        >
                          {formatOrderStatusLabel(order.orderStatus)}
                        </span>
                      </div>
                    </div>

                    {/* Financial Progress */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <p className="text-slate-500">Total Amount</p>
                        <p className="text-sm font-bold font-mono-num text-slate-900">
                          {formatNgn(order.totalAmountNgn)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Amount Paid</p>
                        <p className="text-sm font-bold font-mono-num text-emerald-700">
                          {formatNgn(order.amountPaidNgn)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Outstanding</p>
                        <p className="text-sm font-bold font-mono-num text-orange-700">
                          {formatNgn(order.outstandingBalanceNgn)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Payment Plan</p>
                        <p className="text-sm font-bold text-slate-900">
                          {order.paymentPlan === 'full'
                            ? 'Full Payment'
                            : `${order.durationMonths} Months`}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <span>Payment Progress</span>
                        <span className="font-mono-num font-bold">{progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Delivery Lock Notice */}
                    {order.outstandingBalanceNgn > 0 && !order.overrideApplied && (
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 flex items-center gap-2.5 text-xs text-slate-700">
                        <Lock className="w-4 h-4 text-orange-600 shrink-0" />
                        <span>
                          <strong>Delivery Locked:</strong> Delivery and installation will unlock
                          automatically once the remaining {formatNgn(order.outstandingBalanceNgn)}{' '}
                          is paid in full.
                        </span>
                      </div>
                    )}

                    {/* Installation Schedule Notice */}
                    {(order.deliveryScheduledDate || order.installationScheduledDate) && (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2.5 text-xs text-emerald-950">
                        <Calendar className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>
                          <strong>Scheduled:</strong> Delivery on{' '}
                          <span className="font-mono-num">{order.deliveryScheduledDate || 'TBD'}</span>{' '}
                          · Installation on{' '}
                          <span className="font-mono-num">
                            {order.installationScheduledDate || 'TBD'}
                          </span>
                        </span>
                      </div>
                    )}

                    {/* Instalment Schedule Table */}
                    {order.schedule && order.schedule.length > 0 && (
                      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                        {order.schedule.map((s) => (
                          <div
                            key={s.instalmentNumber}
                            className="px-4 py-2.5 flex items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-semibold text-slate-900">{s.label}</span>
                              <span className="text-slate-500 ml-2 font-mono-num">
                                Due {s.dueDate}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold font-mono-num">
                                {formatNgn(s.amountNgn)}
                              </span>
                              <span
                                className={`font-bold ${
                                  s.status === 'PAID' ? 'text-emerald-700' : 'text-orange-700'
                                }`}
                              >
                                {s.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {canPayNow && (
                        <button
                          type="button"
                          onClick={() => openPayModal(order)}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                        >
                          <CreditCard className="w-4 h-4" />
                          {order.paymentPlan === 'instalment'
                            ? 'Pay Next Instalment'
                            : 'Complete Payment'}
                        </button>
                      )}
                      {(order.orderStatus === 'PENDING_APPROVAL' ||
                        order.orderStatus === 'AWAITING_PAYMENT') &&
                        (order.amountPaidNgn || 0) === 0 &&
                        (confirmCancelOrderId === order.id ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              disabled={cancelBusy}
                              onClick={() => handleCancelOrder(order)}
                              className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 cursor-pointer"
                            >
                              {cancelBusy ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                            <button
                              type="button"
                              disabled={cancelBusy}
                              onClick={() => setConfirmCancelOrderId(null)}
                              className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                            >
                              Keep Order
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelOrderId(order.id)}
                            className="px-3.5 py-2.5 rounded-lg border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50 cursor-pointer"
                          >
                            Cancel Order
                          </button>
                        ))}
                      {order.approvalStatus === 'PENDING_APPROVAL' && (
                        <span className="text-xs font-semibold text-amber-800">
                          Awaiting OFFNOT Management Approval before payment starts.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Notifications & Payment Reminders */}
          <div className="lg:col-span-4 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  Notifications &amp; Payment Reminders
                </h3>
              </div>
              {customerNotifications.length === 0 ? (
                <p className="text-xs text-slate-500">No notifications yet.</p>
              ) : (
                <div className="space-y-3 max-h-[480px] overflow-y-auto">
                  {customerNotifications.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs space-y-1"
                    >
                      <p className="font-bold text-slate-900">{n.title}</p>
                      <p className="text-slate-600 leading-relaxed whitespace-pre-line">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payments & Receipts Tab */}
      {activeTab === 'payments' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">Payment History &amp; Receipts</h2>
          </div>
          {customerPayments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No payment records yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Receipt No.</th>
                    <th className="px-6 py-3 font-semibold">Order</th>
                    <th className="px-6 py-3 font-semibold">Method &amp; Ref</th>
                    <th className="px-6 py-3 font-semibold">Amount</th>
                    <th className="px-6 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customerPayments.map((pay) => (
                    <tr key={pay.id}>
                      <td className="px-6 py-3.5 font-mono-num font-semibold text-slate-900">
                        {pay.receiptNumber}
                      </td>
                      <td className="px-6 py-3.5 font-mono-num text-slate-700">
                        {pay.orderNumber}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600">
                        <span className="uppercase font-semibold">{pay.method.replace('_', ' ')}</span>
                        <div className="font-mono-num text-slate-500">{pay.reference}</div>
                      </td>
                      <td className="px-6 py-3.5 font-mono-num font-bold text-emerald-800">
                        {formatNgn(pay.amountNgn)}
                      </td>
                      <td className="px-6 py-3.5 text-xs font-semibold">
                        <span
                          className={
                            pay.status === 'VERIFIED'
                              ? 'text-emerald-700'
                              : pay.status === 'PENDING_VERIFICATION'
                                ? 'text-orange-700'
                                : 'text-red-700'
                          }
                        >
                          {pay.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedReceipt(pay)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Saved Addresses Tab */}
      {activeTab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Saved Delivery Addresses</h2>
            {savedAddresses.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                No saved addresses yet. Add one on the right for faster checkout.
              </div>
            ) : (
              savedAddresses.map((addr) => (
                <div
                  key={addr.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="text-xs font-bold text-emerald-700 uppercase">{addr.label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{addr.recipientName}</p>
                    <p className="text-sm text-slate-600 mt-0.5">
                      {addr.streetAddress}, {addr.city}, {addr.state}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Tel: {addr.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="p-2 text-slate-400 hover:text-red-600 cursor-pointer"
                    aria-label="Delete address"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleAddAddress}
            className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-700" />
              Add New Address
            </h3>
            {addrError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                {addrError}
              </div>
            )}
            {addrSuccess && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {addrSuccess}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={addrLabel}
                onChange={(e) => setAddrLabel(e.target.value)}
                placeholder="Label (Home / Office)"
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              />
              <input
                required
                value={addrPhone}
                onChange={(e) => setAddrPhone(e.target.value)}
                placeholder="Phone"
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <input
              required
              value={addrRecipient}
              onChange={(e) => setAddrRecipient(e.target.value)}
              placeholder="Recipient Name"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
            />
            <AddressAutocomplete value={addrStreet} onChange={setAddrStreet} />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={addrCity}
                onChange={(e) => setAddrCity(e.target.value)}
                placeholder="City"
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              />
              <input
                required
                value={addrState}
                onChange={(e) => setAddrState(e.target.value)}
                placeholder="State"
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={addrBusy}
              className="w-full py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {addrBusy ? 'Saving...' : 'Save Delivery Address'}
            </button>
          </form>
        </div>
      )}

      {/* Profile Settings Tab */}
      {activeTab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">Update Profile Information</h2>
          {profileError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              {profileError}
            </div>
          )}
          {profileSaved && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Profile updated successfully.
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              required
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
            <input
              value={pPhone}
              onChange={(e) => setPPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Default Address</label>
            <input
              value={pAddress}
              onChange={(e) => setPAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={pCity}
              onChange={(e) => setPCity(e.target.value)}
              placeholder="City"
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
            />
            <input
              value={pState}
              onChange={(e) => setPState(e.target.value)}
              placeholder="State"
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={profileSaving}
            className="px-5 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
          >
            {profileSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      )}

      {/* Submit Verified Review Tab */}
      {activeTab === 'review' && (
        <form
          onSubmit={handleSubmitReview}
          className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">Share Your OFFNOT ENERGY Experience</h2>
          <p className="text-xs text-slate-500">
            Submitted reviews are checked by management before appearing publicly on the homepage.
          </p>
          {revError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
              {revError}
            </div>
          )}
          {revSubmitted && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
              Thank you! Your review has been submitted for management approval.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              value={revLocation}
              onChange={(e) => setRevLocation(e.target.value)}
              placeholder="City / Area (e.g. Bodija, Ibadan)"
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
            />
            <input
              required
              value={revProduct}
              onChange={(e) => setRevProduct(e.target.value)}
              placeholder="Package or Product Purchased"
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Rating</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRevRating(n)}
                  className={`p-2 rounded-lg border cursor-pointer ${
                    revRating >= n
                      ? 'border-amber-400 bg-amber-50 text-amber-500'
                      : 'border-slate-200 text-slate-300'
                  }`}
                >
                  <Star className="w-4 h-4 fill-current" />
                </button>
              ))}
            </div>
          </div>
          <textarea
            required
            rows={4}
            value={revQuote}
            onChange={(e) => setRevQuote(e.target.value)}
            placeholder="Tell others about your purchase, instalment plan, or installation..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
          />
          <button
            type="submit"
            disabled={revBusy}
            className="px-5 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
          >
            {revBusy ? 'Submitting...' : 'Submit Review'}
          </button>
        </form>
      )}

      {/* Pay Instalment / Order Modal */}
      {payOrderModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitInstalmentPayment}
            className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Make Payment · {payOrderModal.orderNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Outstanding: {formatNgn(payOrderModal.outstandingBalanceNgn)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayOrderModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Payment Amount (NGN)
              </label>
              <input
                type="number"
                min={100}
                max={payOrderModal.outstandingBalanceNgn}
                value={payAmountNgn}
                onChange={(e) => setPayAmountNgn(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono-num font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer text-xs">
                <input
                  type="radio"
                  checked={payMethod === 'paystack'}
                  onChange={() => setPayMethod('paystack')}
                  className="accent-emerald-700"
                />
                <span>
                  <strong>Paystack Online</strong> (
                  {gatewayConfig.paystackConfigured
                    ? 'Ready'
                    : 'Requires PAYSTACK_SECRET_KEY in Secrets'}
                  )
                </span>
              </label>
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer text-xs">
                <input
                  type="radio"
                  checked={payMethod === 'flutterwave'}
                  onChange={() => setPayMethod('flutterwave')}
                  className="accent-emerald-700"
                />
                <span>
                  <strong>Flutterwave Online</strong> (
                  {gatewayConfig.flutterwaveConfigured
                    ? 'Ready'
                    : 'Requires FLUTTERWAVE_SECRET_KEY in Secrets'}
                  )
                </span>
              </label>
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer text-xs">
                <input
                  type="radio"
                  checked={payMethod === 'bank_transfer'}
                  onChange={() => setPayMethod('bank_transfer')}
                  className="accent-emerald-700"
                />
                <span>
                  <strong>Direct Bank Transfer</strong> (Verified by Accounts Staff)
                </span>
              </label>
            </div>

            {payMethod === 'bank_transfer' && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Building2 className="w-4 h-4 text-emerald-700" />
                  {storeSettings.bankName} · {storeSettings.bankAccountNumber} ({storeSettings.bankAccountName})
                </div>
                <input
                  required
                  value={transferRef}
                  onChange={(e) => setTransferRef(e.target.value)}
                  placeholder="Enter Bank Transfer Reference / Sender Name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                />
              </div>
            )}

            {payMsg && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{payMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={payBusy}
              className="w-full py-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
            >
              {payBusy ? 'Processing...' : `Submit ${formatNgn(payAmountNgn)} Payment`}
            </button>
          </form>
        </div>
      )}

      {selectedReceipt && (
        <ReceiptModal
          payment={selectedReceipt}
          order={customerOrders.find((o) => o.id === selectedReceipt.orderId) || null}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
}
