import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useStore } from '../context/StoreContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { Order, PageRoute } from '../types';
import {
  calculateInstalmentPlan,
  formatNgn,
  getEffectiveProductPrice,
} from '../utils/instalments';

interface CheckoutPageProps {
  onNavigate: (route: PageRoute) => void;
}

const DELIVERY_ZONES = [
  { label: 'Ibadan Pickup (Dugbe / Dalute Branch)', fee: 0, state: 'Oyo State' },
  { label: 'Ibadan Metropolis Delivery', fee: 15000, state: 'Oyo State' },
  { label: 'Oyo / Ogun / Lagos / Osun Express', fee: 35000, state: 'South West' },
  { label: 'Nationwide Logistics Delivery', fee: 65000, state: 'Nigeria Nationwide' },
];

export function CheckoutPage({ onNavigate }: CheckoutPageProps) {
  const { user, profile, savedAddresses, isInstaller } = useAuth();
  const {
    items,
    subtotalNgn,
    clearCart,
    packageSelection,
    setPackageSelection,
    checkoutMode,
    setCheckoutMode,
  } = useCart();
  const { storeSettings, gatewayConfig, logAndSendNotification } = useStore();

  const [customerName, setCustomerName] = useState(profile?.displayName || user?.displayName || '');
  const [customerPhone, setCustomerPhone] = useState(profile?.phone || '');
  const [deliveryAddress, setDeliveryAddress] = useState(profile?.defaultAddress || '');
  const [deliveryBranch, setDeliveryBranch] = useState('Dugbe Branch');
  const [selectedZoneIdx, setSelectedZoneIdx] = useState(1);
  const [includeInstallation, setIncludeInstallation] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'flutterwave' | 'bank_transfer'>(
    gatewayConfig.paystackConfigured ? 'paystack' : 'bank_transfer'
  );
  const [transferReference, setTransferReference] = useState('');
  const [acceptedPolicy, setAcceptedPolicy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [gatewayMessage, setGatewayMessage] = useState('');

  useEffect(() => {
    if (profile) {
      if (!customerName) setCustomerName(profile.displayName || '');
      if (!customerPhone) setCustomerPhone(profile.phone || '');
      if (!deliveryAddress) setDeliveryAddress(profile.defaultAddress || '');
    }
  }, [profile]);

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-4">
          <Lock className="w-10 h-10 text-emerald-700 dark:text-emerald-400 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sign In Required to Checkout</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Please sign in or register an OFFNOT ENERGY account so we can securely link your order,
            instalment schedule, payment receipts, and delivery address.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
          >
            Sign In / Create Account
          </button>
        </div>
      </div>
    );
  }

  const isPackageMode = checkoutMode === 'package' && packageSelection;

  if (!isPackageMode && items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 space-y-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">No Active Checkout Items</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Add individual solar products to your cart or choose a complete solar package first.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => onNavigate('shop')}
              className="px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer"
            >
              Shop Products
            </button>
            <button
              type="button"
              onClick={() => onNavigate('packages')}
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold cursor-pointer"
            >
              Solar Packages
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Package Calculation
  const pkgCalc = isPackageMode
    ? calculateInstalmentPlan({
        basePriceNgn: packageSelection.pkg.priceNgn,
        durationMonths: packageSelection.durationMonths,
        instalmentSurchargeNgn: packageSelection.pkg.instalmentSurchargeNgn,
        initialDepositPercent:
          packageSelection.pkg.initialDepositPercent ?? storeSettings.defaultInitialDepositPercent,
        adminChargePercent:
          packageSelection.pkg.adminChargePercent ?? storeSettings.defaultAdminChargePercent,
      })
    : null;

  const isInstalmentPackage = Boolean(isPackageMode && packageSelection.durationMonths > 1);
  const deliveryZone = DELIVERY_ZONES[selectedZoneIdx] || DELIVERY_ZONES[0];
  const deliveryFeeNgn = isPackageMode ? 0 : deliveryZone.fee;
  const installationFeeNgn = !isPackageMode && includeInstallation ? 50000 : 0;

  const totalAmountNgn = isPackageMode
    ? pkgCalc!.totalPayableNgn
    : subtotalNgn + deliveryFeeNgn + installationFeeNgn;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setGatewayMessage('');

    if (!customerName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (customerPhone.trim().length < 5) {
      setError('Please enter a valid phone number (at least 5 digits).');
      return;
    }
    if (deliveryAddress.trim().length < 3) {
      setError('Please enter a complete delivery street address.');
      return;
    }
    if (!acceptedPolicy) {
      setError('You must accept the Pay Fully Before Delivery and Installation policy terms.');
      return;
    }

    if (!isInstalmentPackage && paymentMethod === 'bank_transfer' && transferReference.trim().length < 4) {
      setError('Please enter your bank transfer reference or sender name for Accounts verification.');
      return;
    }

    setSubmitting(true);

    const orderId = `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const orderNumber = `OFF-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const nowIso = new Date().toISOString();

    try {
      // 1. If Paystack is chosen for a non-instalment full payment, initialize on backend first!
      if (!isInstalmentPackage && paymentMethod === 'paystack') {
        const initRes = await fetch('/api/payments/paystack/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            amountNgn: Math.round(totalAmountNgn),
            orderId,
            orderNumber,
            instalmentNumber: 1,
            callbackUrl: window.location.href,
          }),
        });

        const initPayload = (await initRes.json()) as {
          error?: string;
          message?: string;
          authorizationUrl?: string;
          reference?: string;
        };

        if (!initRes.ok) {
          setGatewayMessage(
            initPayload.message ||
              'Paystack gateway credentials are not configured yet. You can submit via Direct Bank Transfer below for Accounts verification.'
          );
          setSubmitting(false);
          return;
        }

        await createOrderRecord(orderId, orderNumber, nowIso, 'UNPAID', 'AWAITING_PAYMENT');
        if (!isPackageMode) {
          clearCart();
        } else {
          setPackageSelection(null);
        }
        if (initPayload.authorizationUrl) {
          sessionStorage.setItem(
            'offnot_pending_paystack',
            JSON.stringify({
              orderId,
              orderNumber,
              amountNgn: Math.round(totalAmountNgn),
              instalmentNumber: 1,
            })
          );
          window.location.assign(initPayload.authorizationUrl);
          return;
        }
      }

      // 2. If Flutterwave is chosen for non-instalment full payment, initialize via backend
      if (!isInstalmentPackage && paymentMethod === 'flutterwave') {
        const initRes = await fetch('/api/payments/flutterwave/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            customerName: customerName.trim(),
            amountNgn: Math.round(totalAmountNgn),
            orderId,
            orderNumber,
            instalmentNumber: 1,
            callbackUrl: window.location.href,
          }),
        });

        const initPayload = (await initRes.json()) as {
          error?: string;
          message?: string;
          authorizationUrl?: string;
          reference?: string;
        };

        if (!initRes.ok) {
          setGatewayMessage(
            initPayload.message ||
              'Flutterwave gateway credentials are not configured yet. You can submit via Direct Bank Transfer below for Accounts verification.'
          );
          setSubmitting(false);
          return;
        }

        await createOrderRecord(orderId, orderNumber, nowIso, 'UNPAID', 'AWAITING_PAYMENT');
        if (!isPackageMode) {
          clearCart();
        } else {
          setPackageSelection(null);
        }
        if (initPayload.authorizationUrl) {
          sessionStorage.setItem(
            'offnot_pending_flutterwave',
            JSON.stringify({
              orderId,
              orderNumber,
              amountNgn: Math.round(totalAmountNgn),
              instalmentNumber: 1,
            })
          );
          window.location.assign(initPayload.authorizationUrl);
          return;
        }
      }

      // 3. Create Order in Firestore (Instalment application OR Direct Bank Transfer full order)
      const initialPaymentStatus = isInstalmentPackage
        ? 'UNPAID'
        : paymentMethod === 'bank_transfer'
          ? 'AWAITING_VERIFICATION'
          : 'UNPAID';
      const initialOrderStatus = isInstalmentPackage ? 'PENDING_APPROVAL' : 'AWAITING_PAYMENT';

      await createOrderRecord(
        orderId,
        orderNumber,
        nowIso,
        initialPaymentStatus,
        initialOrderStatus
      );

      // If Direct Bank Transfer for full payment, create PENDING_VERIFICATION payment log
      if (!isInstalmentPackage && paymentMethod === 'bank_transfer') {
        const paymentId = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        await setDoc(doc(db, 'payments', paymentId), {
          id: paymentId,
          receiptNumber: `RCP-${String(Date.now()).slice(-7)}`,
          reference: transferReference.trim().slice(0, 120),
          orderId,
          orderNumber,
          userId: user.uid,
          customerName: customerName.trim().slice(0, 120),
          customerEmail: user.email || '',
          amountNgn: Math.round(totalAmountNgn),
          method: 'bank_transfer',
          channel: 'Direct Bank Transfer',
          status: 'PENDING_VERIFICATION',
          instalmentNumber: 1,
          notes: `Submitted at checkout for ${orderNumber}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // Decrement product stock safely on individual product order
      if (!isPackageMode) {
        for (const item of items) {
          if (!item.product.isDemo && item.product.stock >= item.quantity) {
            try {
              await updateDoc(doc(db, 'products', item.product.id), {
                stock: Math.max(0, item.product.stock - item.quantity),
                updatedAt: serverTimestamp(),
              });
            } catch {
              // ignore if demo product wasn't seeded to Firestore yet
            }
          }
        }
        clearCart();
      } else {
        setPackageSelection(null);
      }

      // Send automated confirmation notification
      await logAndSendNotification({
        userId: user.uid,
        recipientEmail: user.email || '',
        recipientPhone: customerPhone.trim(),
        type: isInstalmentPackage ? 'INSTALMENT_APPLICATION_RECEIVED' : 'ORDER_CONFIRMATION',
        title: isInstalmentPackage
          ? `Instalment Application Received (${orderNumber})`
          : `Order Confirmation (${orderNumber})`,
        message: isInstalmentPackage
          ? `Your ${packageSelection?.durationMonths}-month instalment application for ${packageSelection?.pkg.name} (${formatNgn(totalAmountNgn)}) has been received for management review. Remember: delivery & installation take place only after 100% payment completion.`
          : `Your OFFNOT ENERGY order ${orderNumber} totaling ${formatNgn(totalAmountNgn)} has been logged (${paymentMethod === 'bank_transfer' ? 'awaiting Accounts transfer verification' : 'awaiting payment'}).`,
        orderId,
      });

      onNavigate('account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit order.');
    } finally {
      setSubmitting(false);
    }
  };

  async function createOrderRecord(
    orderId: string,
    orderNumber: string,
    nowIso: string,
    paymentStatus: Order['paymentStatus'],
    orderStatus: Order['orderStatus']
  ) {
    if (!user) return;
    const roundedTotal = Math.round(totalAmountNgn);
    try {
      const payload: Record<string, unknown> = {
        id: orderId,
        orderNumber,
        userId: user.uid,
        customerName: customerName.trim().slice(0, 120),
        customerEmail: user.email || '',
        customerPhone: customerPhone.trim().slice(0, 32),
        orderType: isPackageMode ? 'package_order' : 'product_order',
        subtotalNgn: Math.round(isPackageMode ? packageSelection!.pkg.priceNgn : subtotalNgn),
        deliveryFeeNgn: Math.round(deliveryFeeNgn),
        installationFeeNgn: Math.round(installationFeeNgn),
        instalmentSurchargeNgn: Math.round(isPackageMode ? pkgCalc!.instalmentSurchargeNgn : 0),
        adminChargeNgn: Math.round(isPackageMode ? pkgCalc!.adminChargeNgn : 0),
        totalAmountNgn: roundedTotal,
        amountPaidNgn: 0,
        outstandingBalanceNgn: roundedTotal,
        paymentPlan: isInstalmentPackage ? 'instalment' : 'full',
        durationMonths: isPackageMode ? packageSelection!.durationMonths : 1,
        monthlyInstalmentNgn: Math.round(isPackageMode ? pkgCalc!.monthlyInstalmentNgn : roundedTotal),
        initialDepositNgn: Math.round(isPackageMode ? pkgCalc!.initialDepositNgn : roundedTotal),
        approvalStatus: isInstalmentPackage ? 'PENDING_APPROVAL' : 'NOT_REQUIRED',
        paymentStatus,
        orderStatus,
        deliveryAuthorized: false,
        deliveryAddress: deliveryAddress.trim().slice(0, 350),
        deliveryState: deliveryZone.state,
        deliveryBranch,
        nextPaymentDueDate: isPackageMode ? pkgCalc!.nextPaymentDueDate : nowIso.split('T')[0],
        acceptedPolicyAt: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (isPackageMode && packageSelection) {
        payload.packageId = packageSelection.pkg.id;
        payload.packageName = packageSelection.pkg.name.slice(0, 160);
        payload.schedule = pkgCalc!.schedule;
        payload.items = [];
      } else {
        payload.items = items.map((i) => {
          const unitPriceNgn = getEffectiveProductPrice(i.product, isInstaller);
          return {
            productId: i.product.id,
            name: i.product.name,
            model: i.product.model,
            category: i.product.category,
            quantity: i.quantity,
            unitPriceNgn,
            lineTotalNgn: unitPriceNgn * i.quantity,
          };
        });
      }

      await setDoc(doc(db, 'orders', orderId), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `orders/${orderId}`);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <button
          type="button"
          onClick={() => onNavigate(isPackageMode ? 'packages' : 'shop')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {isPackageMode ? 'Solar Packages' : 'Product Store'}
        </button>

        {items.length > 0 && packageSelection && (
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setCheckoutMode('cart')}
              className={`px-3 py-1.5 rounded-md cursor-pointer ${
                !isPackageMode ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Product Cart ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setCheckoutMode('package')}
              className={`px-3 py-1.5 rounded-md cursor-pointer ${
                isPackageMode ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Solar Package Plan
            </button>
          </div>
        )}
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
        {isInstalmentPackage
          ? 'Solar Package Instalment Application'
          : isPackageMode
            ? 'Solar Package Full-Payment Checkout'
            : 'Individual Solar Products Checkout'}
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-8">
        {isInstalmentPackage
          ? 'Separated Instalment Workflow: Submit your application for management approval before making monthly payments.'
          : 'Standard Full-Payment Checkout: Complete full payment via online gateway or verified bank transfer.'}
      </p>

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Customer & Delivery Form */}
        <div className="lg:col-span-7 space-y-6 min-w-0">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Customer &amp; Delivery Details</h2>

            {savedAddresses.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                  Use a Saved Delivery Address
                </label>
                <div className="flex flex-wrap gap-2">
                  {savedAddresses.map((addr) => (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => {
                        setCustomerName(addr.recipientName);
                        setCustomerPhone(addr.phone);
                        setDeliveryAddress(`${addr.streetAddress}, ${addr.city}, ${addr.state}`);
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                    >
                      {addr.label}: {addr.city}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  placeholder="Recipient full name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp / Phone Number
                </label>
                <input
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                  placeholder="e.g. 0803..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Delivery &amp; Installation Street Address
              </label>
              <AddressAutocomplete
                value={deliveryAddress}
                onChange={setDeliveryAddress}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Coordinating OFFNOT Branch
                </label>
                <select
                  value={deliveryBranch}
                  onChange={(e) => setDeliveryBranch(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="Dugbe Branch">Dugbe Branch (Iyaganku Road, Ibadan)</option>
                  <option value="Dalute Branch">Dalute Branch (Tipper Garage, Ibadan)</option>
                </select>
              </div>

              {!isPackageMode && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Delivery Zone
                  </label>
                  <select
                    value={selectedZoneIdx}
                    onChange={(e) => setSelectedZoneIdx(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {DELIVERY_ZONES.map((z, idx) => (
                      <option key={z.label} value={idx}>
                        {z.label} ({z.fee === 0 ? 'Free' : formatNgn(z.fee)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!isPackageMode && (
              <label className="flex items-center gap-2.5 pt-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeInstallation}
                  onChange={(e) => setIncludeInstallation(e.target.checked)}
                  className="w-4 h-4 accent-emerald-700"
                />
                <span>
                  Add Optional Professional Installation Support (+{formatNgn(50000)})
                </span>
              </label>
            )}
          </div>

          {/* Payment Method Selection */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              2. {isInstalmentPackage ? 'Application & Repayment Terms' : 'Select Payment Method'}
            </h2>

            {isInstalmentPackage ? (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-xs sm:text-sm text-emerald-950 dark:text-emerald-100 space-y-2">
                <p className="font-bold">Management Approval Gate</p>
                <p>
                  No upfront payment is charged before approval. Submitting this form registers your{' '}
                  <strong>{packageSelection!.durationMonths}-month instalment application</strong>{' '}
                  for review by OFFNOT ENERGY management. Once approved, you can pay your
                  instalments directly from your Customer Dashboard via Paystack, Flutterwave, or
                  Bank Transfer.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  {
                    id: 'paystack' as const,
                    title: 'Paystack Online Checkout (Card, Bank Transfer, USSD)',
                    subtitle: gatewayConfig.paystackConfigured
                      ? `Sandbox/Live Verified (${gatewayConfig.mode})`
                      : 'Requires PAYSTACK_SECRET_KEY & VITE_PAYSTACK_PUBLIC_KEY in Secrets',
                  },
                  {
                    id: 'flutterwave' as const,
                    title: 'Flutterwave Online Checkout',
                    subtitle: gatewayConfig.flutterwaveConfigured
                      ? `Gateway Ready (${gatewayConfig.mode})`
                      : 'Requires FLUTTERWAVE_SECRET_KEY & VITE_FLUTTERWAVE_PUBLIC_KEY in Secrets',
                  },
                  {
                    id: 'bank_transfer' as const,
                    title: 'Direct Bank Transfer / Branch Payment Verification',
                    subtitle: 'Transfer to OFFNOT ENERGY account & submit reference for Accounts Staff confirmation',
                  },
                ].map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer ${
                      paymentMethod === opt.id
                        ? 'border-emerald-700 dark:border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/35'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === opt.id}
                      onChange={() => setPaymentMethod(opt.id)}
                      className="mt-1 accent-emerald-700"
                    />
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{opt.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.subtitle}</p>
                    </div>
                  </label>
                ))}

                {paymentMethod === 'bank_transfer' && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3 text-xs">
                    <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                      <Building2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                      OFFNOT ENERGY Bank Details
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">
                      Bank: <strong>{storeSettings.bankName}</strong> · Account Name:{' '}
                      <strong>{storeSettings.bankAccountName}</strong> · Account Number:{' '}
                      <strong className="font-mono-num">{storeSettings.bankAccountNumber}</strong>
                    </p>
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Bank Transfer Reference / Sender Name
                      </label>
                      <input
                        value={transferReference}
                        onChange={(e) => setTransferReference(e.target.value)}
                        placeholder="e.g. NIP-8493021 / Sender Name"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Strict Policy Confirmation */}
            <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/40 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-orange-950 dark:text-orange-200">
                <Lock className="w-4 h-4 text-orange-700 dark:text-orange-400" />
                STRICT POLICY: PAY FULLY BEFORE DELIVERY AND INSTALLATION
              </div>
              <label className="flex items-start gap-2.5 text-xs text-orange-950 dark:text-orange-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedPolicy}
                  onChange={(e) => setAcceptedPolicy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-700"
                />
                <span>
                  I understand and agree to OFFNOT ENERGY’s strict Pay Fully Before Delivery and
                  Installation policy and Instalment Terms. No product dispatch or installation
                  occurs until 100% payment is completed and verified.
                </span>
              </label>
            </div>
          </div>

          {gatewayMessage && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>{gatewayMessage}</span>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 p-4 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Right: Order Review Summary */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 min-w-0">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Order Review</h2>

            {isPackageMode && packageSelection && pkgCalc ? (
              <div className="space-y-3 text-sm">
                <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="font-bold text-slate-900 dark:text-white">{packageSelection.pkg.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {packageSelection.pkg.capacityKva} ·{' '}
                    {packageSelection.durationMonths === 1
                      ? 'Full Payment'
                      : `${packageSelection.durationMonths}-Month Instalment Plan`}
                  </p>
                  {packageSelection.pkg.loadCapacity && (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1.5">
                      Carries: {packageSelection.pkg.loadCapacity}
                    </p>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Package Base Price</span>
                  <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                    {formatNgn(pkgCalc.basePriceNgn)}
                  </span>
                </div>
                {pkgCalc.instalmentSurchargeNgn > 0 && (
                  <div className="flex justify-between text-orange-700 dark:text-orange-400">
                    <span>Instalment Plan Fee</span>
                    <span className="font-mono-num font-semibold">
                      +{formatNgn(pkgCalc.instalmentSurchargeNgn)}
                    </span>
                  </div>
                )}
                {pkgCalc.adminChargeNgn > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Admin Charge</span>
                    <span className="font-mono-num text-slate-900 dark:text-slate-100">{formatNgn(pkgCalc.adminChargeNgn)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Installation (Upon Full Pay)</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Included</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
                  <span className="font-bold text-slate-900 dark:text-white">Total Package Amount</span>
                  <span className="text-xl font-extrabold font-mono-num text-emerald-800 dark:text-emerald-400">
                    {formatNgn(totalAmountNgn)}
                  </span>
                </div>
                {isInstalmentPackage && (
                  <div className="flex justify-between text-xs text-orange-700 dark:text-orange-400 font-semibold">
                    <span>Monthly Instalment ({packageSelection.durationMonths} mos)</span>
                    <span className="font-mono-num">{formatNgn(pkgCalc.monthlyInstalmentNgn)}/mo</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                  {items.map(({ product, quantity }) => {
                    const unitPrice = getEffectiveProductPrice(product, isInstaller);
                    return (
                      <div key={product.id} className="py-2.5 flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{product.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                            Qty {quantity} × {formatNgn(unitPrice)}
                            {isInstaller ? ' (Installer)' : ''}
                          </p>
                        </div>
                        <span className="font-bold font-mono-num text-slate-900 dark:text-slate-100 shrink-0">
                          {formatNgn(unitPrice * quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                    <span className="font-mono-num text-slate-900 dark:text-slate-100">{formatNgn(subtotalNgn)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Delivery Charge</span>
                    <span className="font-mono-num text-slate-900 dark:text-slate-100">{formatNgn(deliveryFeeNgn)}</span>
                  </div>
                  {installationFeeNgn > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Installation Support</span>
                      <span className="font-mono-num text-slate-900 dark:text-slate-100">{formatNgn(installationFeeNgn)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
                  <span className="font-bold text-slate-900 dark:text-white">Total Payable</span>
                  <span className="text-xl font-extrabold font-mono-num text-emerald-800 dark:text-emerald-400">
                    {formatNgn(totalAmountNgn)}
                  </span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isInstalmentPackage ? (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  {submitting ? 'Submitting Application...' : 'Submit Instalment Application'}
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  {submitting ? 'Processing Order...' : 'Confirm & Proceed to Payment'}
                </>
              )}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span>Unique transaction reference &amp; official receipt issued on verification.</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
