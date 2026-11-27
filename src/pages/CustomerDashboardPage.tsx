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
  RotateCcw,
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
    customerRefunds,
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

  const [refundOrderModal, setRefundOrderModal] = useState<Order | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundBankName, setRefundBankName] = useState('');
  const [refundAccountNumber, setRefundAccountNumber] = useState('');
  const [refundAccountName, setRefundAccountName] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState('');

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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-4">
          <User className="w-10 h-10 text-emerald-700 dark:text-emerald-400 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sign In to View My Account</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Track your orders, instalment balances, upcoming payment dates, refund requests, and download receipts.
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
  const activeOrders = customerOrders.filter(
    (o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED' && o.orderStatus !== 'REFUNDED'
  );
  const totalPaid = customerOrders.reduce((acc, o) => acc + (o.amountPaidNgn || 0), 0);
  const totalOutstanding = activeOrders.reduce((acc, o) => acc + (o.outstandingBalanceNgn || 0), 0);
  const nextDueOrder = activeOrders.find(
    (o) =>
      o.outstandingBalanceNgn > 0 &&
      o.approvalStatus !== 'PENDING_APPROVAL' &&
      o.orderStatus !== 'REFUND_REQUESTED'
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

  const openRefundModal = (order: Order) => {
    setRefundOrderModal(order);
    setRefundReason('');
    setRefundBankName('');
    setRefundAccountNumber('');
    setRefundAccountName(profile?.displayName || order.customerName || '');
    setRefundError('');
  };

  const handleSubmitRefundRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundOrderModal || !user || refundBusy) return;
    setRefundError('');

    const cleanReason = refundReason.trim();
    const cleanBank = refundBankName.trim();
    const cleanAccNum = refundAccountNumber.trim();
    const cleanAccName = refundAccountName.trim();

    if (cleanReason.length < 5) {
      setRefundError('Please enter a refund reason (at least 5 characters).');
      return;
    }
    if (cleanBank.length < 2) {
      setRefundError('Please enter your destination bank name.');
      return;
    }
    if (cleanAccNum.length < 5) {
      setRefundError('Please enter a valid bank account number.');
      return;
    }
    if (cleanAccName.length < 2) {
      setRefundError('Please enter the bank account holder name.');
      return;
    }

    const amountRequestedNgn = Math.round(refundOrderModal.amountPaidNgn || 0);
    if (amountRequestedNgn <= 0) {
      setRefundError('Only orders with verified payments can request a refund.');
      return;
    }

    const refundId = `ref_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const nowIso = new Date().toISOString();

    setRefundBusy(true);
    try {
      await setDoc(doc(db, 'refunds', refundId), {
        id: refundId,
        orderId: refundOrderModal.id,
        orderNumber: refundOrderModal.orderNumber,
        userId: user.uid,
        customerName: (profile?.displayName || refundOrderModal.customerName || 'Customer')
          .trim()
          .slice(0, 120),
        customerEmail: (user.email || refundOrderModal.customerEmail).trim().slice(0, 160),
        customerPhone: (refundOrderModal.customerPhone || profile?.phone || '').trim().slice(0, 32),
        amountRequestedNgn,
        reason: cleanReason.slice(0, 1000),
        bankName: cleanBank.slice(0, 120),
        accountNumber: cleanAccNum.slice(0, 30),
        accountName: cleanAccName.slice(0, 160),
        status: 'REQUESTED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'orders', refundOrderModal.id), {
        refundStatus: 'REQUESTED',
        refundAmountNgn: amountRequestedNgn,
        refundRequestedAt: nowIso,
        refundNotes: cleanReason.slice(0, 1000),
        orderStatus: 'REFUND_REQUESTED',
        updatedAt: serverTimestamp(),
      });

      await logAndSendNotification({
        userId: user.uid,
        recipientEmail: user.email || refundOrderModal.customerEmail,
        recipientPhone: refundOrderModal.customerPhone,
        type: 'REFUND_REQUESTED',
        title: `Refund Request Submitted (${refundOrderModal.orderNumber})`,
        message: `Your refund request of ${formatNgn(amountRequestedNgn)} for order ${refundOrderModal.orderNumber} has been logged for Accounts & Management review. Refund bank: ${cleanBank} (${cleanAccNum}).`,
        orderId: refundOrderModal.id,
      });

      setOrderActionMsg(
        `Refund request of ${formatNgn(amountRequestedNgn)} submitted for ${refundOrderModal.orderNumber}.`
      );
      setRefundOrderModal(null);
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : 'Unable to submit refund request.');
      handleFirestoreError(err, OperationType.CREATE, `refunds/${refundId}`);
    } finally {
      setRefundBusy(false);
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
    if (pPhone.replace(/\D/g, '').length < 10) {
      setProfileError('Please enter a valid WhatsApp / phone number (at least 10 digits).');
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <p className="text-xs font-bold tracking-wider text-emerald-700 dark:text-emerald-400 uppercase mb-1">
            Customer Portal
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white break-words">
            Welcome, {profile?.displayName || user.displayName || user.email}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all">{user.email}</p>
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
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
          >
            <MessageCircle className="w-4 h-4" />
            Contact Customer Service
          </a>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Orders</p>
          <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono-num mt-1">
            {customerOrders.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Amount Paid</p>
          <p className="text-xl sm:text-2xl font-extrabold text-emerald-800 dark:text-emerald-400 font-mono-num mt-1">
            {formatNgn(totalPaid)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Outstanding Balance</p>
          <p className="text-xl sm:text-2xl font-extrabold text-orange-700 dark:text-orange-400 font-mono-num mt-1">
            {formatNgn(totalOutstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Next Payment Due</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-mono-num mt-1.5">
            {nextDueOrder?.nextPaymentDueDate || 'None Due'}
          </p>
        </div>
        <div className="col-span-2 lg:col-span-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Payment Progress</p>
          <p className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white font-mono-num mt-1">
            {overallProgressPct}%
          </p>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-emerald-700 transition-all"
              style={{ width: `${overallProgressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'overview', label: 'Orders & Instalments' },
          {
            id: 'payments',
            label: `Payments, Receipts & Refunds (${customerPayments.length}${
              customerRefunds.length > 0 ? ` · ${customerRefunds.length} Refund` : ''
            })`,
          },
          { id: 'addresses', label: `Saved Addresses (${savedAddresses.length})` },
          { id: 'profile', label: 'Profile Settings' },
          { id: 'review', label: 'Submit Review' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as typeof activeTab)}
            className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold cursor-pointer ${
              activeTab === t.id
                ? 'bg-emerald-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Orders & Instalments Tab */}
      {(activeTab === 'overview' || activeTab === 'orders') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          <div className="lg:col-span-8 space-y-5">
            {orderActionMsg && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-900 dark:text-emerald-200">
                {orderActionMsg}
              </div>
            )}
            {customerOrders.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 text-center space-y-3">
                <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-base font-bold text-slate-900 dark:text-white">No orders placed yet</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Explore our solar packages with up to 5-month instalments or shop individual
                  products.
                </p>
                <div className="flex flex-wrap justify-center gap-3 pt-2">
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
                    className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
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
                  order.orderStatus !== 'CANCELLED' &&
                  order.orderStatus !== 'REFUNDED' &&
                  order.orderStatus !== 'REFUND_REQUESTED';
                const canRequestRefund =
                  (order.amountPaidNgn || 0) > 0 &&
                  !['CANCELLED', 'REJECTED', 'REFUNDED', 'REFUND_REQUESTED'].includes(
                    order.orderStatus
                  ) &&
                  (!order.refundStatus ||
                    order.refundStatus === 'NONE' ||
                    order.refundStatus === 'DECLINED');

                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div className="min-w-0">
                        <p className="text-xs font-mono-num text-slate-500 dark:text-slate-400">
                          Order #{order.orderNumber} ·{' '}
                          {order.orderType === 'package_order' ? 'Solar Package' : 'Individual Products'}
                        </p>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 break-words">
                          {order.packageName ||
                            order.items?.map((i) => `${i.name} (×${i.quantity})`).join(', ')}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-words">
                          Delivery Address: {order.deliveryAddress}
                        </p>
                      </div>
                      <div className="text-left sm:text-right shrink-0 flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5">
                        <span
                          className={`inline-block text-xs font-bold px-2.5 py-1 rounded-md ${
                            order.orderStatus === 'COMPLETED' ||
                            order.orderStatus === 'FULLY_PAID_AWAITING_DELIVERY'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : order.orderStatus === 'REJECTED' ||
                                  order.orderStatus === 'CANCELLED' ||
                                  order.orderStatus === 'REFUNDED'
                                ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                                : order.orderStatus === 'REFUND_REQUESTED'
                                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                                  : 'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300'
                          }`}
                        >
                          {formatOrderStatusLabel(order.orderStatus)}
                        </span>
                        {order.refundStatus && order.refundStatus !== 'NONE' && (
                          <span
                            className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded ${
                              order.refundStatus === 'REFUNDED'
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : order.refundStatus === 'DECLINED'
                                  ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            Refund: {order.refundStatus}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Financial Progress */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Total Amount</p>
                        <p className="text-sm font-bold font-mono-num text-slate-900 dark:text-white">
                          {formatNgn(order.totalAmountNgn)}
                        </p>
                        {(order.instalmentSurchargeNgn || 0) > 0 && (
                          <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-0.5">
                            Incl. {formatNgn(order.instalmentSurchargeNgn || 0)} instalment fee
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Amount Paid</p>
                        <p className="text-sm font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
                          {formatNgn(order.amountPaidNgn)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Outstanding</p>
                        <p className="text-sm font-bold font-mono-num text-orange-700 dark:text-orange-400">
                          {formatNgn(order.outstandingBalanceNgn)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Payment Plan</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {order.paymentPlan === 'full'
                            ? 'Full Payment'
                            : `${order.durationMonths} Months`}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                        <span>Payment Progress</span>
                        <span className="font-mono-num font-bold">{progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Refund Status Notice */}
                    {order.refundStatus && order.refundStatus !== 'NONE' && (
                      <div className="rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 p-3 flex items-start gap-2.5 text-xs text-rose-950 dark:text-rose-200">
                        <RotateCcw className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-bold">
                            Refund Status: {order.refundStatus}
                            {order.refundAmountNgn
                              ? ` · Amount: ${formatNgn(order.refundAmountNgn)}`
                              : ''}
                          </p>
                          {order.refundNotes && (
                            <p className="text-rose-900 dark:text-rose-300">{order.refundNotes}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Delivery Lock Notice */}
                    {order.outstandingBalanceNgn > 0 &&
                      !order.overrideApplied &&
                      order.orderStatus !== 'REFUNDED' &&
                      order.orderStatus !== 'REFUND_REQUESTED' && (
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                          <Lock className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                          <span>
                            <strong>Delivery Locked:</strong> Delivery and installation will unlock
                            automatically once the remaining {formatNgn(order.outstandingBalanceNgn)}{' '}
                            is paid in full.
                          </span>
                        </div>
                      )}

                    {/* Installation Schedule Notice */}
                    {(order.deliveryScheduledDate || order.installationScheduledDate) && (
                      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 flex items-center gap-2.5 text-xs text-emerald-950 dark:text-emerald-200">
                        <Calendar className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
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
                      <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {order.schedule.map((s) => (
                          <div
                            key={s.instalmentNumber}
                            className="px-4 py-2.5 flex items-center justify-between gap-2"
                          >
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-white">{s.label}</span>
                              <span className="text-slate-500 dark:text-slate-400 ml-2 font-mono-num">
                                Due {s.dueDate}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold font-mono-num text-slate-900 dark:text-white">
                                {formatNgn(s.amountNgn)}
                              </span>
                              <span
                                className={`font-bold ${
                                  s.status === 'PAID'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-orange-700 dark:text-orange-400'
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
                      {canRequestRefund && (
                        <button
                          type="button"
                          onClick={() => openRefundModal(order)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Request Refund
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
                              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              Keep Order
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmCancelOrderId(order.id)}
                            className="px-3.5 py-2.5 rounded-lg border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          >
                            Cancel Order
                          </button>
                        ))}
                      {order.approvalStatus === 'PENDING_APPROVAL' && (
                        <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
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
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Notifications &amp; Payment Reminders
                </h3>
              </div>
              {customerNotifications.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No notifications yet.</p>
              ) : (
                <div className="space-y-3 max-h-[480px] overflow-y-auto">
                  {customerNotifications.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3 text-xs space-y-1"
                    >
                      <p className="font-bold text-slate-900 dark:text-white">{n.title}</p>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {n.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payments, Receipts & Refunds Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Payment History &amp; Receipts
              </h2>
            </div>
            {customerPayments.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No payment records yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[620px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Receipt No.</th>
                      <th className="px-6 py-3 font-semibold">Order</th>
                      <th className="px-6 py-3 font-semibold">Method &amp; Ref</th>
                      <th className="px-6 py-3 font-semibold">Amount</th>
                      <th className="px-6 py-3 font-semibold">Status</th>
                      <th className="px-6 py-3 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {customerPayments.map((pay) => (
                      <tr key={pay.id}>
                        <td className="px-6 py-3.5 font-mono-num font-semibold text-slate-900 dark:text-white">
                          {pay.receiptNumber}
                        </td>
                        <td className="px-6 py-3.5 font-mono-num text-slate-700 dark:text-slate-300">
                          {pay.orderNumber}
                        </td>
                        <td className="px-6 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                          <span className="uppercase font-semibold">{pay.method.replace('_', ' ')}</span>
                          <div className="font-mono-num text-slate-500 dark:text-slate-400">
                            {pay.reference}
                          </div>
                        </td>
                        <td className="px-6 py-3.5 font-mono-num font-bold text-emerald-800 dark:text-emerald-400">
                          {formatNgn(pay.amountNgn)}
                        </td>
                        <td className="px-6 py-3.5 text-xs font-semibold">
                          <span
                            className={
                              pay.status === 'VERIFIED'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : pay.status === 'PENDING_VERIFICATION'
                                  ? 'text-orange-700 dark:text-orange-400'
                                  : 'text-red-700 dark:text-red-400'
                            }
                          >
                            {pay.status}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedReceipt(pay)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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

          {/* My Refund Requests */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                My Refund Requests ({customerRefunds.length})
              </h2>
            </div>
            {customerRefunds.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No refund requests submitted. You can request a refund directly on any paid order in
                the Orders &amp; Instalments tab.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {customerRefunds.map((refReq) => (
                  <div key={refReq.id} className="p-5 sm:px-6 space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                          Order #{refReq.orderNumber}
                        </span>
                        <span className="ml-2 font-mono-num font-extrabold text-rose-700 dark:text-rose-400">
                          {formatNgn(refReq.amountRequestedNgn)}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-md font-bold ${
                          refReq.status === 'REFUNDED'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : refReq.status === 'DECLINED'
                              ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                              : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        {refReq.status}
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">
                      <strong>Reason:</strong> {refReq.reason}
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">
                      <strong>Destination Bank:</strong> {refReq.bankName} · {refReq.accountNumber} (
                      {refReq.accountName})
                    </p>
                    {(refReq.refundReference || refReq.adminNotes) && (
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-2.5 text-slate-700 dark:text-slate-200 space-y-0.5">
                        {refReq.refundReference && (
                          <p>
                            <strong>Refund Reference:</strong>{' '}
                            <span className="font-mono-num">{refReq.refundReference}</span>
                          </p>
                        )}
                        {refReq.adminNotes && (
                          <p>
                            <strong>Accounts Note:</strong> {refReq.adminNotes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Saved Addresses Tab */}
      {activeTab === 'addresses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Saved Delivery Addresses
            </h2>
            {savedAddresses.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400">
                No saved addresses yet. Add one on the right for faster checkout.
              </div>
            ) : (
              savedAddresses.map((addr) => (
                <div
                  key={addr.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                      {addr.label}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {addr.recipientName}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                      {addr.streetAddress}, {addr.city}, {addr.state}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Tel: {addr.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
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
            className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
              Add New Address
            </h3>
            {addrError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
                {addrError}
              </div>
            )}
            {addrSuccess && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {addrSuccess}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                required
                value={addrLabel}
                onChange={(e) => setAddrLabel(e.target.value)}
                placeholder="Label (Home / Office)"
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
              />
              <input
                required
                value={addrPhone}
                onChange={(e) => setAddrPhone(e.target.value)}
                placeholder="Phone"
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
              />
            </div>
            <input
              required
              value={addrRecipient}
              onChange={(e) => setAddrRecipient(e.target.value)}
              placeholder="Recipient Name"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
            />
            <AddressAutocomplete value={addrStreet} onChange={setAddrStreet} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                required
                value={addrCity}
                onChange={(e) => setAddrCity(e.target.value)}
                placeholder="City"
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
              />
              <input
                required
                value={addrState}
                onChange={(e) => setAddrState(e.target.value)}
                placeholder="State"
                className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
          className="max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Update Profile Information
          </h2>
          {profileError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
              {profileError}
            </div>
          )}
          {profileSaved && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Profile updated successfully.
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Full Name
            </label>
            <input
              required
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              WhatsApp / Phone Number *
            </label>
            <input
              required
              type="tel"
              minLength={10}
              value={pPhone}
              onChange={(e) => setPPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Default Address
            </label>
            <input
              value={pAddress}
              onChange={(e) => setPAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={pCity}
              onChange={(e) => setPCity(e.target.value)}
              placeholder="City"
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
            />
            <input
              value={pState}
              onChange={(e) => setPState(e.target.value)}
              placeholder="State"
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
          className="max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Share Your OFFNOT ENERGY Experience
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Submitted reviews are checked by management before appearing publicly on the homepage.
          </p>
          {revError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
              {revError}
            </div>
          )}
          {revSubmitted && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-300">
              Thank you! Your review has been submitted for management approval.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              value={revLocation}
              onChange={(e) => setRevLocation(e.target.value)}
              placeholder="City / Area (e.g. Bodija, Ibadan)"
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
            />
            <input
              required
              value={revProduct}
              onChange={(e) => setRevProduct(e.target.value)}
              placeholder="Package or Product Purchased"
              className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Rating
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRevRating(n)}
                  className={`p-2 rounded-lg border cursor-pointer ${
                    revRating >= n
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/50 text-amber-500'
                      : 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600'
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
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitInstalmentPayment}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Make Payment · {payOrderModal.orderNumber}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Outstanding: {formatNgn(payOrderModal.outstandingBalanceNgn)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayOrderModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Amount (NGN)
              </label>
              <input
                type="number"
                min={100}
                max={payOrderModal.outstandingBalanceNgn}
                value={payAmountNgn}
                onChange={(e) => setPayAmountNgn(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num font-bold"
              />
            </div>

            <div className="space-y-2 text-slate-800 dark:text-slate-200">
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-xs">
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
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-xs">
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
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-xs">
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
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3.5 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                  <Building2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  {storeSettings.bankName} · {storeSettings.bankAccountNumber} ({storeSettings.bankAccountName})
                </div>
                <input
                  required
                  value={transferRef}
                  onChange={(e) => setTransferRef(e.target.value)}
                  placeholder="Enter Bank Transfer Reference / Sender Name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>
            )}

            {payMsg && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
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

      {/* Request Refund Modal */}
      {refundOrderModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitRefundRequest}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  Request Refund · {refundOrderModal.orderNumber}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Paid Amount Eligible for Review: {formatNgn(refundOrderModal.amountPaidNgn)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefundOrderModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {refundError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
                {refundError}
              </div>
            )}

            <div className="text-xs space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Refund *
                </label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Explain why you are requesting a refund for this order..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Destination Bank Name *
                </label>
                <input
                  required
                  minLength={2}
                  value={refundBankName}
                  onChange={(e) => setRefundBankName(e.target.value)}
                  placeholder="e.g. GTBank, Access Bank, Zenith Bank, OPay"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Number *
                  </label>
                  <input
                    required
                    minLength={5}
                    value={refundAccountNumber}
                    onChange={(e) => setRefundAccountNumber(e.target.value)}
                    placeholder="10-digit NUBAN"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Holder Name *
                  </label>
                  <input
                    required
                    minLength={2}
                    value={refundAccountName}
                    onChange={(e) => setRefundAccountName(e.target.value)}
                    placeholder="Name on bank account"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={refundBusy}
                className="flex-1 py-3 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
              >
                {refundBusy
                  ? 'Submitting Refund Request...'
                  : `Submit Refund Request (${formatNgn(refundOrderModal.amountPaidNgn)})`}
              </button>
              <button
                type="button"
                disabled={refundBusy}
                onClick={() => setRefundOrderModal(null)}
                className="px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
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
