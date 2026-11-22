import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MessageSquare,
  Package,
  Plus,
  Settings,
  Shield,
  ShieldAlert,
  Star,
  Trash2,
  Truck,
  Unlock,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { ReceiptModal } from '../components/ReceiptModal';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  PRODUCT_CATEGORIES,
  STAFF_ROLE_LABELS,
  type AuditLog,
  type Inquiry,
  type InstalmentScheduleItem,
  type NotificationLog,
  type Order,
  type PageRoute,
  type PaymentRecord,
  type Product,
  type ProductCategory,
  type Review,
  type RolePermission,
  type SolarPackage,
  type StaffMember,
  type StaffRole,
  type StoreSetting,
  type UserProfile,
} from '../types';
import { downloadCsv, formatNgn, formatOrderStatusLabel } from '../utils/instalments';
import { DEFAULT_ROLE_PERMISSIONS, seedInitialCatalogIfAdmin } from '../utils/seedData';

interface AdminDashboardPageProps {
  onNavigate: (route: PageRoute) => void;
}

type AdminTab =
  | 'overview'
  | 'orders'
  | 'payments'
  | 'packages'
  | 'products'
  | 'customers'
  | 'inquiries'
  | 'staff'
  | 'settings';

function toMs(ts: unknown): number {
  if (!ts) return 0;
  if (
    typeof ts === 'object' &&
    ts !== null &&
    'toMillis' in ts &&
    typeof (ts as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  if (typeof ts === 'string' || typeof ts === 'number') {
    const parsed = new Date(ts).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const maxDim = 900;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        if (compressed.length > 280000) {
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } else {
          resolve(compressed);
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function AdminDashboardPage({ onNavigate }: AdminDashboardPageProps) {
  const {
    user,
    isStaff,
    isSuperAdmin,
    staffRole,
    staffRecord,
    permissions,
    createStaffAccount,
    linkOrUpdatePassword,
  } = useAuth();
  const {
    products,
    packages,
    storeSettings,
    reviews,
    usingDemoCatalog,
    logAndSendNotification,
  } = useStore();

  const isBranchSalesRep = staffRole === 'sales_rep' || staffRole === 'sales_staff';
  const assignedBranch = staffRecord?.branch || '';

  const [tab, setTab] = useState<AdminTab>('overview');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [rolePermsMap, setRolePermsMap] = useState<Record<StaffRole, RolePermission>>(
    DEFAULT_ROLE_PERMISSIONS
  );
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notificationsList, setNotificationsList] = useState<NotificationLog[]>([]);
  const [bannerMsg, setBannerMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [emailEnableNeeded, setEmailEnableNeeded] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Sync default branch scope for Dugbe / Dalute Sales Reps
  useEffect(() => {
    if (isBranchSalesRep && assignedBranch && assignedBranch !== 'Head Office') {
      setBranchFilter(assignedBranch);
    } else {
      setBranchFilter('ALL');
    }
  }, [isBranchSalesRep, assignedBranch]);

  // Modals & Forms
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SolarPackage | null>(null);
  const [showPackageModal, setShowPackageModal] = useState(false);

  const [scheduleOrder, setScheduleOrder] = useState<Order | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [installationDate, setInstallationDate] = useState('');

  const [overrideOrder, setOverrideOrder] = useState<Order | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const [approvalOrder, setApprovalOrder] = useState<Order | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');

  const [receiptPayment, setReceiptPayment] = useState<PaymentRecord | null>(null);

  const [manualPayOrder, setManualPayOrder] = useState<Order | null>(null);
  const [manualPayAmount, setManualPayAmount] = useState<number>(0);
  const [manualPayRef, setManualPayRef] = useState('');
  const [manualPayMethod, setManualPayMethod] = useState<'bank_transfer' | 'branch_cash'>(
    'bank_transfer'
  );

  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  // Create Staff Login (Email + Password) State
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [showNewStaffPwd, setShowNewStaffPwd] = useState(false);
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('sales_rep');
  const [newStaffBranch, setNewStaffBranch] = useState('Dugbe Branch');
  const [creatingStaff, setCreatingStaff] = useState(false);

  // Assign Existing User State
  const [staffUidInput, setStaffUidInput] = useState('');
  const [staffRoleInput, setStaffRoleInput] = useState<StaffRole>('sales_rep');
  const [staffBranchInput, setStaffBranchInput] = useState('Dugbe Branch');

  // Super Admin Email+Password Credential Link
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminPwd, setShowAdminPwd] = useState(false);
  const [linkingPwd, setLinkingPwd] = useState(false);

  // Store Settings state
  const [settingsForm, setSettingsForm] = useState<StoreSetting>(storeSettings);
  useEffect(() => {
    setSettingsForm(storeSettings);
  }, [storeSettings]);

  // Subscribe to staff-wide operational collections
  useEffect(() => {
    if (!isStaff) return;

    const unsubOrders = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const unsubPayments = onSnapshot(
      collection(db, 'payments'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PaymentRecord);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setPayments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserProfile);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setUsersList(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );

    const unsubStaff = onSnapshot(
      collection(db, 'staff'),
      (snap) => setStaffList(snap.docs.map((d) => d.data() as StaffMember)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'staff')
    );

    const unsubPerms = onSnapshot(
      collection(db, 'rolePermissions'),
      (snap) => {
        const next = { ...DEFAULT_ROLE_PERMISSIONS };
        for (const d of snap.docs) {
          const data = d.data() as RolePermission;
          if (data.role) next[data.role] = data;
        }
        setRolePermsMap(next);
      },
      () => {
        // fallback defaults
      }
    );

    const unsubInquiries = onSnapshot(
      collection(db, 'inquiries'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Inquiry);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setInquiries(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'inquiries')
    );

    const unsubAudit = onSnapshot(
      collection(db, 'auditLogs'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AuditLog);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setAuditLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
    );

    const unsubNotifs = onSnapshot(
      collection(db, 'notifications'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as NotificationLog);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setNotificationsList(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubOrders();
      unsubPayments();
      unsubUsers();
      unsubStaff();
      unsubPerms();
      unsubInquiries();
      unsubAudit();
      unsubNotifs();
    };
  }, [isStaff]);

  const branchScopedOrders = useMemo(() => {
    if (branchFilter === 'ALL') return orders;
    return orders.filter((o) => o.deliveryBranch === branchFilter);
  }, [orders, branchFilter]);

  const branchScopedInquiries = useMemo(() => {
    if (branchFilter === 'ALL') return inquiries;
    return inquiries.filter((i) => !i.branch || i.branch === branchFilter);
  }, [inquiries, branchFilter]);

  const metrics = useMemo(() => {
    const activeOrders = branchScopedOrders.filter(
      (o) => o.orderStatus !== 'CANCELLED' && o.orderStatus !== 'REJECTED'
    );
    const totalSales = activeOrders.reduce((s, o) => s + (o.totalAmountNgn || 0), 0);
    const totalRevenueCollected = branchScopedOrders.reduce(
      (s, o) => s + (o.amountPaidNgn || 0),
      0
    );
    const totalOutstanding = activeOrders.reduce(
      (s, o) => s + (o.outstandingBalanceNgn || 0),
      0
    );
    const pendingOrders = branchScopedOrders.filter(
      (o) => o.orderStatus === 'PENDING_APPROVAL' || o.orderStatus === 'AWAITING_PAYMENT'
    ).length;
    const completedOrders = branchScopedOrders.filter((o) => o.orderStatus === 'COMPLETED').length;

    const todayIso = new Date().toISOString().split('T')[0];
    const overdueOrders = activeOrders.filter((o) => {
      if (o.outstandingBalanceNgn <= 0) return false;
      if (o.schedule && o.schedule.length > 0) {
        return o.schedule.some((s) => s.status === 'PENDING' && s.dueDate < todayIso);
      }
      return Boolean(o.nextPaymentDueDate && o.nextPaymentDueDate < todayIso);
    });

    const pendingTransfers = payments.filter((p) => p.status === 'PENDING_VERIFICATION');
    const lowStockProducts = products.filter(
      (p) => !p.isDemo && p.stock <= (p.lowStockThreshold ?? 3)
    );

    const monthlyMap: Record<string, { orders: number; billed: number; collected: number }> = {};
    for (const ord of activeOrders) {
      const ms = toMs(ord.createdAt) || Date.parse(ord.acceptedPolicyAt) || Date.now();
      const dt = new Date(ms);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) monthlyMap[key] = { orders: 0, billed: 0, collected: 0 };
      monthlyMap[key].orders += 1;
      monthlyMap[key].billed += ord.totalAmountNgn || 0;
      monthlyMap[key].collected += ord.amountPaidNgn || 0;
    }
    const monthlyRows = Object.entries(monthlyMap).sort((a, b) => b[0].localeCompare(a[0]));

    return {
      totalSales,
      totalRevenueCollected,
      totalOutstanding,
      totalCustomers: usersList.length,
      totalOrders: branchScopedOrders.length,
      pendingOrders,
      completedOrders,
      overdueOrders,
      pendingTransfers,
      lowStockProducts,
      monthlyRows,
    };
  }, [branchScopedOrders, payments, products, usersList]);

  if (!user || !isStaff || !staffRole) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-4">
          <ShieldAlert className="w-10 h-10 text-orange-600 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">Restricted Staff Portal</h1>
          <p className="text-sm text-slate-600">
            Access to the OFFNOT ENERGY Staff &amp; Management Dashboard is restricted to verified,
            authorized staff accounts.
          </p>
          <button
            type="button"
            onClick={() => onNavigate(user ? 'account' : 'auth')}
            className="px-5 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
          >
            {user ? 'Return to My Account' : 'Sign In as Staff'}
          </button>
        </div>
      </div>
    );
  }

  const showNotice = (msg: string) => {
    setErrorMsg('');
    setBannerMsg(msg);
    setTimeout(() => setBannerMsg(''), 6000);
  };

  const showError = (msg: string) => {
    setBannerMsg('');
    setErrorMsg(msg);
  };

  async function writeAuditLog(params: {
    action: string;
    targetType: string;
    targetId: string;
    details: string;
    reason?: string;
  }) {
    if (!user) return;
    const id = `aud_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    try {
      await setDoc(doc(db, 'auditLogs', id), {
        id,
        action: params.action.slice(0, 100),
        actorUid: user.uid,
        actorEmail: user.email || 'staff@offnotenergy.com',
        actorRole: staffRole || 'staff',
        targetType: params.targetType.slice(0, 60),
        targetId: params.targetId.slice(0, 128),
        details: params.details.slice(0, 1000),
        ...(params.reason ? { reason: params.reason.slice(0, 500) } : {}),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Audit log write notice:', err);
    }
  }

  const handleSeedDemoCatalog = async () => {
    setSeeding(true);
    try {
      await seedInitialCatalogIfAdmin();
      await writeAuditLog({
        action: 'SEED_CATALOG',
        targetType: 'settings',
        targetId: 'storeConfig',
        details:
          'Seeded initial demonstration catalog, OFFNOT 4KVA package, role permissions, and store settings.',
      });
      showNotice('Demonstration catalog, settings, and role permissions seeded to Firestore.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to seed catalog.');
    } finally {
      setSeeding(false);
    }
  };

  // Effective capabilities based on Super Admin / Role Permissions
  const canManageProducts = Boolean(permissions?.canManageProducts || isSuperAdmin);
  const canManagePackages = Boolean(permissions?.canManagePackages || isSuperAdmin);
  const canApproveInstalments = Boolean(permissions?.canApproveInstalments || isSuperAdmin);
  const canVerifyPayments = Boolean(permissions?.canVerifyPayments || isSuperAdmin);
  const canScheduleDelivery = Boolean(permissions?.canScheduleDelivery || isSuperAdmin);
  const canOverrideDeliveryLock = Boolean(permissions?.canOverrideDeliveryLock || isSuperAdmin);
  const canManageStaff = Boolean(permissions?.canManageStaff || isSuperAdmin);
  const canEditSettings = Boolean(permissions?.canEditSettings || isSuperAdmin);

  // --- Create New Staff Login (Email + Password) ---
  const handleCreateStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setEmailEnableNeeded(false);

    if (newStaffPassword.length < 6) {
      showError('Staff password must be at least 6 characters long.');
      return;
    }

    setCreatingStaff(true);
    try {
      const { uid } = await createStaffAccount({
        displayName: newStaffName,
        email: newStaffEmail,
        password: newStaffPassword,
        role: newStaffRole,
        branch: newStaffBranch,
        phone: newStaffPhone,
      });

      await writeAuditLog({
        action: 'CREATE_STAFF_ACCOUNT',
        targetType: 'staff',
        targetId: uid,
        details: `Created staff login ${newStaffEmail} (${STAFF_ROLE_LABELS[newStaffRole]}, ${newStaffBranch}).`,
      });

      showNotice(
        `Staff login created for ${newStaffName} (${newStaffEmail}) as ${STAFF_ROLE_LABELS[newStaffRole]} · ${newStaffBranch}. They can now sign in on the Login page and will open their role dashboard automatically.`
      );
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPassword('');
      setNewStaffPhone('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/operation-not-allowed')) {
        setEmailEnableNeeded(true);
        showError(
          'Email/Password sign-in provider must be enabled in Firebase Authentication Console before creating password-based logins.'
        );
      } else if (msg.includes('auth/email-already-in-use')) {
        showError(
          'This email is already registered in Firebase Auth. Use "Assign Role to Existing User" on the right to grant them staff access.'
        );
      } else {
        showError(msg);
      }
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleLinkSuperAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setEmailEnableNeeded(false);
    if (adminPasswordInput.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }
    setLinkingPwd(true);
    try {
      await linkOrUpdatePassword(adminPasswordInput);
      setAdminPasswordInput('');
      showNotice(
        `Email & Password sign-in updated for ${user.email}. You can now sign in with either Google or Email + Password.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/operation-not-allowed')) {
        setEmailEnableNeeded(true);
        showError(
          'Enable the Email/Password provider in Firebase Authentication Console first, then save your password here.'
        );
      } else if (msg.includes('auth/requires-recent-login')) {
        showError('Please sign out and sign back in with Google, then set your password right away.');
      } else {
        showError(msg);
      }
    } finally {
      setLinkingPwd(false);
    }
  };

  // --- Instalment Application Approval ---
  const handleDecisionApproval = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!approvalOrder || !user) return;
    try {
      const nextStatus = decision === 'APPROVED' ? 'AWAITING_PAYMENT' : 'REJECTED';
      await updateDoc(doc(db, 'orders', approvalOrder.id), {
        approvalStatus: decision,
        approvalNotes: approvalNotes.trim().slice(0, 500),
        approvedBy: user.email || user.uid,
        orderStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: decision === 'APPROVED' ? 'APPROVE_INSTALMENT' : 'REJECT_INSTALMENT',
        targetType: 'order',
        targetId: approvalOrder.id,
        details: `Order ${approvalOrder.orderNumber} marked ${decision}. Notes: ${approvalNotes || 'None'}`,
      });

      await logAndSendNotification({
        userId: approvalOrder.userId,
        recipientEmail: approvalOrder.customerEmail,
        recipientPhone: approvalOrder.customerPhone,
        type: `INSTALMENT_${decision}`,
        title:
          decision === 'APPROVED'
            ? `Instalment Plan Approved (${approvalOrder.orderNumber})`
            : `Instalment Application Update (${approvalOrder.orderNumber})`,
        message:
          decision === 'APPROVED'
            ? `Good news! Your instalment application for ${approvalOrder.packageName || approvalOrder.orderNumber} has been approved. You may now begin making payments from My Account. Delivery & installation follow 100% payment completion.`
            : `Your instalment application (${approvalOrder.orderNumber}) could not be approved at this time. Notes: ${approvalNotes || 'Please contact customer service on 07047053453.'}`,
        orderId: approvalOrder.id,
      });

      showNotice(`Order ${approvalOrder.orderNumber} marked ${decision}.`);
      setApprovalOrder(null);
      setApprovalNotes('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${approvalOrder.id}`);
    }
  };

  // --- Apply Verified Payment to Order ---
  async function applyPaymentAmountToOrder(order: Order, addAmountNgn: number, reference: string) {
    const newPaid = Math.min(order.totalAmountNgn, (order.amountPaidNgn || 0) + addAmountNgn);
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

    const nextPaymentStatus = fullyPaid
      ? 'FULLY_PAID'
      : newPaid > 0
        ? 'PARTIALLY_PAID'
        : 'UNPAID';
    const nextOrderStatus = fullyPaid
      ? order.orderStatus === 'COMPLETED' || order.orderStatus === 'SCHEDULED_FOR_INSTALLATION'
        ? order.orderStatus
        : 'FULLY_PAID_AWAITING_DELIVERY'
      : 'IN_INSTALMENT';

    await updateDoc(doc(db, 'orders', order.id), {
      amountPaidNgn: newPaid,
      outstandingBalanceNgn: newOutstanding,
      paymentStatus: nextPaymentStatus,
      orderStatus: nextOrderStatus,
      ...(updatedSchedule ? { schedule: updatedSchedule } : {}),
      nextPaymentDueDate: nextDueDate,
      updatedAt: serverTimestamp(),
    });

    return { newPaid, newOutstanding, fullyPaid };
  }

  const handleVerifyBankTransfer = async (pay: PaymentRecord, approve: boolean) => {
    if (!user) return;
    const order = orders.find((o) => o.id === pay.orderId);
    try {
      await updateDoc(doc(db, 'payments', pay.id), {
        status: approve ? 'VERIFIED' : 'FAILED',
        verifiedBy: user.email || user.uid,
        notes: approve ? 'Verified by Accounts/Admin' : 'Marked unverified/failed by staff',
        updatedAt: serverTimestamp(),
      });

      if (order && approve) {
        const res = await applyPaymentAmountToOrder(order, pay.amountNgn, pay.reference);
        await logAndSendNotification({
          userId: order.userId,
          recipientEmail: order.customerEmail,
          recipientPhone: order.customerPhone,
          type: res.fullyPaid ? 'FULL_PAYMENT_COMPLETED' : 'PAYMENT_VERIFIED',
          title: res.fullyPaid
            ? `Full Payment Confirmed — Awaiting Delivery (${order.orderNumber})`
            : `Payment Verified (${pay.receiptNumber})`,
          message: res.fullyPaid
            ? `Your payment of ${formatNgn(pay.amountNgn)} has been verified. Your order is now FULLY PAID – AWAITING DELIVERY. Our team will schedule delivery and installation.`
            : `Your payment of ${formatNgn(pay.amountNgn)} (Receipt ${pay.receiptNumber}) has been verified. Remaining balance: ${formatNgn(res.newOutstanding)}.`,
          orderId: order.id,
        });
      } else if (order && !approve) {
        await updateDoc(doc(db, 'orders', order.id), {
          amountPaidNgn: order.amountPaidNgn,
          outstandingBalanceNgn: order.outstandingBalanceNgn,
          paymentStatus: order.amountPaidNgn > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
          orderStatus: order.orderStatus,
          updatedAt: serverTimestamp(),
        });
      }

      await writeAuditLog({
        action: approve ? 'VERIFY_PAYMENT' : 'REJECT_PAYMENT',
        targetType: 'payment',
        targetId: pay.id,
        details: `${approve ? 'Verified' : 'Rejected'} ${formatNgn(pay.amountNgn)} (${pay.reference}) for order ${pay.orderNumber}.`,
      });

      showNotice(
        approve
          ? `Payment ${pay.receiptNumber} verified and order balance updated.`
          : `Payment ${pay.receiptNumber} marked as failed.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `payments/${pay.id}`);
    }
  };

  const handleRecordManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPayOrder || !user) return;
    if (manualPayAmount <= 0 || manualPayAmount > manualPayOrder.outstandingBalanceNgn) {
      showError('Amount must be > ₦0 and <= outstanding balance.');
      return;
    }

    const payId = `pay_${Date.now()}`;
    const receiptNumber = `RCP-${String(Date.now()).slice(-7)}`;
    const ref = manualPayRef.trim() || `BR-${String(Date.now()).slice(-6)}`;

    try {
      await setDoc(doc(db, 'payments', payId), {
        id: payId,
        receiptNumber,
        reference: ref,
        orderId: manualPayOrder.id,
        orderNumber: manualPayOrder.orderNumber,
        userId: manualPayOrder.userId,
        customerName: manualPayOrder.customerName,
        customerEmail: manualPayOrder.customerEmail,
        amountNgn: manualPayAmount,
        method: manualPayMethod,
        channel: manualPayMethod === 'branch_cash' ? 'Branch Payment' : 'Verified Transfer',
        status: 'VERIFIED',
        verifiedBy: user.email || user.uid,
        notes: `Recorded directly by ${user.email}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const res = await applyPaymentAmountToOrder(manualPayOrder, manualPayAmount, ref);

      await writeAuditLog({
        action: 'RECORD_VERIFIED_PAYMENT',
        targetType: 'order',
        targetId: manualPayOrder.id,
        details: `Recorded verified ${manualPayMethod} of ${formatNgn(manualPayAmount)} (${receiptNumber}) for ${manualPayOrder.orderNumber}.`,
      });

      await logAndSendNotification({
        userId: manualPayOrder.userId,
        recipientEmail: manualPayOrder.customerEmail,
        recipientPhone: manualPayOrder.customerPhone,
        type: res.fullyPaid ? 'FULL_PAYMENT_COMPLETED' : 'PAYMENT_VERIFIED',
        title: `Official Receipt ${receiptNumber} (${manualPayOrder.orderNumber})`,
        message: `Payment of ${formatNgn(manualPayAmount)} recorded. Outstanding balance: ${formatNgn(res.newOutstanding)}.`,
        orderId: manualPayOrder.id,
      });

      showNotice(`Recorded verified payment ${receiptNumber}.`);
      setManualPayOrder(null);
      setManualPayRef('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `payments/${payId}`);
    }
  };

  // --- Schedule Delivery & Installation (Strictly Gated) ---
  const handleScheduleDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleOrder) return;
    if (scheduleOrder.outstandingBalanceNgn > 0 && !scheduleOrder.overrideApplied) {
      showError('Policy Lock: Cannot schedule delivery while outstanding balance > ₦0.');
      return;
    }

    try {
      await updateDoc(doc(db, 'orders', scheduleOrder.id), {
        deliveryAuthorized: true,
        orderStatus: 'SCHEDULED_FOR_INSTALLATION',
        deliveryScheduledDate: deliveryDate,
        installationScheduledDate: installationDate,
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: 'SCHEDULE_DELIVERY_INSTALLATION',
        targetType: 'order',
        targetId: scheduleOrder.id,
        details: `Scheduled delivery (${deliveryDate}) & installation (${installationDate}) for ${scheduleOrder.orderNumber}.`,
      });

      await logAndSendNotification({
        userId: scheduleOrder.userId,
        recipientEmail: scheduleOrder.customerEmail,
        recipientPhone: scheduleOrder.customerPhone,
        type: 'DELIVERY_SCHEDULED',
        title: `Delivery & Installation Scheduled (${scheduleOrder.orderNumber})`,
        message: `Your OFFNOT ENERGY order is scheduled for delivery on ${deliveryDate} and installation on ${installationDate}.`,
        orderId: scheduleOrder.id,
      });

      showNotice(`Delivery & installation scheduled for ${scheduleOrder.orderNumber}.`);
      setScheduleOrder(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${scheduleOrder.id}`);
    }
  };

  const handleMarkCompleted = async (order: Order) => {
    if (order.outstandingBalanceNgn > 0 && !order.overrideApplied) return;
    try {
      const completedAt = new Date().toISOString().split('T')[0];
      await updateDoc(doc(db, 'orders', order.id), {
        deliveryAuthorized: true,
        orderStatus: 'COMPLETED',
        completedAt,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'COMPLETE_ORDER',
        targetType: 'order',
        targetId: order.id,
        details: `Order ${order.orderNumber} marked COMPLETED.`,
      });
      showNotice(`Order ${order.orderNumber} marked COMPLETED.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const handleSuperAdminOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideOrder || !user) return;
    if (overrideReason.trim().length < 10) {
      showError('Override reason must be at least 10 characters.');
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      await updateDoc(doc(db, 'orders', overrideOrder.id), {
        overrideApplied: true,
        overrideBy: user.email || user.uid,
        overrideReason: overrideReason.trim().slice(0, 500),
        deliveryAuthorized: true,
        orderStatus: 'SCHEDULED_FOR_INSTALLATION',
        deliveryScheduledDate: overrideOrder.deliveryScheduledDate || today,
        installationScheduledDate: overrideOrder.installationScheduledDate || today,
        updatedAt: serverTimestamp(),
      });

      await writeAuditLog({
        action: 'SUPER_ADMIN_DELIVERY_OVERRIDE',
        targetType: 'order',
        targetId: overrideOrder.id,
        details: `Authorized delivery lock override for ${overrideOrder.orderNumber} (Outstanding: ${formatNgn(overrideOrder.outstandingBalanceNgn)}).`,
        reason: overrideReason.trim(),
      });

      showNotice(`Super Admin Override applied & logged for ${overrideOrder.orderNumber}.`);
      setOverrideOrder(null);
      setOverrideReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${overrideOrder.id}`);
    }
  };

  // --- Staff Management ---
  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !staffUidInput.trim()) return;
    const targetUser = usersList.find((u) => u.uid === staffUidInput.trim());
    if (!targetUser) {
      showError('Please select a valid registered user from the list.');
      return;
    }

    try {
      await setDoc(doc(db, 'staff', targetUser.uid), {
        uid: targetUser.uid,
        email: targetUser.email,
        displayName: targetUser.displayName,
        role: staffRoleInput,
        branch: staffBranchInput,
        active: true,
        addedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'ASSIGN_STAFF_ROLE',
        targetType: 'staff',
        targetId: targetUser.uid,
        details: `Assigned ${targetUser.email} as ${STAFF_ROLE_LABELS[staffRoleInput]} (${staffBranchInput}).`,
      });
      showNotice(
        `Assigned ${targetUser.displayName} as ${STAFF_ROLE_LABELS[staffRoleInput]} (${staffBranchInput}).`
      );
      setStaffUidInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `staff/${targetUser.uid}`);
    }
  };

  const handleToggleStaffActive = async (member: StaffMember) => {
    try {
      await updateDoc(doc(db, 'staff', member.uid), {
        active: !member.active,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'TOGGLE_STAFF_ACTIVE',
        targetType: 'staff',
        targetId: member.uid,
        details: `Set staff ${member.email} active=${!member.active}.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `staff/${member.uid}`);
    }
  };

  const handleUpdateStaffRoleBranch = async (
    member: StaffMember,
    nextRole: StaffRole,
    nextBranch: string
  ) => {
    try {
      await updateDoc(doc(db, 'staff', member.uid), {
        role: nextRole,
        branch: nextBranch,
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'UPDATE_STAFF_ROLE_BRANCH',
        targetType: 'staff',
        targetId: member.uid,
        details: `Updated ${member.email} -> ${STAFF_ROLE_LABELS[nextRole]} (${nextBranch}).`,
      });
      showNotice(`Updated ${member.displayName}'s role & branch.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `staff/${member.uid}`);
    }
  };

  const handleSaveRolePermission = async (role: StaffRole, updated: RolePermission) => {
    try {
      await setDoc(doc(db, 'rolePermissions', role), {
        ...updated,
        role,
        updatedAt: serverTimestamp(),
      });
      showNotice(`Permissions updated for ${STAFF_ROLE_LABELS[role]}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `rolePermissions/${role}`);
    }
  };

  // --- Store Settings Save ---
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'storeConfig'), {
        ...settingsForm,
        id: 'storeConfig',
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'UPDATE_STORE_SETTINGS',
        targetType: 'settings',
        targetId: 'storeConfig',
        details: 'Updated OFFNOT ENERGY bank details, instalment parameters, and store policies.',
      });
      showNotice('Store configuration & policies saved.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/storeConfig');
    }
  };

  // --- Financial CSV Export ---
  const handleExportFinancialReport = () => {
    const rows = branchScopedOrders.map((o) => ({
      OrderNumber: o.orderNumber,
      Customer: o.customerName,
      Email: o.customerEmail,
      Phone: o.customerPhone,
      Type: o.orderType,
      Plan: o.paymentPlan === 'full' ? 'Full Payment' : `${o.durationMonths} Months`,
      TotalAmountNGN: o.totalAmountNgn,
      AmountPaidNGN: o.amountPaidNgn,
      OutstandingNGN: o.outstandingBalanceNgn,
      OrderStatus: o.orderStatus,
      PaymentStatus: o.paymentStatus,
      Branch: o.deliveryBranch || '',
    }));
    downloadCsv(`offnot-energy-report-${new Date().toISOString().split('T')[0]}.csv`, rows);
  };

  const filteredOrders =
    orderStatusFilter === 'ALL'
      ? branchScopedOrders
      : branchScopedOrders.filter((o) => o.orderStatus === orderStatusFilter);

  const roleBadgeTitle = `${STAFF_ROLE_LABELS[staffRole]}${assignedBranch ? ` · ${assignedBranch}` : ''}`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-700 mb-1">
            <Shield className="w-4 h-4" />
            OFFNOT ENERGY Staff Portal · {roleBadgeTitle}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            {isSuperAdmin
              ? 'Super Admin & Executive Control Dashboard'
              : staffRole === 'managing_director' || staffRole === 'manager'
                ? `${STAFF_ROLE_LABELS[staffRole]} Operations Dashboard`
                : isBranchSalesRep
                  ? `Sales Rep Dashboard${assignedBranch ? ` (${assignedBranch})` : ''}`
                  : 'Accounts & Verification Dashboard'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Signed in as <strong>{user.email}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Branch Scope Filter */}
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700"
            aria-label="Filter by Branch"
          >
            <option value="ALL">All Branches</option>
            <option value="Dugbe Branch">Dugbe Branch</option>
            <option value="Dalute Branch">Dalute Branch</option>
          </select>

          {usingDemoCatalog && isSuperAdmin && (
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedDemoCatalog}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 cursor-pointer"
            >
              <Database className="w-4 h-4" />
              {seeding ? 'Seeding Firestore...' : 'Seed Demo Catalog to Firestore'}
            </button>
          )}
          <button
            type="button"
            onClick={handleExportFinancialReport}
            disabled={branchScopedOrders.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download CSV Report
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm font-semibold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{bannerMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm font-semibold text-red-900 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          {emailEnableNeeded && (
            <a
              href="https://console.firebase.google.com/project/tactical-iterator-h4cnq/authentication/providers"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold underline text-red-950 ml-6"
            >
              Open Firebase Console → Authentication → Sign-in method (Enable Email/Password)
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Role-Aware Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview', label: 'Overview & Analytics', icon: BarChart3, visible: true },
          {
            id: 'orders',
            label: `Orders & Delivery (${branchScopedOrders.length})`,
            icon: Truck,
            visible: true,
          },
          {
            id: 'payments',
            label: `Payments (${metrics.pendingTransfers.length} Pending)`,
            icon: CreditCard,
            visible: canVerifyPayments || isSuperAdmin,
          },
          {
            id: 'packages',
            label: `Solar Packages (${packages.length})`,
            icon: Package,
            visible: canManagePackages || isSuperAdmin,
          },
          {
            id: 'products',
            label: `Products (${products.length})`,
            icon: ClipboardList,
            visible: canManageProducts || isSuperAdmin,
          },
          {
            id: 'customers',
            label: `Customers (${usersList.length})`,
            icon: Users,
            visible: true,
          },
          {
            id: 'inquiries',
            label: `Inquiries & Reviews (${branchScopedInquiries.length})`,
            icon: MessageSquare,
            visible: true,
          },
          {
            id: 'staff',
            label: `Staff & Logins (${staffList.length})`,
            icon: UserPlus,
            visible: canManageStaff,
          },
          {
            id: 'settings',
            label: 'Settings & Policies',
            icon: Settings,
            visible: canEditSettings,
          },
        ]
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as AdminTab)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-700 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
      </div>

      {/* A. OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500 font-medium">Total Sales Value</p>
              <p className="text-2xl font-extrabold font-mono-num text-slate-900 mt-1">
                {formatNgn(metrics.totalSales)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500 font-medium">Total Revenue Collected</p>
              <p className="text-2xl font-extrabold font-mono-num text-emerald-700 mt-1">
                {formatNgn(metrics.totalRevenueCollected)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500 font-medium">Outstanding Instalments</p>
              <p className="text-2xl font-extrabold font-mono-num text-orange-700 mt-1">
                {formatNgn(metrics.totalOutstanding)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500 font-medium">Overdue Instalments</p>
              <p className="text-2xl font-extrabold font-mono-num text-red-700 mt-1">
                {metrics.overdueOrders.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Total Customers</p>
              <p className="text-xl font-bold font-mono-num text-slate-900">
                {metrics.totalCustomers}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">
                {branchFilter === 'ALL' ? 'Total Orders' : `${branchFilter} Orders`}
              </p>
              <p className="text-xl font-bold font-mono-num text-slate-900">
                {metrics.totalOrders}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Pending Approvals / Pay</p>
              <p className="text-xl font-bold font-mono-num text-orange-700">
                {metrics.pendingOrders}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Completed Installations</p>
              <p className="text-xl font-bold font-mono-num text-emerald-700">
                {metrics.completedOrders}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Monthly Sales Statistics</h2>
              {metrics.monthlyRows.length === 0 ? (
                <p className="text-xs text-slate-500">No orders recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {metrics.monthlyRows.map(([month, data]) => {
                    const ratio =
                      data.billed > 0
                        ? Math.min(100, Math.round((data.collected / data.billed) * 100))
                        : 0;
                    return (
                      <div key={month} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono-num font-bold text-slate-900">
                            {month} ({data.orders} orders)
                          </span>
                          <span className="font-mono-num text-slate-700">
                            Collected {formatNgn(data.collected)} / {formatNgn(data.billed)} (
                            {ratio}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-700 rounded-full"
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Operational Alerts</h2>
              {canVerifyPayments && metrics.pendingTransfers.length > 0 && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3.5 text-xs text-orange-950">
                  <p className="font-bold">
                    {metrics.pendingTransfers.length} Bank Transfer(s) Awaiting Verification
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('payments')}
                    className="mt-1 underline font-semibold cursor-pointer"
                  >
                    Review in Payment Management →
                  </button>
                </div>
              )}
              {metrics.lowStockProducts.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Low Stock Alerts ({metrics.lowStockProducts.length})
                  </p>
                  {metrics.lowStockProducts.map((p) => (
                    <p key={p.id}>
                      {p.name}: <strong className="font-mono-num">{p.stock} left</strong>
                    </p>
                  ))}
                </div>
              )}
              {metrics.overdueOrders.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900 space-y-1">
                  <p className="font-bold">
                    Overdue Instalment Accounts ({metrics.overdueOrders.length})
                  </p>
                  {metrics.overdueOrders.slice(0, 5).map((o) => (
                    <p key={o.id}>
                      {o.orderNumber} · {o.customerName} ({formatNgn(o.outstandingBalanceNgn)} due)
                    </p>
                  ))}
                </div>
              )}
              {canManageStaff && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950">
                  <p className="font-bold">Staff Management Ready</p>
                  <p className="mt-0.5">
                    Create logins for CEO, Managing Director, Manager, Dugbe Sales Rep &amp; Dalute
                    Sales Rep in the <strong>Staff &amp; Logins</strong> tab.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('staff')}
                    className="mt-1.5 underline font-bold cursor-pointer"
                  >
                    Manage Staff &amp; Passwords →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* B. ORDERS & DELIVERY MANAGEMENT */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              Orders, Approvals &amp; Delivery Gate
              {branchFilter !== 'ALL' ? ` · ${branchFilter}` : ''}
            </h2>
            <select
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_APPROVAL">Pending Management Approval</option>
              <option value="AWAITING_PAYMENT">Awaiting Payment</option>
              <option value="IN_INSTALMENT">Instalment In Progress</option>
              <option value="FULLY_PAID_AWAITING_DELIVERY">Fully Paid – Awaiting Delivery</option>
              <option value="SCHEDULED_FOR_INSTALLATION">Scheduled for Installation</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
                No matching orders found.
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isLocked = order.outstandingBalanceNgn > 0 && !order.overrideApplied;
                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-num text-xs font-bold text-slate-900">
                            {order.orderNumber}
                          </span>
                          {order.deliveryBranch && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                              {order.deliveryBranch}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {order.paymentPlan === 'full'
                              ? 'Full Payment'
                              : `${order.durationMonths}-Month Instalment`}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold">
                            {formatOrderStatusLabel(order.orderStatus)}
                          </span>
                          {order.overrideApplied && (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold">
                              SUPER ADMIN OVERRIDE
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-900 mt-1">
                          {order.packageName ||
                            order.items?.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                        </p>
                        <p className="text-xs text-slate-500">
                          Customer: {order.customerName} ({order.customerEmail} ·{' '}
                          {order.customerPhone}) · {order.deliveryAddress}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-right text-xs shrink-0">
                        <div>
                          <span className="text-slate-500 block">Total</span>
                          <span className="font-mono-num font-bold text-slate-900">
                            {formatNgn(order.totalAmountNgn)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Paid</span>
                          <span className="font-mono-num font-bold text-emerald-700">
                            {formatNgn(order.amountPaidNgn)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Balance</span>
                          <span className="font-mono-num font-bold text-orange-700">
                            {formatNgn(order.outstandingBalanceNgn)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      {order.orderStatus === 'PENDING_APPROVAL' && canApproveInstalments && (
                        <button
                          type="button"
                          onClick={() => {
                            setApprovalOrder(order);
                            setApprovalNotes('');
                          }}
                          className="px-3.5 py-2 rounded-lg bg-orange-600 text-white font-bold hover:bg-orange-700 cursor-pointer"
                        >
                          Review Instalment Application
                        </button>
                      )}

                      {order.outstandingBalanceNgn > 0 &&
                        order.approvalStatus !== 'PENDING_APPROVAL' &&
                        order.approvalStatus !== 'REJECTED' &&
                        order.orderStatus !== 'CANCELLED' &&
                        canVerifyPayments && (
                          <button
                            type="button"
                            onClick={() => {
                              setManualPayOrder(order);
                              setManualPayAmount(order.outstandingBalanceNgn);
                              setManualPayRef('');
                            }}
                            className="px-3.5 py-2 rounded-lg border border-emerald-700 text-emerald-800 font-bold hover:bg-emerald-50 cursor-pointer"
                          >
                            Record Branch / Verified Payment
                          </button>
                        )}

                      {canScheduleDelivery && (
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => {
                            setScheduleOrder(order);
                            setDeliveryDate(
                              order.deliveryScheduledDate || new Date().toISOString().split('T')[0]
                            );
                            setInstallationDate(
                              order.installationScheduledDate ||
                                new Date().toISOString().split('T')[0]
                            );
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white font-bold hover:bg-emerald-800 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                          title={
                            isLocked
                              ? 'Pay-Before-Delivery Lock: Customer must pay 100% before scheduling.'
                              : 'Schedule delivery and installation'
                          }
                        >
                          {isLocked ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Truck className="w-3.5 h-3.5" />
                          )}
                          Schedule Delivery &amp; Installation
                        </button>
                      )}

                      {order.orderStatus === 'SCHEDULED_FOR_INSTALLATION' && canScheduleDelivery && (
                        <button
                          type="button"
                          onClick={() => handleMarkCompleted(order)}
                          className="px-3.5 py-2 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 cursor-pointer"
                        >
                          Mark Installation Completed
                        </button>
                      )}

                      {isLocked && canOverrideDeliveryLock && order.orderStatus !== 'CANCELLED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setOverrideOrder(order);
                            setOverrideReason('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-400 bg-amber-50 text-amber-950 font-bold hover:bg-amber-100 cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Super Admin Override
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* C. PAYMENTS & OVERDUE MANAGEMENT */}
      {tab === 'payments' && (canVerifyPayments || isSuperAdmin) && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Payment Transactions &amp; Bank Transfer Verification
              </h2>
            </div>
            {payments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No payments logged yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3">Receipt</th>
                      <th className="px-5 py-3">Order &amp; Customer</th>
                      <th className="px-5 py-3">Method &amp; Ref</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {payments.map((pay) => (
                      <tr key={pay.id}>
                        <td className="px-5 py-3.5 font-mono-num font-bold text-slate-900">
                          {pay.receiptNumber}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-mono-num font-semibold">{pay.orderNumber}</div>
                          <div className="text-slate-500">{pay.customerName}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="uppercase font-semibold">
                            {pay.method.replace('_', ' ')}
                          </div>
                          <div className="font-mono-num text-slate-500">{pay.reference}</div>
                        </td>
                        <td className="px-5 py-3.5 font-mono-num font-bold text-emerald-800">
                          {formatNgn(pay.amountNgn)}
                        </td>
                        <td className="px-5 py-3.5 font-bold">
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
                        <td className="px-5 py-3.5 text-right space-x-2">
                          {pay.status === 'PENDING_VERIFICATION' && canVerifyPayments && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleVerifyBankTransfer(pay, true)}
                                className="px-2.5 py-1 rounded bg-emerald-700 text-white font-bold cursor-pointer"
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                onClick={() => handleVerifyBankTransfer(pay, false)}
                                className="px-2.5 py-1 rounded bg-red-600 text-white font-bold cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setReceiptPayment(pay)}
                            className="px-2.5 py-1 rounded border border-slate-300 font-semibold cursor-pointer"
                          >
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
        </div>
      )}

      {/* D. SOLAR PACKAGE MANAGEMENT */}
      {tab === 'packages' && (canManagePackages || isSuperAdmin) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Solar Packages Catalog</h2>
            {canManagePackages && (
              <button
                type="button"
                onClick={() => {
                  setEditingPackage({
                    id: `pkg_${Date.now()}`,
                    name: '',
                    capacityKva: '',
                    inverterCapacity: '',
                    batteryCapacity: '',
                    batteryTechnology: '',
                    panelQuantity: 4,
                    panelWattage: '',
                    accessoriesIncluded: '',
                    installationDetails: '',
                    warrantyInfo: '',
                    description: '',
                    priceNgn: 0,
                    allowedDurations: [1, 2, 3, 4, 5],
                    initialDepositPercent: storeSettings.defaultInitialDepositPercent,
                    adminChargePercent: storeSettings.defaultAdminChargePercent,
                    isFeatured: true,
                    isPublished: true,
                  });
                  setShowPackageModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Solar Package
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-700">{pkg.capacityKva}</span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          pkg.isPublished
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {pkg.isPublished ? 'Published' : 'Unpublished'}
                      </span>
                      {pkg.isDemo && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800">
                          Demo Template
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{pkg.name}</h3>
                    <p className="text-lg font-extrabold font-mono-num text-emerald-800">
                      {formatNgn(pkg.priceNgn)}
                    </p>
                  </div>

                  {canManagePackages && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPackage({ ...pkg, isDemo: false });
                          setShowPackageModal(true);
                        }}
                        className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                        aria-label="Edit Package"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {isSuperAdmin && !pkg.isDemo && (
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteDoc(doc(db, 'packages', pkg.id));
                            showNotice(`Deleted package ${pkg.name}.`);
                          }}
                          className="p-2 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 cursor-pointer"
                          aria-label="Delete Package"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-600">
                  Inverter: {pkg.inverterCapacity} · Battery: {pkg.batteryCapacity} (
                  {pkg.batteryTechnology}) · Panels: {pkg.panelQuantity} ({pkg.panelWattage})
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* E. PRODUCT MANAGEMENT */}
      {tab === 'products' && (canManageProducts || isSuperAdmin) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Individual Solar Products</h2>
            {canManageProducts && (
              <button
                type="button"
                onClick={() => {
                  setEditingProduct({
                    id: `prod_${Date.now()}`,
                    name: '',
                    model: '',
                    category: 'Hybrid Inverters',
                    description: '',
                    specs: '',
                    priceNgn: 0,
                    stock: 10,
                    lowStockThreshold: 3,
                    warranty: '',
                    isBestSeller: false,
                    isPublished: true,
                  });
                  setShowProductModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add Product
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3">Product &amp; Model</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Price</th>
                  <th className="px-5 py-3">Stock</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {products.map((prod) => (
                  <tr key={prod.id}>
                    <td className="px-5 py-3">
                      <p className="font-bold text-slate-900">{prod.name}</p>
                      <p className="text-slate-500 font-mono-num">{prod.model}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{prod.category}</td>
                    <td className="px-5 py-3 font-mono-num font-bold text-emerald-800">
                      {prod.priceNgn > 0 ? formatNgn(prod.priceNgn) : 'Configure Price'}
                    </td>
                    <td className="px-5 py-3 font-mono-num">
                      <span
                        className={
                          prod.stock <= (prod.lowStockThreshold ?? 3)
                            ? 'text-red-700 font-bold'
                            : 'text-slate-900'
                        }
                      >
                        {prod.stock}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`font-bold ${
                          prod.isPublished ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {prod.isPublished ? 'Published' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right space-x-2">
                      {canManageProducts && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct({ ...prod, isDemo: false });
                            setShowProductModal(true);
                          }}
                          className="px-2.5 py-1 rounded border border-slate-300 font-semibold cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                      {(isSuperAdmin ||
                        staffRole === 'managing_director' ||
                        staffRole === 'manager') &&
                        !prod.isDemo && (
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteDoc(doc(db, 'products', prod.id));
                              showNotice(`Deleted ${prod.name}.`);
                            }}
                            className="px-2.5 py-1 rounded border border-red-200 text-red-700 font-semibold cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* F. CUSTOMERS */}
      {tab === 'customers' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">Registered Customer Accounts</h2>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Email &amp; Phone</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Orders</th>
                <th className="px-5 py-3">Total Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {usersList.map((u) => {
                const uOrders = branchScopedOrders.filter((o) => o.userId === u.uid);
                const spent = uOrders.reduce((s, o) => s + (o.amountPaidNgn || 0), 0);
                return (
                  <tr key={u.uid}>
                    <td className="px-5 py-3 font-bold text-slate-900">{u.displayName}</td>
                    <td className="px-5 py-3">
                      <div>{u.email}</div>
                      <div className="text-slate-500">{u.phone || 'No phone saved'}</div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {[u.defaultCity, u.defaultState].filter(Boolean).join(', ') || 'Nigeria'}
                    </td>
                    <td className="px-5 py-3 font-mono-num font-bold">{uOrders.length}</td>
                    <td className="px-5 py-3 font-mono-num font-bold text-emerald-800">
                      {formatNgn(spent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* G. INQUIRIES, REVIEWS, AUDIT & NOTIFICATIONS */}
      {tab === 'inquiries' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Service &amp; Contact Inquiries ({branchScopedInquiries.length})
            </h2>
            {branchScopedInquiries.length === 0 ? (
              <p className="text-xs text-slate-500">No inquiries yet.</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {branchScopedInquiries.map((inq) => (
                  <div
                    key={inq.id}
                    className="rounded-xl border border-slate-200 p-4 text-xs space-y-2"
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">{inq.name}</p>
                        <p className="text-slate-500">
                          {inq.email} · {inq.phone} · {inq.branch || 'General'}
                        </p>
                      </div>
                      <select
                        value={inq.status}
                        onChange={async (e) => {
                          await updateDoc(doc(db, 'inquiries', inq.id), {
                            status: e.target.value,
                          });
                        }}
                        className="px-2 py-1 rounded border border-slate-300 bg-white font-semibold"
                      >
                        <option value="NEW">NEW</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                      </select>
                    </div>
                    <p className="text-slate-700">{inq.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Customer Reviews Moderation ({reviews.length})
              </h2>
              {reviews.length === 0 ? (
                <p className="text-xs text-slate-500">No submitted reviews yet.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {reviews.map((rev: Review) => (
                    <div
                      key={rev.id}
                      className="rounded-xl border border-slate-200 p-4 text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-900">
                            {rev.customerName} ({rev.location})
                          </p>
                          <p className="text-amber-500 flex items-center gap-0.5 mt-0.5">
                            {Array.from({ length: rev.rating }).map((_, idx) => (
                              <Star key={idx} className="w-3 h-3 fill-current" />
                            ))}
                          </p>
                        </div>
                        {(isSuperAdmin ||
                          staffRole === 'managing_director' ||
                          staffRole === 'manager') && (
                          <button
                            type="button"
                            onClick={async () => {
                              await updateDoc(doc(db, 'reviews', rev.id), {
                                isPublished: !rev.isPublished,
                              });
                            }}
                            className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                              rev.isPublished
                                ? 'bg-emerald-700 text-white'
                                : 'border border-slate-300 text-slate-700'
                            }`}
                          >
                            {rev.isPublished ? 'Published' : 'Publish'}
                          </button>
                        )}
                      </div>
                      <p className="text-slate-700 italic">&ldquo;{rev.quote}&rdquo;</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Recent Audit &amp; Notification Logs ({auditLogs.length})
              </h2>
              <div className="space-y-2 max-h-56 overflow-y-auto text-xs">
                {auditLogs.slice(0, 15).map((log) => (
                  <div key={log.id} className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                    <p className="font-bold text-slate-900">
                      {log.action} ·{' '}
                      <span className="font-normal text-slate-500">{log.actorEmail}</span>
                    </p>
                    <p className="text-slate-700">{log.details}</p>
                    {log.reason && (
                      <p className="text-amber-800 font-semibold">Reason: {log.reason}</p>
                    )}
                  </div>
                ))}
                {notificationsList.slice(0, 5).map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg bg-emerald-50/50 border border-emerald-100 p-2.5"
                  >
                    <p className="font-semibold text-emerald-900">
                      Notification ({n.status}): {n.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* H. STAFF CREATION, ROLE & BRANCH ASSIGNMENTS, PERMISSIONS & SUPER ADMIN PASSWORD */}
      {tab === 'staff' && canManageStaff && (
        <div className="space-y-6">
          {/* Super Admin Email & Password Login Setup */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-700" />
                  Super Admin Password Login Setup ({user.email})
                </h2>
                <p className="text-xs text-slate-600 max-w-2xl">
                  Set or update your Email &amp; Password credential in Firebase Authentication so you
                  can sign in on the Login page using <strong>{user.email}</strong> and your chosen
                  password (or Continue with Google).
                </p>
              </div>
              <form
                onSubmit={handleLinkSuperAdminPassword}
                className="flex flex-wrap items-center gap-2"
              >
                <div className="relative">
                  <input
                    required
                    minLength={6}
                    type={showAdminPwd ? 'text' : 'password'}
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    placeholder="Enter your password..."
                    className="px-3.5 py-2 pr-9 rounded-lg border border-slate-300 bg-white text-sm w-56"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPwd(!showAdminPwd)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                    aria-label="Toggle password visibility"
                  >
                    {showAdminPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={linkingPwd}
                  className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                >
                  {linkingPwd ? 'Saving...' : 'Save Super Admin Password'}
                </button>
              </form>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Create Brand-New Staff Login (Email & Password) */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-700" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Create New Staff Login Account
                  </h2>
                  <p className="text-xs text-slate-500">
                    Provision logins for CEO, Managing Director, Manager, Dugbe Sales Rep, Dalute
                    Sales Rep, or Accounts Staff without signing out.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateStaffLogin} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                    <input
                      required
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      placeholder="e.g. Adebayo Tunde"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Phone Number</label>
                    <input
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      placeholder="e.g. 080..."
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Staff Login Email</label>
                  <input
                    required
                    type="email"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    placeholder="staff@offnotenergy.com"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Initial Password (min 6 chars)
                  </label>
                  <div className="relative">
                    <input
                      required
                      minLength={6}
                      type={showNewStaffPwd ? 'text' : 'password'}
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      placeholder="Set staff password"
                      className="w-full px-3 py-2.5 pr-9 rounded-lg border border-slate-300 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewStaffPwd(!showNewStaffPwd)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                    >
                      {showNewStaffPwd ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Staff Role / Title
                    </label>
                    <select
                      value={newStaffRole}
                      onChange={(e) => {
                        const r = e.target.value as StaffRole;
                        setNewStaffRole(r);
                        if (r === 'ceo' || r === 'managing_director' || r === 'super_admin') {
                          setNewStaffBranch('Head Office');
                        } else if (newStaffBranch === 'Head Office') {
                          setNewStaffBranch('Dugbe Branch');
                        }
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      <option value="ceo">CEO (Full Executive Control)</option>
                      <option value="managing_director">Managing Director</option>
                      <option value="manager">Manager</option>
                      <option value="sales_rep">Sales Rep (Branch)</option>
                      <option value="accounts_staff">Accounts Staff</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Assigned Branch
                    </label>
                    <select
                      value={newStaffBranch}
                      onChange={(e) => setNewStaffBranch(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      <option value="Dugbe Branch">Dugbe Branch</option>
                      <option value="Dalute Branch">Dalute Branch</option>
                      <option value="Head Office">Head Office (All Branches)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creatingStaff}
                  className="w-full py-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                >
                  {creatingStaff ? 'Creating Staff Login...' : 'Create Staff Login & Assign Role'}
                </button>
              </form>
            </div>

            {/* Assign Role to Existing Registered User */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Assign Role to Existing Registered User
              </h2>
              <p className="text-xs text-slate-500">
                If a staff member already signed in via Google or created a customer account, select
                them below to assign their OFFNOT ENERGY role and branch.
              </p>
              <form onSubmit={handleAssignStaff} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Registered User</label>
                  <select
                    required
                    value={staffUidInput}
                    onChange={(e) => setStaffUidInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
                  >
                    <option value="">Select a registered user...</option>
                    {usersList.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Role</label>
                    <select
                      value={staffRoleInput}
                      onChange={(e) => setStaffRoleInput(e.target.value as StaffRole)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      <option value="ceo">CEO</option>
                      <option value="managing_director">Managing Director</option>
                      <option value="manager">Manager</option>
                      <option value="sales_rep">Sales Rep</option>
                      <option value="accounts_staff">Accounts Staff</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Branch</label>
                    <select
                      value={staffBranchInput}
                      onChange={(e) => setStaffBranchInput(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                      <option value="Dugbe Branch">Dugbe Branch</option>
                      <option value="Dalute Branch">Dalute Branch</option>
                      <option value="Head Office">Head Office</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 cursor-pointer"
                >
                  Assign / Update Existing User Role
                </button>
              </form>
            </div>
          </div>

          {/* Active Staff Directory */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Active Staff Directory ({staffList.length})
            </h2>
            {staffList.length === 0 ? (
              <p className="text-xs text-slate-500">
                No additional staff accounts assigned yet. Use the form above to create logins for
                your CEO, Managing Director, Manager, Dugbe Sales Rep, and Dalute Sales Rep.
              </p>
            ) : (
              <div className="space-y-3">
                {staffList.map((m) => (
                  <div
                    key={m.uid}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-xs"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-900">{m.displayName}</p>
                      <p className="text-slate-600">{m.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={m.role}
                        onChange={(e) =>
                          handleUpdateStaffRoleBranch(
                            m,
                            e.target.value as StaffRole,
                            m.branch || 'Dugbe Branch'
                          )
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                      >
                        <option value="ceo">CEO</option>
                        <option value="managing_director">Managing Director</option>
                        <option value="manager">Manager</option>
                        <option value="sales_rep">Sales Rep</option>
                        <option value="accounts_staff">Accounts Staff</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                      <select
                        value={m.branch || 'Dugbe Branch'}
                        onChange={(e) =>
                          handleUpdateStaffRoleBranch(m, m.role, e.target.value)
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold"
                      >
                        <option value="Head Office">Head Office</option>
                        <option value="Dugbe Branch">Dugbe Branch</option>
                        <option value="Dalute Branch">Dalute Branch</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleToggleStaffActive(m)}
                        className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                          m.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {m.active ? 'Active' : 'Disabled'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteDoc(doc(db, 'staff', m.uid));
                          showNotice(`Removed ${m.displayName} from staff directory.`);
                        }}
                        className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                        aria-label="Remove Staff"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Role Permissions Matrix */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 overflow-x-auto">
            <h2 className="text-base font-bold text-slate-900">Role Permissions Matrix</h2>
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">Permission</th>
                  {(['ceo', 'managing_director', 'manager', 'sales_rep', 'accounts_staff'] as StaffRole[]).map(
                    (r) => (
                      <th key={r} className="px-3 py-2 text-center uppercase">
                        {STAFF_ROLE_LABELS[r]}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { key: 'canManageProducts', label: 'Manage Products' },
                  { key: 'canManagePackages', label: 'Manage Solar Packages' },
                  { key: 'canApproveInstalments', label: 'Approve Instalments' },
                  { key: 'canVerifyPayments', label: 'Verify Payments' },
                  { key: 'canScheduleDelivery', label: 'Schedule Delivery' },
                  { key: 'canOverrideDeliveryLock', label: 'Override Delivery Lock' },
                  { key: 'canManageStaff', label: 'Create / Manage Staff' },
                  { key: 'canEditSettings', label: 'Edit Store Settings' },
                ].map((perm) => (
                  <tr key={perm.key}>
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{perm.label}</td>
                    {(['ceo', 'managing_director', 'manager', 'sales_rep', 'accounts_staff'] as StaffRole[]).map(
                      (r) => {
                        const rp = rolePermsMap[r] || DEFAULT_ROLE_PERMISSIONS[r];
                        const checked = Boolean(rp[perm.key as keyof RolePermission]);
                        return (
                          <td key={r} className="px-3 py-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = { ...rp, [perm.key]: e.target.checked };
                                void handleSaveRolePermission(r, next);
                              }}
                              className="w-4 h-4 accent-emerald-700 cursor-pointer"
                            />
                          </td>
                        );
                      }
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* I. SETTINGS & POLICIES */}
      {tab === 'settings' && canEditSettings && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6"
        >
          <h2 className="text-lg font-bold text-slate-900">
            Official Bank Details, Instalment Settings &amp; Store Policies
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Official Bank Name</label>
              <input
                value={settingsForm.bankName}
                onChange={(e) => setSettingsForm({ ...settingsForm, bankName: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account Name</label>
              <input
                value={settingsForm.bankAccountName}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, bankAccountName: e.target.value })
                }
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account Number</label>
              <input
                value={settingsForm.bankAccountNumber}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, bankAccountNumber: e.target.value })
                }
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono-num"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default Initial Deposit (%)
              </label>
              <input
                type="number"
                min={0}
                max={90}
                value={settingsForm.defaultInitialDepositPercent}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    defaultInitialDepositPercent: Number(e.target.value),
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default Admin Charge (%)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={settingsForm.defaultAdminChargePercent}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    defaultAdminChargePercent: Number(e.target.value),
                  })
                }
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Grace Period (Days)
              </label>
              <input
                type="number"
                min={0}
                max={30}
                value={settingsForm.gracePeriodDays}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, gracePeriodDays: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono-num"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Instalment Terms</label>
              <textarea
                rows={4}
                value={settingsForm.instalmentTerms}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, instalmentTerms: e.target.value })
                }
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Warranty Policy</label>
              <textarea
                rows={4}
                value={settingsForm.warrantyPolicy}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, warrantyPolicy: e.target.value })
                }
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Return Policy</label>
              <textarea
                rows={3}
                value={settingsForm.returnPolicy}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, returnPolicy: e.target.value })
                }
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Terms &amp; Conditions
              </label>
              <textarea
                rows={3}
                value={settingsForm.termsAndConditions}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, termsAndConditions: e.target.value })
                }
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            className="px-6 py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
          >
            Save Store Configuration
          </button>
        </form>
      )}

      {/* MODALS */}
      {/* Product Editor Modal */}
      {showProductModal && editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await setDoc(doc(db, 'products', editingProduct.id), {
                  ...editingProduct,
                  isDemo: false,
                  createdAt: editingProduct.createdAt || serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                showNotice(`Saved product ${editingProduct.name}.`);
                setShowProductModal(false);
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `products/${editingProduct.id}`);
              }
            }}
            className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Product Details</h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Product Name</label>
                <input
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Model Code</label>
                <input
                  required
                  value={editingProduct.model}
                  onChange={(e) => setEditingProduct({ ...editingProduct, model: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Category</label>
                <select
                  value={editingProduct.category}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      category: e.target.value as ProductCategory,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Price (₦)</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={editingProduct.priceNgn}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, priceNgn: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Stock Quantity</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={editingProduct.stock}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Warranty</label>
                <input
                  value={editingProduct.warranty || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, warranty: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="text-xs space-y-2">
              <label className="block font-semibold">Product Image (Upload or URL)</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer hover:bg-slate-50">
                  <Upload className="w-4 h-4" />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await compressImageToDataUrl(file);
                      setEditingProduct({ ...editingProduct, imageUrl: url });
                    }}
                  />
                </label>
                <input
                  value={editingProduct.imageUrl || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, imageUrl: e.target.value })
                  }
                  placeholder="Or paste image URL"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold mb-1">Key Specifications</label>
              <input
                required
                value={editingProduct.specs}
                onChange={(e) => setEditingProduct({ ...editingProduct, specs: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div className="text-xs">
              <label className="block font-semibold mb-1">Description</label>
              <textarea
                required
                rows={3}
                value={editingProduct.description}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, description: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div className="flex items-center gap-6 text-xs font-semibold">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.isPublished}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, isPublished: e.target.checked })
                  }
                  className="accent-emerald-700"
                />
                Published in Store
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingProduct.isBestSeller)}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, isBestSeller: e.target.checked })
                  }
                  className="accent-emerald-700"
                />
                Best Seller
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
            >
              Save Product
            </button>
          </form>
        </div>
      )}

      {/* Package Editor Modal */}
      {showPackageModal && editingPackage && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await setDoc(doc(db, 'packages', editingPackage.id), {
                  ...editingPackage,
                  allowedDurations:
                    editingPackage.allowedDurations.length > 0
                      ? editingPackage.allowedDurations
                      : [1, 2, 3, 4, 5],
                  isDemo: false,
                  createdAt: editingPackage.createdAt || serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                showNotice(`Saved solar package ${editingPackage.name}.`);
                setShowPackageModal(false);
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, `packages/${editingPackage.id}`);
              }
            }}
            className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Solar Package Editor</h3>
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Package Name</label>
                <input
                  required
                  value={editingPackage.name}
                  onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Capacity (e.g. 4kVA, 5kVA)</label>
                <input
                  required
                  value={editingPackage.capacityKva}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, capacityKva: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Full Price (₦)</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={editingPackage.priceNgn}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, priceNgn: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Inverter Capacity</label>
                <input
                  required
                  value={editingPackage.inverterCapacity}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, inverterCapacity: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Battery Capacity</label>
                <input
                  required
                  value={editingPackage.batteryCapacity}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, batteryCapacity: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Battery Technology</label>
                <input
                  required
                  value={editingPackage.batteryTechnology}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, batteryTechnology: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Solar Panel Quantity</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={editingPackage.panelQuantity}
                  onChange={(e) =>
                    setEditingPackage({
                      ...editingPackage,
                      panelQuantity: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Solar Panel Wattage</label>
                <input
                  required
                  value={editingPackage.panelWattage}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, panelWattage: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="text-xs space-y-2">
              <label className="block font-semibold">Package Image</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 font-semibold cursor-pointer hover:bg-slate-50">
                  <Upload className="w-4 h-4" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await compressImageToDataUrl(file);
                      setEditingPackage({ ...editingPackage, imageUrl: url });
                    }}
                  />
                </label>
                <input
                  value={editingPackage.imageUrl || ''}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, imageUrl: e.target.value })
                  }
                  placeholder="Or paste image URL"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block font-semibold mb-1">Accessories Included</label>
                <input
                  required
                  value={editingPackage.accessoriesIncluded}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, accessoriesIncluded: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Installation Details</label>
                <input
                  required
                  value={editingPackage.installationDetails}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, installationDetails: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Warranty Information</label>
                <input
                  required
                  value={editingPackage.warrantyInfo}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, warrantyInfo: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Description</label>
                <textarea
                  required
                  rows={3}
                  value={editingPackage.description}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, description: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Initial Deposit (%)</label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={editingPackage.initialDepositPercent ?? 0}
                  onChange={(e) =>
                    setEditingPackage({
                      ...editingPackage,
                      initialDepositPercent: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Admin Charge (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={editingPackage.adminChargePercent ?? 0}
                  onChange={(e) =>
                    setEditingPackage({
                      ...editingPackage,
                      adminChargePercent: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <span>Allowed Durations (Max 5 Months):</span>
              {[1, 2, 3, 4, 5].map((m) => (
                <label key={m} className="inline-flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPackage.allowedDurations.includes(m)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...editingPackage.allowedDurations, m].sort((a, b) => a - b)
                        : editingPackage.allowedDurations.filter((d) => d !== m);
                      setEditingPackage({ ...editingPackage, allowedDurations: next });
                    }}
                    className="accent-emerald-700"
                  />
                  {m === 1 ? 'Full' : `${m}m`}
                </label>
              ))}
            </div>

            <div className="flex items-center gap-6 text-xs font-semibold">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingPackage.isPublished}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, isPublished: e.target.checked })
                  }
                  className="accent-emerald-700"
                />
                Published
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingPackage.isFeatured)}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, isFeatured: e.target.checked })
                  }
                  className="accent-emerald-700"
                />
                Featured on Homepage
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 cursor-pointer"
            >
              Save Solar Package
            </button>
          </form>
        </div>
      )}

      {/* Instalment Approval Modal */}
      {approvalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Review Instalment Application · {approvalOrder.orderNumber}
            </h3>
            <p className="text-xs text-slate-600">
              Customer: <strong>{approvalOrder.customerName}</strong> ({approvalOrder.customerPhone}
              )
              <br />
              Package: <strong>{approvalOrder.packageName}</strong> ·{' '}
              {formatNgn(approvalOrder.totalAmountNgn)} ({approvalOrder.durationMonths} months)
            </p>
            <textarea
              rows={3}
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Optional approval or decline notes..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleDecisionApproval('APPROVED')}
                className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
              >
                Approve Application
              </button>
              <button
                type="button"
                onClick={() => handleDecisionApproval('REJECTED')}
                className="flex-1 py-2.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 cursor-pointer"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => setApprovalOrder(null)}
                className="px-3 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Entry Modal */}
      {manualPayOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordManualPayment}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">
              Record Verified Payment · {manualPayOrder.orderNumber}
            </h3>
            <div className="text-xs space-y-3">
              <div>
                <label className="block font-semibold mb-1">Amount (₦)</label>
                <input
                  required
                  type="number"
                  min={1}
                  max={manualPayOrder.outstandingBalanceNgn}
                  value={manualPayAmount}
                  onChange={(e) => setManualPayAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Channel</label>
                <select
                  value={manualPayMethod}
                  onChange={(e) =>
                    setManualPayMethod(e.target.value as 'bank_transfer' | 'branch_cash')
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="bank_transfer">Verified Bank Transfer</option>
                  <option value="branch_cash">Branch Cash / POS Payment</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Reference</label>
                <input
                  required
                  value={manualPayRef}
                  onChange={(e) => setManualPayRef(e.target.value)}
                  placeholder="Bank / POS Receipt Reference"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Save Verified Payment
              </button>
              <button
                type="button"
                onClick={() => setManualPayOrder(null)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delivery & Installation Schedule Modal */}
      {scheduleOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleScheduleDelivery}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">
              Schedule Delivery &amp; Installation · {scheduleOrder.orderNumber}
            </h3>
            <div className="text-xs space-y-3">
              <div>
                <label className="block font-semibold mb-1">Delivery Date</label>
                <input
                  required
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Installation Date</label>
                <input
                  required
                  type="date"
                  value={installationDate}
                  onChange={(e) => setInstallationDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Confirm Schedule
              </button>
              <button
                type="button"
                onClick={() => setScheduleOrder(null)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Super Admin Override Modal */}
      {overrideOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSuperAdminOverride}
            className="bg-white rounded-2xl border border-amber-300 max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
              <ShieldAlert className="w-5 h-5" />
              Super Admin Authorised Delivery Override
            </div>
            <p className="text-xs text-slate-600">
              Order <strong>{overrideOrder.orderNumber}</strong> has an outstanding balance of{' '}
              <strong>{formatNgn(overrideOrder.outstandingBalanceNgn)}</strong>. All overrides are
              permanently recorded in the Audit Log.
            </p>
            <textarea
              required
              minLength={10}
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Enter written management justification (minimum 10 characters)..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 cursor-pointer"
              >
                Authorize Override
              </button>
              <button
                type="button"
                onClick={() => setOverrideOrder(null)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {receiptPayment && (
        <ReceiptModal
          payment={receiptPayment}
          order={orders.find((o) => o.id === receiptPayment.orderId) || null}
          onClose={() => setReceiptPayment(null)}
        />
      )}
    </div>
  );
}
