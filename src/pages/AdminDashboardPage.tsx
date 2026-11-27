import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Database,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Package,
  Plus,
  RotateCcw,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
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
  type BannerSlide,
  type Inquiry,
  type InstalmentScheduleItem,
  type NotificationLog,
  type Order,
  type PageRoute,
  type PaymentRecord,
  type Product,
  type ProductCategory,
  type RefundRequest,
  type Review,
  type RolePermission,
  type SolarPackage,
  type StaffMember,
  type StaffRole,
  type StoreSetting,
  type UserProfile,
} from '../types';
import {
  downloadCsv,
  formatCustomerWhatsAppLink,
  formatNgn,
  formatOrderStatusLabel,
} from '../utils/instalments';
import {
  DEFAULT_BANNER_SLIDES,
  DEFAULT_FAVICON_URL,
  DEFAULT_LOGO_URL,
  DEFAULT_ROLE_PERMISSIONS,
  seedInitialCatalogIfAdmin,
  syncOfficialCatalogToFirestore,
} from '../utils/seedData';

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
  | 'campaigns'
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
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Unable to process image in browser.'));
          return;
        }
        let maxDim = 900;
        let quality = 0.8;
        let result = '';
        for (let attempt = 0; attempt < 6; attempt++) {
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
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          result = canvas.toDataURL('image/jpeg', quality);
          if (result.length <= 260000) {
            resolve(result);
            return;
          }
          quality = Math.max(0.35, quality - 0.12);
          maxDim = Math.round(maxDim * 0.78);
        }
        if (result.length <= 290000) {
          resolve(result);
        } else {
          reject(new Error('Image is still too large after compression. Please choose a smaller image or paste an image URL.'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function compressBrandingAsset(
  file: File,
  maxWidth = 1285,
  maxHeight = 900,
  preferPng = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      if (preferPng && rawDataUrl.length <= 240000) {
        resolve(rawDataUrl);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Unable to process image in browser.'));
          return;
        }
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const scale = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        if (preferPng) {
          const pngResult = canvas.toDataURL('image/png');
          if (pngResult.length <= 275000) {
            resolve(pngResult);
            return;
          }
        }
        let quality = 0.85;
        let result = '';
        for (let attempt = 0; attempt < 6; attempt++) {
          result = canvas.toDataURL('image/jpeg', quality);
          if (result.length <= 260000) {
            resolve(result);
            return;
          }
          quality = Math.max(0.35, quality - 0.12);
          canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
          canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        if (result.length <= 290000) {
          resolve(result);
        } else {
          reject(new Error('Image is still too large. Please use a smaller file or paste a URL.'));
        }
      };
      img.src = rawDataUrl;
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
    deleteUserRecord,
    resetPassword,
    linkOrUpdatePassword,
    logout,
  } = useAuth();
  const {
    products,
    packages,
    storeSettings,
    logoUrl,
    faviconUrl,
    banners,
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
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
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
  const [productModalError, setProductModalError] = useState('');
  const [editingPackage, setEditingPackage] = useState<SolarPackage | null>(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [packageModalError, setPackageModalError] = useState('');

  const [scheduleOrder, setScheduleOrder] = useState<Order | null>(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [installationDate, setInstallationDate] = useState('');

  const [overrideOrder, setOverrideOrder] = useState<Order | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const [approvalOrder, setApprovalOrder] = useState<Order | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [decidingApproval, setDecidingApproval] = useState(false);

  const [savingProduct, setSavingProduct] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [togglingTierUid, setTogglingTierUid] = useState<string | null>(null);
  const [savingManualPay, setSavingManualPay] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

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

  // Customer management (Reset Password & Delete User)
  const [resettingEmail, setResettingEmail] = useState<string | null>(null);
  const [confirmDeleteUserUid, setConfirmDeleteUserUid] = useState<string | null>(null);
  const [deletingUserUid, setDeletingUserUid] = useState<string | null>(null);

  // Order Deletion (Super Admin Only) & Refund Resolution (Accounts+)
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [resolvingRefund, setResolvingRefund] = useState<RefundRequest | null>(null);
  const [refundDecisionRef, setRefundDecisionRef] = useState('');
  const [refundDecisionNotes, setRefundDecisionNotes] = useState('');
  const [savingRefundDecision, setSavingRefundDecision] = useState(false);

  // Super-Admin-Only Branding (Logo, Favicon) & 1285x63 Slideshow Banners
  const [brandingLogoUrl, setBrandingLogoUrl] = useState(logoUrl || DEFAULT_LOGO_URL);
  const [brandingFaviconUrl, setBrandingFaviconUrl] = useState(faviconUrl || DEFAULT_FAVICON_URL);
  const [savingBranding, setSavingBranding] = useState(false);
  const [editingBanner, setEditingBanner] = useState<BannerSlide | null>(null);
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [savingBanner, setSavingBanner] = useState(false);
  const [seedingBanners, setSeedingBanners] = useState(false);

  // Happy New Month & New Product Broadcast Campaigns
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [selectedCatalogRef, setSelectedCatalogRef] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [sendingNewMonth, setSendingNewMonth] = useState(false);
  const [notifyUsersOnProductSave, setNotifyUsersOnProductSave] = useState(false);
  const [notifyUsersOnPackageSave, setNotifyUsersOnPackageSave] = useState(false);
  const autoMonthlySentRef = useRef<string>('');

  // Store Settings state
  const [settingsForm, setSettingsForm] = useState<StoreSetting>(storeSettings);
  useEffect(() => {
    setSettingsForm(storeSettings);
    setBrandingLogoUrl(storeSettings.logoUrl || DEFAULT_LOGO_URL);
    setBrandingFaviconUrl(storeSettings.faviconUrl || DEFAULT_FAVICON_URL);
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

    const unsubRefunds = onSnapshot(
      collection(db, 'refunds'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as RefundRequest);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setRefundRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'refunds')
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
      unsubRefunds();
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
      (o) =>
        o.orderStatus !== 'CANCELLED' &&
        o.orderStatus !== 'REJECTED' &&
        o.orderStatus !== 'REFUNDED'
    );
    const totalSales = activeOrders.reduce((s, o) => s + (o.totalAmountNgn || 0), 0);
    const totalRevenueCollected = branchScopedOrders
      .filter((o) => o.orderStatus !== 'REFUNDED')
      .reduce((s, o) => s + (o.amountPaidNgn || 0), 0);
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
    const pendingRefunds = refundRequests.filter(
      (r) => r.status === 'REQUESTED' || r.status === 'APPROVED'
    );
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
      pendingRefunds,
      lowStockProducts,
      monthlyRows,
    };
  }, [branchScopedOrders, payments, refundRequests, products, usersList]);

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
      const { productCount, packageCount } = await seedInitialCatalogIfAdmin();
      await writeAuditLog({
        action: 'SEED_CATALOG',
        targetType: 'settings',
        targetId: 'storeConfig',
        details: `Synced ${productCount} OFFNOT ENERGY products, ${packageCount} solar packages, role permissions, and store settings.`,
      });
      showNotice(
        `Synced ${productCount} OFFNOT ENERGY products, ${packageCount} solar packages, settings, and role permissions to Firestore.`
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to sync catalog.');
    } finally {
      setSeeding(false);
    }
  };

  const handleSyncOfficialCatalog = async () => {
    if (syncingCatalog) return;
    setSyncingCatalog(true);
    try {
      const { productCount, packageCount } = await syncOfficialCatalogToFirestore();
      await writeAuditLog({
        action: 'SYNC_OFFICIAL_PRODUCTS',
        targetType: 'products',
        targetId: 'offnot_catalog',
        details: `Synced ${productCount} OFFNOT ENERGY products and ${packageCount} official solar packages.`,
      });
      showNotice(
        `Synced ${productCount} OFFNOT ENERGY products & ${packageCount} official solar packages!`
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to sync OFFNOT catalog.');
    } finally {
      setSyncingCatalog(false);
    }
  };

  // Effective capabilities based on sole Super Admin / Role Permissions
  const canManageProducts = Boolean(permissions?.canManageProducts || isSuperAdmin);
  const canManagePackages = Boolean(permissions?.canManagePackages || isSuperAdmin);
  const canApproveInstalments = Boolean(permissions?.canApproveInstalments || isSuperAdmin);
  const canVerifyPayments = Boolean(permissions?.canVerifyPayments || isSuperAdmin);
  const canProcessRefunds =
    isSuperAdmin ||
    staffRole === 'ceo' ||
    staffRole === 'managing_director' ||
    staffRole === 'manager' ||
    staffRole === 'accounts_staff';
  const canScheduleDelivery = Boolean(permissions?.canScheduleDelivery || isSuperAdmin);
  const canOverrideDeliveryLock = isSuperAdmin;
  const canManageStaff = isSuperAdmin;
  const canSendCampaigns =
    isSuperAdmin ||
    staffRole === 'ceo' ||
    staffRole === 'managing_director' ||
    staffRole === 'manager';
  const canEditSettings = Boolean(permissions?.canEditSettings || isSuperAdmin);

  // --- Bulk Customer Broadcast Helper (Email + In-App Notifications) ---
  async function broadcastToAllCustomers(params: {
    subject: string;
    message: string;
    campaignType: 'happy_new_month' | 'new_product' | 'announcement';
    notifType: string;
  }): Promise<{
    sentCount: number;
    totalRecipients: number;
    emailConfigured: boolean;
    note?: string;
  }> {
    if (!user) throw new Error('You must be signed in.');
    const recipients = usersList
      .filter((u) => Boolean(u.email && u.email.includes('@')))
      .map((u) => ({ uid: u.uid, email: u.email, name: u.displayName || 'Valued Customer' }));

    if (recipients.length === 0) {
      throw new Error('No registered customer email addresses found yet.');
    }

    let sentCount = 0;
    let emailConfigured = false;
    let note: string | undefined;

    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          subject: params.subject.trim().slice(0, 160),
          message: params.message.trim().slice(0, 4000),
          campaignType: params.campaignType,
          recipients: recipients.map((r) => ({ email: r.email, name: r.name })),
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          sentCount?: number;
          emailConfigured?: boolean;
          note?: string;
        };
        sentCount = data.sentCount ?? 0;
        emailConfigured = Boolean(data.emailConfigured);
        note = data.note;
      }
    } catch {
      // Continue logging in-app notifications even if mail server fails
    }

    const baseTs = Date.now();
    await Promise.all(
      recipients.map((recipient, idx) => {
        const notifId = `notif_${baseTs}_${idx}_${Math.floor(Math.random() * 1000)}`;
        return setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          userId: recipient.uid,
          recipientEmail: recipient.email.slice(0, 160),
          recipientPhone: '',
          type: params.notifType.slice(0, 80),
          title: params.subject.trim().slice(0, 160),
          message: params.message.trim().slice(0, 1500),
          channel: sentCount > 0 ? 'email' : 'in_app',
          status: sentCount > 0 ? 'SENT' : 'LOGGED',
          orderId: '',
          createdAt: serverTimestamp(),
        }).catch(() => undefined);
      })
    );

    return {
      sentCount,
      totalRecipients: recipients.length,
      emailConfigured,
      note,
    };
  }

  // --- Send Password Reset Email (Super Admin Action) ---
  const handleAdminResetPassword = async (targetEmail: string, targetName: string) => {
    if (!isSuperAdmin || !targetEmail) return;
    setResettingEmail(targetEmail);
    setErrorMsg('');
    try {
      await resetPassword(targetEmail);
      await writeAuditLog({
        action: 'ADMIN_SEND_PASSWORD_RESET',
        targetType: 'user',
        targetId: targetEmail.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
        details: `Super Admin sent password reset email to ${targetName} (${targetEmail}).`,
      });
      showNotice(`Password reset email sent to ${targetEmail}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/operation-not-allowed')) {
        setEmailEnableNeeded(true);
        showError('Enable Email/Password sign-in in Firebase Console to send password reset links.');
      } else {
        showError(msg || 'Unable to send password reset email.');
      }
    } finally {
      setResettingEmail(null);
    }
  };

  // --- Delete User Profile & Staff Record (Super Admin Only) ---
  const handleDeleteUser = async (target: UserProfile) => {
    if (!isSuperAdmin || !user || target.uid === user.uid) return;
    setDeletingUserUid(target.uid);
    setErrorMsg('');
    try {
      await deleteUserRecord(target.uid);
      await writeAuditLog({
        action: 'DELETE_USER',
        targetType: 'user',
        targetId: target.uid,
        details: `Super Admin deleted user profile ${target.displayName} (${target.email}) and revoked any staff access.`,
      });
      setConfirmDeleteUserUid(null);
      showNotice(
        `Deleted ${target.displayName} (${target.email}) from database and revoked staff access.`
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to delete user record.');
    } finally {
      setDeletingUserUid(null);
    }
  };

  // --- Super Admin Toggle Customer Account Tier (Enduser <-> Installer/Dealer) ---
  const handleToggleCustomerTier = async (target: UserProfile) => {
    if (!isSuperAdmin || !user || togglingTierUid) return;
    const nextType = target.accountType === 'installer' ? 'end_user' : 'installer';
    setTogglingTierUid(target.uid);
    setErrorMsg('');
    try {
      await updateDoc(doc(db, 'users', target.uid), {
        accountType: nextType,
        ...(nextType === 'installer' ? { installerNetworkJoined: true } : { installerNetworkJoined: false }),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'UPDATE_CUSTOMER_TIER',
        targetType: 'user',
        targetId: target.uid,
        details: `Super Admin updated ${target.displayName} (${target.email}) to ${
          nextType === 'installer' ? 'Installer/Dealer' : 'Enduser'
        }.`,
      });
      showNotice(
        `${target.displayName} set to ${nextType === 'installer' ? 'Installer/Dealer' : 'Enduser'}.`
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to update customer account type.');
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    } finally {
      setTogglingTierUid(null);
    }
  };

  // --- Happy New Month Greeting Dispatch ---
  const handleSendHappyNewMonth = async (isAuto = false) => {
    if (sendingNewMonth || !canSendCampaigns) return;
    const now = new Date();
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const bodyText =
      (settingsForm.happyNewMonthMessage || '').trim() ||
      `Happy New Month from OFFNOT ENERGY! Wishing you uninterrupted clean solar power, peace of mind, and great success throughout ${monthName}.`;

    setSendingNewMonth(true);
    try {
      const result = await broadcastToAllCustomers({
        subject: `Happy New Month (${monthName}) from OFFNOT ENERGY!`,
        message: bodyText,
        campaignType: 'happy_new_month',
        notifType: 'HAPPY_NEW_MONTH',
      });

      await setDoc(
        doc(db, 'settings', 'storeConfig'),
        {
          id: 'storeConfig',
          allowedDurations: settingsForm.allowedDurations?.length
            ? settingsForm.allowedDurations
            : [1, 2, 3, 4, 5],
          defaultInitialDepositPercent: Math.min(
            90,
            Math.max(0, Number(settingsForm.defaultInitialDepositPercent) || 0)
          ),
          defaultAdminChargePercent: Math.min(
            50,
            Math.max(0, Number(settingsForm.defaultAdminChargePercent) || 0)
          ),
          gracePeriodDays: Math.min(30, Math.max(0, Number(settingsForm.gracePeriodDays) || 0)),
          bankName: (settingsForm.bankName || '').trim().slice(0, 120),
          bankAccountName: (settingsForm.bankAccountName || '').trim().slice(0, 160),
          bankAccountNumber: (settingsForm.bankAccountNumber || '').trim().slice(0, 30),
          instalmentTerms: (settingsForm.instalmentTerms || '').trim().slice(0, 5000),
          warrantyPolicy: (settingsForm.warrantyPolicy || '').trim().slice(0, 5000),
          returnPolicy: (settingsForm.returnPolicy || '').trim().slice(0, 5000),
          privacyPolicy: (settingsForm.privacyPolicy || '').trim().slice(0, 5000),
          termsAndConditions: (settingsForm.termsAndConditions || '').trim().slice(0, 5000),
          autoHappyNewMonth: settingsForm.autoHappyNewMonth !== false,
          happyNewMonthMessage: bodyText.slice(0, 2000),
          lastNewMonthSent: monthKey,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await writeAuditLog({
        action: isAuto ? 'AUTO_HAPPY_NEW_MONTH_CAMPAIGN' : 'HAPPY_NEW_MONTH_CAMPAIGN',
        targetType: 'settings',
        targetId: 'storeConfig',
        details: `Sent Happy New Month (${monthKey}) to ${result.totalRecipients} registered users (${result.sentCount} emails sent).`,
      });

      showNotice(
        result.emailConfigured && result.sentCount > 0
          ? `Happy New Month message emailed and notified to ${result.totalRecipients} customers (${result.sentCount} emails sent).`
          : `Happy New Month greeting logged to ${result.totalRecipients} customer accounts!${result.note ? ` (${result.note})` : ''}`
      );
    } catch (err) {
      if (!isAuto) {
        showError(err instanceof Error ? err.message : 'Unable to send Happy New Month message.');
      }
    } finally {
      setSendingNewMonth(false);
    }
  };

  // Automatic 1st-of-the-month Happy New Month trigger when Super Admin is online
  useEffect(() => {
    if (!isSuperAdmin || usersList.length === 0) return;
    if (storeSettings.autoHappyNewMonth === false) return;
    const now = new Date();
    if (now.getDate() !== 1) return;
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (storeSettings.lastNewMonthSent === monthKey) return;
    if (autoMonthlySentRef.current === monthKey) return;
    autoMonthlySentRef.current = monthKey;
    void handleSendHappyNewMonth(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, usersList.length, storeSettings.autoHappyNewMonth, storeSettings.lastNewMonthSent]);

  // --- New Product / Announcement Mail Broadcast ---
  const handleSendBroadcastCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sendingBroadcast || !canSendCampaigns) return;
    if (!broadcastSubject.trim() || !broadcastMessage.trim()) {
      showError('Please enter both an email subject and message body.');
      return;
    }
    setSendingBroadcast(true);
    try {
      const result = await broadcastToAllCustomers({
        subject: broadcastSubject,
        message: broadcastMessage,
        campaignType: 'new_product',
        notifType: 'NEW_PRODUCT_ANNOUNCEMENT',
      });
      await writeAuditLog({
        action: 'NEW_PRODUCT_BROADCAST',
        targetType: 'notifications',
        targetId: `broadcast_${Date.now()}`,
        details: `Broadcast "${broadcastSubject.trim()}" to ${result.totalRecipients} users (${result.sentCount} emails sent).`,
      });
      showNotice(
        result.emailConfigured && result.sentCount > 0
          ? `New product mail sent to ${result.sentCount} customers and logged in all customer accounts!`
          : `New product announcement notified to ${result.totalRecipients} customer accounts!${result.note ? ` (${result.note})` : ''}`
      );
      setBroadcastSubject('');
      setBroadcastMessage('');
      setSelectedCatalogRef('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to send customer broadcast.');
    } finally {
      setSendingBroadcast(false);
    }
  };

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
    if (!approvalOrder || !user || decidingApproval) return;
    setApprovalError('');
    setDecidingApproval(true);
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

      showNotice(
        decision === 'APPROVED'
          ? `Order ${approvalOrder.orderNumber} approved for instalment payments.`
          : `Order ${approvalOrder.orderNumber} declined.`
      );
      setApprovalOrder(null);
      setApprovalNotes('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update instalment application.';
      setApprovalError(msg);
      showError(msg);
      handleFirestoreError(err, OperationType.UPDATE, `orders/${approvalOrder.id}`);
    } finally {
      setDecidingApproval(false);
    }
  };

  // --- Apply Verified Payment to Order ---
  async function applyPaymentAmountToOrder(order: Order, addAmountNgn: number, reference: string) {
    const totalNgn = Math.round(order.totalAmountNgn || 0);
    const currentPaid = Math.round(order.amountPaidNgn || 0);
    const newPaid = Math.min(totalNgn, currentPaid + Math.round(addAmountNgn));
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
        const totalNgn = Math.round(order.totalAmountNgn || 0);
        const currentPaid = Math.round(order.amountPaidNgn || 0);
        await updateDoc(doc(db, 'orders', order.id), {
          amountPaidNgn: currentPaid,
          outstandingBalanceNgn: Math.max(0, totalNgn - currentPaid),
          paymentStatus: currentPaid > 0 ? 'PARTIALLY_PAID' : 'UNPAID',
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
      showError(err instanceof Error ? err.message : 'Unable to update payment verification.');
      handleFirestoreError(err, OperationType.UPDATE, `payments/${pay.id}`);
    }
  };

  const handleRecordManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPayOrder || !user || savingManualPay) return;
    const roundedPay = Math.round(manualPayAmount);
    if (roundedPay <= 0 || roundedPay > manualPayOrder.outstandingBalanceNgn) {
      showError('Amount must be > ₦0 and <= outstanding balance.');
      return;
    }

    const payId = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const receiptNumber = `RCP-${String(Date.now()).slice(-7)}`;
    const ref = manualPayRef.trim().slice(0, 120) || `BR-${String(Date.now()).slice(-6)}`;
    if (ref.length < 3) {
      showError('Payment reference must be at least 3 characters.');
      return;
    }

    setSavingManualPay(true);
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
        amountNgn: roundedPay,
        method: manualPayMethod,
        channel: manualPayMethod === 'branch_cash' ? 'Branch Payment' : 'Verified Transfer',
        status: 'VERIFIED',
        verifiedBy: user.email || user.uid,
        notes: `Recorded directly by ${user.email}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const res = await applyPaymentAmountToOrder(manualPayOrder, roundedPay, ref);

      await writeAuditLog({
        action: 'RECORD_VERIFIED_PAYMENT',
        targetType: 'order',
        targetId: manualPayOrder.id,
        details: `Recorded verified ${manualPayMethod} of ${formatNgn(roundedPay)} (${receiptNumber}) for ${manualPayOrder.orderNumber}.`,
      });

      await logAndSendNotification({
        userId: manualPayOrder.userId,
        recipientEmail: manualPayOrder.customerEmail,
        recipientPhone: manualPayOrder.customerPhone,
        type: res.fullyPaid ? 'FULL_PAYMENT_COMPLETED' : 'PAYMENT_VERIFIED',
        title: `Official Receipt ${receiptNumber} (${manualPayOrder.orderNumber})`,
        message: `Payment of ${formatNgn(roundedPay)} recorded. Outstanding balance: ${formatNgn(res.newOutstanding)}.`,
        orderId: manualPayOrder.id,
      });

      showNotice(`Recorded verified payment ${receiptNumber}.`);
      setManualPayOrder(null);
      setManualPayRef('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to record manual payment.');
      handleFirestoreError(err, OperationType.CREATE, `payments/${payId}`);
    } finally {
      setSavingManualPay(false);
    }
  };

  // --- Schedule Delivery & Installation (Strictly Gated) ---
  const handleScheduleDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleOrder || savingSchedule) return;
    if (scheduleOrder.outstandingBalanceNgn > 0 && !scheduleOrder.overrideApplied) {
      showError('Policy Lock: Cannot schedule delivery while outstanding balance > ₦0.');
      return;
    }

    setSavingSchedule(true);
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
      showError(err instanceof Error ? err.message : 'Unable to schedule delivery.');
      handleFirestoreError(err, OperationType.UPDATE, `orders/${scheduleOrder.id}`);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleMarkCompleted = async (order: Order) => {
    if (order.outstandingBalanceNgn > 0 && !order.overrideApplied) {
      showError('Cannot mark completed before full payment or Super Admin override.');
      return;
    }
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
      showError(err instanceof Error ? err.message : 'Unable to mark order completed.');
      handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const handleSuperAdminOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideOrder || !user || savingOverride) return;
    if (!isSuperAdmin) {
      showError('Only the Super Admin can authorize delivery lock overrides.');
      return;
    }
    if (overrideReason.trim().length < 10) {
      showError('Override reason must be at least 10 characters.');
      return;
    }

    setSavingOverride(true);
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
      showError(err instanceof Error ? err.message : 'Unable to apply override.');
      handleFirestoreError(err, OperationType.UPDATE, `orders/${overrideOrder.id}`);
    } finally {
      setSavingOverride(false);
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
      showError(err instanceof Error ? err.message : 'Unable to assign staff role.');
      handleFirestoreError(err, OperationType.WRITE, `staff/${targetUser.uid}`);
    }
  };

  const handleToggleStaffActive = async (member: StaffMember) => {
    if (member.uid === user.uid) {
      showError('You cannot disable your own active Super Admin account.');
      return;
    }
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
      showNotice(`${member.displayName} is now ${!member.active ? 'Active' : 'Disabled'}.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to update staff status.');
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
      showError(err instanceof Error ? err.message : 'Unable to update staff role/branch.');
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
      showError(err instanceof Error ? err.message : 'Unable to save role permissions.');
      handleFirestoreError(err, OperationType.WRITE, `rolePermissions/${role}`);
    }
  };

  // --- Super Admin Delete Order & Delivery Records ---
  const handleDeleteOrder = async (order: Order) => {
    if (!isSuperAdmin || !user || deletingOrderId) return;
    setDeletingOrderId(order.id);
    setErrorMsg('');
    try {
      await deleteDoc(doc(db, 'orders', order.id));
      const linkedPays = payments.filter((p) => p.orderId === order.id);
      const linkedRefs = refundRequests.filter((r) => r.orderId === order.id);
      await Promise.all([
        ...linkedPays.map((p) => deleteDoc(doc(db, 'payments', p.id)).catch(() => undefined)),
        ...linkedRefs.map((r) => deleteDoc(doc(db, 'refunds', r.id)).catch(() => undefined)),
      ]);
      await writeAuditLog({
        action: 'DELETE_ORDER',
        targetType: 'order',
        targetId: order.id,
        details: `Super Admin deleted order ${order.orderNumber} (${order.customerName}, Total ${formatNgn(
          order.totalAmountNgn
        )}) along with ${linkedPays.length} payment(s) and ${linkedRefs.length} refund record(s).`,
      });
      setConfirmDeleteOrderId(null);
      showNotice(`Deleted order ${order.orderNumber} and linked records.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to delete order.');
      handleFirestoreError(err, OperationType.DELETE, `orders/${order.id}`);
    } finally {
      setDeletingOrderId(null);
    }
  };

  // --- Resolve Customer Refund Request (Accounts Staff / Manager / MD / CEO / Super Admin) ---
  const handleResolveRefund = async (decision: 'REFUNDED' | 'DECLINED') => {
    if (!resolvingRefund || !user || !canProcessRefunds || savingRefundDecision) return;
    setSavingRefundDecision(true);
    setErrorMsg('');
    try {
      const cleanNotes = refundDecisionNotes.trim().slice(0, 1000);
      const cleanRef = refundDecisionRef.trim().slice(0, 120);
      await updateDoc(doc(db, 'refunds', resolvingRefund.id), {
        status: decision,
        adminNotes: cleanNotes,
        refundReference: cleanRef,
        processedBy: (user.email || user.uid).slice(0, 160),
        updatedAt: serverTimestamp(),
      });

      const targetOrder = orders.find((o) => o.id === resolvingRefund.orderId);
      if (targetOrder) {
        if (decision === 'REFUNDED') {
          await updateDoc(doc(db, 'orders', targetOrder.id), {
            refundStatus: 'REFUNDED',
            refundAmountNgn: resolvingRefund.amountRequestedNgn,
            refundNotes: cleanNotes || resolvingRefund.reason,
            paymentStatus: 'REFUNDED',
            orderStatus: 'REFUNDED',
            deliveryAuthorized: false,
            updatedAt: serverTimestamp(),
          });
        } else {
          const restoredOrderStatus =
            targetOrder.outstandingBalanceNgn === 0
              ? 'FULLY_PAID_AWAITING_DELIVERY'
              : (targetOrder.amountPaidNgn || 0) > 0
                ? 'IN_INSTALMENT'
                : 'AWAITING_PAYMENT';
          await updateDoc(doc(db, 'orders', targetOrder.id), {
            refundStatus: 'DECLINED',
            refundAmountNgn: resolvingRefund.amountRequestedNgn,
            refundNotes: cleanNotes || 'Refund request declined by Accounts/Management.',
            paymentStatus: targetOrder.paymentStatus,
            orderStatus: restoredOrderStatus,
            deliveryAuthorized: Boolean(targetOrder.deliveryAuthorized),
            updatedAt: serverTimestamp(),
          });
        }
      }

      await writeAuditLog({
        action: decision === 'REFUNDED' ? 'APPROVE_REFUND' : 'DECLINE_REFUND',
        targetType: 'refund',
        targetId: resolvingRefund.id,
        details: `${decision} refund of ${formatNgn(resolvingRefund.amountRequestedNgn)} for order ${
          resolvingRefund.orderNumber
        }${cleanRef ? ` (Ref: ${cleanRef})` : ''}.`,
      });

      await logAndSendNotification({
        userId: resolvingRefund.userId,
        recipientEmail: resolvingRefund.customerEmail,
        recipientPhone: resolvingRefund.customerPhone,
        type: `REFUND_${decision}`,
        title:
          decision === 'REFUNDED'
            ? `Refund Processed (${resolvingRefund.orderNumber})`
            : `Refund Request Update (${resolvingRefund.orderNumber})`,
        message:
          decision === 'REFUNDED'
            ? `Your refund of ${formatNgn(resolvingRefund.amountRequestedNgn)} for order ${
                resolvingRefund.orderNumber
              } has been approved and processed to ${resolvingRefund.bankName} (${
                resolvingRefund.accountNumber
              }).${cleanRef ? ` Transfer Ref: ${cleanRef}.` : ''}`
            : `Your refund request for order ${
                resolvingRefund.orderNumber
              } could not be approved at this time.${cleanNotes ? ` Note: ${cleanNotes}` : ''}`,
        orderId: resolvingRefund.orderId,
      });

      showNotice(
        decision === 'REFUNDED'
          ? `Refund of ${formatNgn(resolvingRefund.amountRequestedNgn)} marked REFUNDED for ${resolvingRefund.orderNumber}.`
          : `Refund request declined for ${resolvingRefund.orderNumber}.`
      );
      setResolvingRefund(null);
      setRefundDecisionNotes('');
      setRefundDecisionRef('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to process refund request.');
      handleFirestoreError(err, OperationType.UPDATE, `refunds/${resolvingRefund.id}`);
    } finally {
      setSavingRefundDecision(false);
    }
  };

  // --- Super-Admin-Only Website Branding (Logo & Favicon) ---
  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || savingBranding) return;
    setSavingBranding(true);
    try {
      const nextLogo = brandingLogoUrl.trim().slice(0, 295000) || DEFAULT_LOGO_URL;
      const nextFavicon = brandingFaviconUrl.trim().slice(0, 295000) || DEFAULT_FAVICON_URL;
      await setDoc(
        doc(db, 'settings', 'storeConfig'),
        {
          id: 'storeConfig',
          logoUrl: nextLogo,
          faviconUrl: nextFavicon,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await writeAuditLog({
        action: 'UPDATE_WEBSITE_BRANDING',
        targetType: 'settings',
        targetId: 'storeConfig',
        details: 'Super Admin updated website logo and/or favicon.',
      });
      showNotice('Website logo and favicon updated across the storefront.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to update website branding.');
      handleFirestoreError(err, OperationType.WRITE, 'settings/storeConfig');
    } finally {
      setSavingBranding(false);
    }
  };

  // --- Super-Admin-Only 1285x63 Slideshow Banner CRUD ---
  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !editingBanner || savingBanner) return;
    const safeTitle = editingBanner.title.trim().slice(0, 160);
    const safeCta = editingBanner.ctaText.trim().slice(0, 60) || 'Explore';
    if (!safeTitle) {
      showError('Banner title is required.');
      return;
    }
    setSavingBanner(true);
    try {
      await setDoc(doc(db, 'banners', editingBanner.id), {
        id: editingBanner.id,
        title: safeTitle,
        subtitle: (editingBanner.subtitle || '').trim().slice(0, 200),
        ctaText: safeCta,
        ctaRoute: editingBanner.ctaRoute || 'packages',
        imageUrl: (editingBanner.imageUrl || '').trim().slice(0, 295000),
        themeVariant: editingBanner.themeVariant || 'emerald',
        sortOrder: Math.min(1000, Math.max(0, Math.round(Number(editingBanner.sortOrder) || 0))),
        isActive: Boolean(editingBanner.isActive),
        createdAt: editingBanner.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await writeAuditLog({
        action: 'SAVE_BANNER_SLIDE',
        targetType: 'banner',
        targetId: editingBanner.id,
        details: `Super Admin saved slideshow banner "${safeTitle}".`,
      });
      setShowBannerModal(false);
      setEditingBanner(null);
      showNotice(`Saved banner slide "${safeTitle}".`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to save banner slide.');
      handleFirestoreError(err, OperationType.WRITE, `banners/${editingBanner.id}`);
    } finally {
      setSavingBanner(false);
    }
  };

  const handleToggleBannerActive = async (banner: BannerSlide) => {
    if (!isSuperAdmin) return;
    try {
      await updateDoc(doc(db, 'banners', banner.id), {
        isActive: !banner.isActive,
        updatedAt: serverTimestamp(),
      });
      showNotice(`Banner "${banner.title}" is now ${!banner.isActive ? 'Active' : 'Paused'}.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to toggle banner.');
      handleFirestoreError(err, OperationType.UPDATE, `banners/${banner.id}`);
    }
  };

  const handleDeleteBanner = async (banner: BannerSlide) => {
    if (!isSuperAdmin) return;
    try {
      await deleteDoc(doc(db, 'banners', banner.id));
      await writeAuditLog({
        action: 'DELETE_BANNER_SLIDE',
        targetType: 'banner',
        targetId: banner.id,
        details: `Super Admin deleted slideshow banner "${banner.title}".`,
      });
      showNotice(`Deleted banner "${banner.title}".`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to delete banner.');
      handleFirestoreError(err, OperationType.DELETE, `banners/${banner.id}`);
    }
  };

  const handleSeedDefaultBanners = async () => {
    if (!isSuperAdmin || seedingBanners) return;
    setSeedingBanners(true);
    try {
      await Promise.all(
        DEFAULT_BANNER_SLIDES.map((b) =>
          setDoc(doc(db, 'banners', b.id), {
            ...b,
            imageUrl: b.imageUrl || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );
      showNotice(`Synced ${DEFAULT_BANNER_SLIDES.length} editable slideshow banners to Firestore.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to seed default banners.');
    } finally {
      setSeedingBanners(false);
    }
  };

  // --- Store Settings Save ---
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      await setDoc(
        doc(db, 'settings', 'storeConfig'),
        {
          id: 'storeConfig',
          allowedDurations: settingsForm.allowedDurations?.length
            ? settingsForm.allowedDurations
            : [1, 2, 3, 4, 5],
          defaultInitialDepositPercent: Math.min(
            90,
            Math.max(0, Number(settingsForm.defaultInitialDepositPercent) || 0)
          ),
          defaultAdminChargePercent: Math.min(
            50,
            Math.max(0, Number(settingsForm.defaultAdminChargePercent) || 0)
          ),
          gracePeriodDays: Math.min(30, Math.max(0, Number(settingsForm.gracePeriodDays) || 0)),
          bankName: (settingsForm.bankName || '').trim().slice(0, 120),
          bankAccountName: (settingsForm.bankAccountName || '').trim().slice(0, 160),
          bankAccountNumber: (settingsForm.bankAccountNumber || '').trim().slice(0, 30),
          instalmentTerms: (settingsForm.instalmentTerms || '').trim().slice(0, 5000),
          warrantyPolicy: (settingsForm.warrantyPolicy || '').trim().slice(0, 5000),
          returnPolicy: (settingsForm.returnPolicy || '').trim().slice(0, 5000),
          privacyPolicy: (settingsForm.privacyPolicy || '').trim().slice(0, 5000),
          termsAndConditions: (settingsForm.termsAndConditions || '').trim().slice(0, 5000),
          autoHappyNewMonth: settingsForm.autoHappyNewMonth !== false,
          happyNewMonthMessage: (settingsForm.happyNewMonthMessage || '').trim().slice(0, 2000),
          lastNewMonthSent: (settingsForm.lastNewMonthSent || '').trim().slice(0, 20),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await writeAuditLog({
        action: 'UPDATE_STORE_SETTINGS',
        targetType: 'settings',
        targetId: 'storeConfig',
        details: 'Updated OFFNOT ENERGY bank details, instalment parameters, and store policies.',
      });
      showNotice('Store configuration & policies saved.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Unable to save store settings.');
      handleFirestoreError(err, OperationType.WRITE, 'settings/storeConfig');
    } finally {
      setSavingSettings(false);
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 mb-1">
            <Shield className="w-4 h-4" />
            OFFNOT ENERGY Staff Portal · {roleBadgeTitle}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {isSuperAdmin
              ? 'Super Admin & Executive Control Dashboard'
              : staffRole === 'managing_director' || staffRole === 'manager'
                ? `${STAFF_ROLE_LABELS[staffRole]} Operations Dashboard`
                : isBranchSalesRep
                  ? `Sales Rep Dashboard${assignedBranch ? ` (${assignedBranch})` : ''}`
                  : 'Accounts & Verification Dashboard'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Signed in as <strong>{user.email}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Branch Scope Filter */}
          <select
            value={branchFilter}
            disabled={isBranchSalesRep && Boolean(assignedBranch) && assignedBranch !== 'Head Office'}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-600 dark:disabled:text-slate-400"
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
              {seeding ? 'Syncing Firestore...' : 'Sync All 66 Products & 29 Packages'}
            </button>
          )}
          <button
            type="button"
            onClick={handleExportFinancialReport}
            disabled={branchScopedOrders.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download CSV Report
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </button>
        </div>
      </div>

      {isSuperAdmin && !user.providerData.some((p) => p.providerId === 'password') && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs sm:text-sm text-amber-950 dark:text-amber-200 flex flex-wrap items-center justify-between gap-3">
          <span>
            <strong>Password Login Not Linked Yet:</strong> Set your Email &amp; Password credential so
            you can sign in directly with <strong>{user.email}</strong> + password on any device.
          </span>
          <button
            type="button"
            onClick={() => setTab('staff')}
            className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-bold hover:bg-amber-800 cursor-pointer shrink-0"
          >
            Set Super Admin Password →
          </button>
        </div>
      )}

      {bannerMsg && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs sm:text-sm font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{bannerMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs sm:text-sm font-semibold text-red-900 dark:text-red-200 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          {emailEnableNeeded && (
            <a
              href="https://console.firebase.google.com/project/tactical-iterator-h4cnq/authentication/providers"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold underline text-red-950 dark:text-red-200 ml-6"
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
            label: `Payments & Refunds (${metrics.pendingTransfers.length + metrics.pendingRefunds.length} Pending)`,
            icon: CreditCard,
            visible: canVerifyPayments || canProcessRefunds || isSuperAdmin,
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
            id: 'campaigns',
            label: 'Customer Mail & Campaigns',
            icon: Megaphone,
            visible: canSendCampaigns,
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
            label: isSuperAdmin ? 'Settings, Logo & Banners' : 'Settings & Policies',
            icon: Settings,
            visible: canEditSettings || isSuperAdmin,
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
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
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
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Sales Value</p>
              <p className="text-2xl font-extrabold font-mono-num text-slate-900 dark:text-white mt-1">
                {formatNgn(metrics.totalSales)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Revenue Collected</p>
              <p className="text-2xl font-extrabold font-mono-num text-emerald-700 dark:text-emerald-400 mt-1">
                {formatNgn(metrics.totalRevenueCollected)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Outstanding Instalments</p>
              <p className="text-2xl font-extrabold font-mono-num text-orange-700 dark:text-orange-400 mt-1">
                {formatNgn(metrics.totalOutstanding)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Overdue Instalments</p>
              <p className="text-2xl font-extrabold font-mono-num text-red-700 dark:text-red-400 mt-1">
                {metrics.overdueOrders.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Customers</p>
              <p className="text-xl font-bold font-mono-num text-slate-900 dark:text-white">
                {metrics.totalCustomers}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {branchFilter === 'ALL' ? 'Total Orders' : `${branchFilter} Orders`}
              </p>
              <p className="text-xl font-bold font-mono-num text-slate-900 dark:text-white">
                {metrics.totalOrders}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Pending Approvals / Pay</p>
              <p className="text-xl font-bold font-mono-num text-orange-700 dark:text-orange-400">
                {metrics.pendingOrders}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Completed Installations</p>
              <p className="text-xl font-bold font-mono-num text-emerald-700 dark:text-emerald-400">
                {metrics.completedOrders}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Monthly Sales Statistics</h2>
              {metrics.monthlyRows.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No orders recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {metrics.monthlyRows.map(([month, data]) => {
                    const ratio =
                      data.billed > 0
                        ? Math.min(100, Math.round((data.collected / data.billed) * 100))
                        : 0;
                    return (
                      <div key={month} className="space-y-1">
                        <div className="flex flex-wrap justify-between gap-2 text-xs">
                          <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                            {month} ({data.orders} orders)
                          </span>
                          <span className="font-mono-num text-slate-700 dark:text-slate-300">
                            Collected {formatNgn(data.collected)} / {formatNgn(data.billed)} (
                            {ratio}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
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

            <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Operational Alerts</h2>
              {canProcessRefunds && metrics.pendingRefunds.length > 0 && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-950 dark:text-amber-200">
                  <p className="font-bold">
                    {metrics.pendingRefunds.length} Customer Refund Request(s) Pending Review
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab('payments')}
                    className="mt-1 underline font-semibold cursor-pointer"
                  >
                    Process Refunds in Payments &amp; Refunds →
                  </button>
                </div>
              )}
              {canVerifyPayments && metrics.pendingTransfers.length > 0 && (
                <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/40 p-3.5 text-xs text-orange-950 dark:text-orange-200">
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
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-950 dark:text-amber-200 space-y-1">
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
                <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3.5 text-xs text-red-900 dark:text-red-200 space-y-1">
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
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3.5 text-xs text-emerald-950 dark:text-emerald-200">
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
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Orders, Approvals &amp; Delivery Gate
              {branchFilter !== 'ALL' ? ` · ${branchFilter}` : ''}
            </h2>
            <select
              value={orderStatusFilter}
              onChange={(e) => setOrderStatusFilter(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs font-semibold"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING_APPROVAL">Pending Management Approval</option>
              <option value="AWAITING_PAYMENT">Awaiting Payment</option>
              <option value="IN_INSTALMENT">Instalment In Progress</option>
              <option value="FULLY_PAID_AWAITING_DELIVERY">Fully Paid – Awaiting Delivery</option>
              <option value="SCHEDULED_FOR_INSTALLATION">Scheduled for Installation</option>
              <option value="COMPLETED">Completed</option>
              <option value="REFUND_REQUESTED">Refund Requested</option>
              <option value="REFUNDED">Refunded</option>
              <option value="REJECTED">Declined / Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="space-y-4">
            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                No matching orders found.
              </div>
            ) : (
              filteredOrders.map((order) => {
                const isLocked = order.outstandingBalanceNgn > 0 && !order.overrideApplied;
                const isRefundLocked =
                  order.orderStatus === 'REFUNDED' || order.orderStatus === 'REFUND_REQUESTED';
                const isConfirmingDelete = confirmDeleteOrderId === order.id;
                return (
                  <div
                    key={order.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-num text-xs font-bold text-slate-900 dark:text-white">
                            {order.orderNumber}
                          </span>
                          {order.deliveryBranch && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold">
                              {order.deliveryBranch}
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                            {order.paymentPlan === 'full'
                              ? 'Full Payment'
                              : `${order.durationMonths}-Month Instalment`}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold">
                            {formatOrderStatusLabel(order.orderStatus)}
                          </span>
                          {order.refundStatus && order.refundStatus !== 'NONE' && (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold">
                              REFUND: {order.refundStatus}
                            </span>
                          )}
                          {order.overrideApplied && (
                            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold">
                              SUPER ADMIN OVERRIDE
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                          {order.packageName ||
                            order.items?.map((i) => `${i.name} ×${i.quantity}`).join(', ')}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Customer: {order.customerName} ({order.customerEmail} ·{' '}
                          {order.customerPhone}) · {order.deliveryAddress}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-right text-xs shrink-0">
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 block">Total</span>
                          <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                            {formatNgn(order.totalAmountNgn)}
                          </span>
                          {(order.instalmentSurchargeNgn || 0) > 0 && (
                            <span className="block text-[10px] text-orange-700 dark:text-orange-400 font-mono-num">
                              (+{formatNgn(order.instalmentSurchargeNgn || 0)} fee)
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 block">Paid</span>
                          <span className="font-mono-num font-bold text-emerald-700 dark:text-emerald-400">
                            {formatNgn(order.amountPaidNgn)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 block">Balance</span>
                          <span className="font-mono-num font-bold text-orange-700 dark:text-orange-400">
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
                            setApprovalError('');
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
                        !isRefundLocked &&
                        canVerifyPayments && (
                          <button
                            type="button"
                            onClick={() => {
                              setManualPayOrder(order);
                              setManualPayAmount(order.outstandingBalanceNgn);
                              setManualPayRef('');
                            }}
                            className="px-3.5 py-2 rounded-lg border border-emerald-700 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300 font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                          >
                            Record Branch / Verified Payment
                          </button>
                        )}

                      {canScheduleDelivery && !isRefundLocked && (
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
                          className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-bold hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
                        >
                          Mark Installation Completed
                        </button>
                      )}

                      {isLocked &&
                        isSuperAdmin &&
                        canOverrideDeliveryLock &&
                        !isRefundLocked &&
                        order.orderStatus !== 'CANCELLED' &&
                        order.orderStatus !== 'REJECTED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setOverrideOrder(order);
                              setOverrideReason('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-950 dark:text-amber-200 font-bold hover:bg-amber-100 cursor-pointer"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Super Admin Override
                          </button>
                        )}

                      {isSuperAdmin && !isConfirmingDelete && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteOrderId(order.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 font-bold hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Order
                        </button>
                      )}

                      {isSuperAdmin && isConfirmingDelete && (
                        <div className="inline-flex items-center gap-2 ml-auto">
                          <button
                            type="button"
                            disabled={deletingOrderId === order.id}
                            onClick={() => void handleDeleteOrder(order)}
                            className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                          >
                            {deletingOrderId === order.id ? 'Deleting...' : 'Confirm Delete Order'}
                          </button>
                          <button
                            type="button"
                            disabled={deletingOrderId === order.id}
                            onClick={() => setConfirmDeleteOrderId(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* C. PAYMENTS, OVERDUE & REFUNDS MANAGEMENT */}
      {tab === 'payments' && (canVerifyPayments || canProcessRefunds || isSuperAdmin) && (
        <div className="space-y-6">
          {/* Refund Requests Section */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Customer Refund Requests ({refundRequests.length})
                </h2>
              </div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {metrics.pendingRefunds.length} pending review
              </span>
            </div>
            {refundRequests.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No customer refund requests submitted yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {refundRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                          {req.orderNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            req.status === 'REFUNDED'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : req.status === 'DECLINED'
                                ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300'
                          }`}
                        >
                          {req.status}
                        </span>
                        <span className="font-mono-num font-extrabold text-emerald-700 dark:text-emerald-400">
                          {formatNgn(req.amountRequestedNgn)}
                        </span>
                      </div>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {req.customerName} ({req.customerEmail} · {req.customerPhone})
                      </p>
                      <p className="text-slate-600 dark:text-slate-300">
                        Bank Payout: <strong>{req.bankName}</strong> ·{' '}
                        <span className="font-mono-num font-bold">{req.accountNumber}</span> ·{' '}
                        {req.accountName}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">Reason: {req.reason}</p>
                      {req.adminNotes && (
                        <p className="text-slate-600 dark:text-slate-300">
                          Staff Note: {req.adminNotes}
                          {req.refundReference ? ` · Ref: ${req.refundReference}` : ''}
                        </p>
                      )}
                    </div>

                    {canProcessRefunds &&
                      (req.status === 'REQUESTED' || req.status === 'APPROVED') && (
                        <button
                          type="button"
                          onClick={() => {
                            setResolvingRefund(req);
                            setRefundDecisionRef('');
                            setRefundDecisionNotes('');
                          }}
                          className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 cursor-pointer shrink-0"
                        >
                          Process Refund
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Payment Transactions &amp; Bank Transfer Verification
              </h2>
            </div>
            {payments.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No payments logged yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-5 py-3">Receipt</th>
                      <th className="px-5 py-3">Order &amp; Customer</th>
                      <th className="px-5 py-3">Method &amp; Ref</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {payments.map((pay) => (
                      <tr key={pay.id}>
                        <td className="px-5 py-3.5 font-mono-num font-bold text-slate-900 dark:text-white">
                          {pay.receiptNumber}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-mono-num font-semibold text-slate-900 dark:text-white">
                            {pay.orderNumber}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">{pay.customerName}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="uppercase font-semibold text-slate-800 dark:text-slate-200">
                            {pay.method.replace('_', ' ')}
                          </div>
                          <div className="font-mono-num text-slate-500 dark:text-slate-400">
                            {pay.reference}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-mono-num font-bold text-emerald-800 dark:text-emerald-400">
                          {formatNgn(pay.amountNgn)}
                        </td>
                        <td className="px-5 py-3.5 font-bold">
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
                            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Solar Packages Catalog</h2>
            {canManagePackages && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={syncingCatalog}
                  onClick={handleSyncOfficialCatalog}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 disabled:opacity-60 cursor-pointer"
                >
                  <Database className="w-4 h-4" />
                  {syncingCatalog ? 'Syncing Packages...' : 'Sync All 29 Packages'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPackageModalError('');
                    setEditingPackage({
                      id: `pkg_${Date.now()}`,
                      name: '',
                      capacityKva: '',
                      inverterCapacity: '',
                      batteryCapacity: '',
                      batteryTechnology: 'Lithium Iron Phosphate (LiFePO4)',
                      panelQuantity: 4,
                      panelWattage: '550W Monocrystalline Solar Panels',
                      accessoriesIncluded:
                        'DC/AC Surge Protection Devices, Breaker Box, DC & AC Solar Cables, Mounting Rails & Connectors',
                      installationDetails:
                        'Professional site assessment, rooftop mounting, inverter/battery commissioning, and load testing after 100% full payment.',
                      warrantyInfo: 'Official OFFNOT ENERGY & Manufacturer Warranty',
                      loadCapacity: '',
                      description: '',
                      priceNgn: 0,
                      instalmentSurchargeNgn: 50000,
                      allowedDurations: [1, 2, 3, 4, 5],
                      initialDepositPercent: storeSettings.defaultInitialDepositPercent ?? 0,
                      adminChargePercent: storeSettings.defaultAdminChargePercent ?? 0,
                      isFeatured: true,
                      isPublished: true,
                    });
                    setNotifyUsersOnPackageSave(false);
                    setShowPackageModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Solar Package
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        {pkg.capacityKva}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          pkg.isPublished
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {pkg.isPublished ? 'Published' : 'Unpublished'}
                      </span>
                      {pkg.isDemo && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                          Demo Template
                        </span>
                      )}
                      {(pkg.instalmentSurchargeNgn || 0) > 0 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-orange-50 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 font-mono-num">
                          Instalment Fee: +{formatNgn(pkg.instalmentSurchargeNgn || 0)}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                      {pkg.name}
                    </h3>
                    <p className="text-lg font-extrabold font-mono-num text-emerald-800 dark:text-emerald-400">
                      {formatNgn(pkg.priceNgn)}
                    </p>
                  </div>

                  {canManagePackages && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPackageModalError('');
                          setEditingPackage({ ...pkg, isDemo: false });
                          setShowPackageModal(true);
                        }}
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        aria-label="Edit Package"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {isSuperAdmin && !pkg.isDemo && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await deleteDoc(doc(db, 'packages', pkg.id));
                              await writeAuditLog({
                                action: 'DELETE_PACKAGE',
                                targetType: 'package',
                                targetId: pkg.id,
                                details: `Deleted solar package ${pkg.name}.`,
                              });
                              showNotice(`Deleted package ${pkg.name}.`);
                            } catch (err) {
                              showError(err instanceof Error ? err.message : 'Unable to delete package.');
                              handleFirestoreError(err, OperationType.DELETE, `packages/${pkg.id}`);
                            }
                          }}
                          className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          aria-label="Delete Package"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Inverter: {pkg.inverterCapacity} · Battery: {pkg.batteryCapacity} (
                  {pkg.batteryTechnology}) · Panels: {pkg.panelQuantity} ({pkg.panelWattage})
                </p>
                {pkg.loadCapacity && (
                  <p className="text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900 rounded-lg px-3 py-2">
                    <strong>What It Can Carry:</strong> {pkg.loadCapacity}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* E. PRODUCT MANAGEMENT */}
      {tab === 'products' && (canManageProducts || isSuperAdmin) && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Individual Solar Products
            </h2>
            {canManageProducts && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={syncingCatalog}
                  onClick={handleSyncOfficialCatalog}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 disabled:opacity-60 cursor-pointer"
                >
                  <Database className="w-4 h-4" />
                  {syncingCatalog ? 'Syncing Catalog...' : 'Sync 66 Products & 29 Packages'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProductModalError('');
                    setEditingProduct({
                      id: `prod_${Date.now()}`,
                      name: '',
                      model: '',
                      category: 'Hybrid Inverters',
                      description: '',
                      specs: '',
                      priceNgn: 0,
                      installerPriceNgn: 0,
                      stock: 10,
                      lowStockThreshold: 3,
                      warranty: '12 Months Manufacturer Warranty',
                      isBestSeller: false,
                      isPublished: true,
                    });
                    setNotifyUsersOnProductSave(false);
                    setShowProductModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Product
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3">Product &amp; Model</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">End-User / Installer Price</th>
                  <th className="px-5 py-3">Stock</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {products.map((prod) => (
                  <tr key={prod.id}>
                    <td className="px-5 py-3">
                      <p className="font-bold text-slate-900 dark:text-white">{prod.name}</p>
                      <p className="text-slate-500 dark:text-slate-400 font-mono-num">{prod.model}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{prod.category}</td>
                    <td className="px-5 py-3 font-mono-num">
                      <div className="font-bold text-emerald-800 dark:text-emerald-400">
                        {prod.priceNgn > 0 ? formatNgn(prod.priceNgn) : 'Configure Price'}
                      </div>
                      {typeof prod.installerPriceNgn === 'number' && prod.installerPriceNgn > 0 && (
                        <div className="text-[11px] text-orange-700 dark:text-orange-400 font-semibold">
                          Installer: {formatNgn(prod.installerPriceNgn)}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono-num">
                      <span
                        className={
                          prod.stock <= (prod.lowStockThreshold ?? 3)
                            ? 'text-red-700 dark:text-red-400 font-bold'
                            : 'text-slate-900 dark:text-slate-100'
                        }
                      >
                        {prod.stock}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`font-bold ${
                          prod.isPublished
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
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
                            setProductModalError('');
                            setEditingProduct({
                              ...prod,
                              installerPriceNgn: prod.installerPriceNgn ?? prod.priceNgn,
                              isDemo: false,
                            });
                            setShowProductModal(true);
                          }}
                          className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
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
                              try {
                                await deleteDoc(doc(db, 'products', prod.id));
                                await writeAuditLog({
                                  action: 'DELETE_PRODUCT',
                                  targetType: 'product',
                                  targetId: prod.id,
                                  details: `Deleted product ${prod.name}.`,
                                });
                                showNotice(`Deleted ${prod.name}.`);
                              } catch (err) {
                                showError(err instanceof Error ? err.message : 'Unable to delete product.');
                                handleFirestoreError(err, OperationType.DELETE, `products/${prod.id}`);
                              }
                            }}
                            className="px-2.5 py-1 rounded border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 font-semibold cursor-pointer"
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
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Registered Customer Accounts
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isSuperAdmin
                    ? 'Super Admin can send password reset emails or delete customer database records.'
                    : 'View registered customer profiles and order history.'}
                </p>
              </div>
              {canSendCampaigns && (
                <button
                  type="button"
                  onClick={() => setTab('campaigns')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Mail All Customers
                </button>
              )}
            </div>
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-5 py-3">Customer &amp; Tier</th>
                  <th className="px-5 py-3">Email &amp; WhatsApp Follow-Up</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Orders</th>
                  <th className="px-5 py-3">Total Spent</th>
                  {isSuperAdmin && <th className="px-5 py-3 text-right">Super Admin Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {usersList.map((u) => {
                  const uOrders = branchScopedOrders.filter((o) => o.userId === u.uid);
                  const spent = uOrders.reduce((s, o) => s + (o.amountPaidNgn || 0), 0);
                  const isSelf = u.uid === user.uid;
                  const isConfirmingDelete = confirmDeleteUserUid === u.uid;
                  const isInstAccount = u.accountType === 'installer';
                  const waLink = formatCustomerWhatsAppLink(
                    u.phone || '',
                    `Hello ${u.displayName || 'Customer'}, this is OFFNOT ENERGY following up regarding your solar account.`
                  );
                  return (
                    <tr key={u.uid}>
                      <td className="px-5 py-3">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {u.displayName}
                          {isSelf && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                              Super Admin
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isInstAccount
                                ? 'bg-orange-50 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isInstAccount ? 'Installer/Dealer' : 'Enduser'}
                          </span>
                          {isInstAccount && u.installerNetworkJoined && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold">
                              Network Joined
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 space-y-1 text-slate-800 dark:text-slate-200">
                        <div>{u.email}</div>
                        <div className="text-slate-600 dark:text-slate-400 font-mono-num">
                          {u.phone || 'No WhatsApp saved'}
                        </div>
                        {waLink && (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                          >
                            <MessageCircle className="w-3 h-3" />
                            Follow up on WhatsApp
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                        {[u.defaultCity, u.defaultState].filter(Boolean).join(', ') || 'Nigeria'}
                      </td>
                      <td className="px-5 py-3 font-mono-num font-bold text-slate-900 dark:text-white">
                        {uOrders.length}
                      </td>
                      <td className="px-5 py-3 font-mono-num font-bold text-emerald-800 dark:text-emerald-400">
                        {formatNgn(spent)}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            {!isSelf && (
                              <button
                                type="button"
                                disabled={togglingTierUid === u.uid}
                                onClick={() => void handleToggleCustomerTier(u)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                                title="Switch between Enduser and Installer/Dealer"
                              >
                                {togglingTierUid === u.uid
                                  ? 'Updating...'
                                  : isInstAccount
                                    ? 'Set Enduser'
                                    : 'Set Installer/Dealer'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!u.email || resettingEmail === u.email}
                              onClick={() =>
                                void handleAdminResetPassword(u.email, u.displayName)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                              title="Send Firebase password reset email"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              {resettingEmail === u.email ? 'Sending...' : 'Reset Password'}
                            </button>

                            {!isSelf && !isConfirmingDelete && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUserUid(u.uid)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            )}

                            {!isSelf && isConfirmingDelete && (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={deletingUserUid === u.uid}
                                  onClick={() => void handleDeleteUser(u)}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
                                >
                                  {deletingUserUid === u.uid ? 'Deleting...' : 'Confirm Delete'}
                                </button>
                                <button
                                  type="button"
                                  disabled={deletingUserUid === u.uid}
                                  onClick={() => setConfirmDeleteUserUid(null)}
                                  className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isSuperAdmin && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deleting a customer removes their profile, saved addresses, and any staff role access
              from the database. To permanently remove their sign-in credentials from Firebase
              Authentication as well, visit{' '}
              <a
                href="https://console.firebase.google.com/project/tactical-iterator-h4cnq/authentication/users"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-emerald-700 dark:text-emerald-400 underline"
              >
                Firebase Console → Authentication → Users
              </a>
              .
            </p>
          )}
        </div>
      )}

      {/* F2. CUSTOMER MAIL & CAMPAIGNS (HAPPY NEW MONTH + NEW PRODUCT BROADCAST) */}
      {tab === 'campaigns' && canSendCampaigns && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Happy New Month Automatic & Manual Greeting */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Happy New Month Customer Greeting
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Automatically emails &amp; notifies all registered users on the 1st of every
                    month, or send manually anytime.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold shrink-0">
                {storeSettings.lastNewMonthSent
                  ? `Last sent: ${storeSettings.lastNewMonthSent}`
                  : 'Not sent yet'}
              </span>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.autoHappyNewMonth !== false}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, autoHappyNewMonth: e.target.checked })
                }
                className="w-4 h-4 accent-emerald-700"
              />
              Auto-send Happy New Month greeting on the 1st of each month
            </label>

            <div className="text-xs space-y-1">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                Monthly Greeting Message
              </label>
              <textarea
                rows={5}
                maxLength={2000}
                value={settingsForm.happyNewMonthMessage || ''}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, happyNewMonthMessage: e.target.value })
                }
                placeholder="Write your Happy New Month message to all OFFNOT ENERGY customers..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={savingSettings}
                onClick={async () => {
                  if (savingSettings) return;
                  setSavingSettings(true);
                  try {
                    await setDoc(
                      doc(db, 'settings', 'storeConfig'),
                      {
                        id: 'storeConfig',
                        allowedDurations: settingsForm.allowedDurations?.length
                          ? settingsForm.allowedDurations
                          : [1, 2, 3, 4, 5],
                        defaultInitialDepositPercent: Math.min(
                          90,
                          Math.max(0, Number(settingsForm.defaultInitialDepositPercent) || 0)
                        ),
                        defaultAdminChargePercent: Math.min(
                          50,
                          Math.max(0, Number(settingsForm.defaultAdminChargePercent) || 0)
                        ),
                        gracePeriodDays: Math.min(
                          30,
                          Math.max(0, Number(settingsForm.gracePeriodDays) || 0)
                        ),
                        bankName: (settingsForm.bankName || '').trim().slice(0, 120),
                        bankAccountName: (settingsForm.bankAccountName || '').trim().slice(0, 160),
                        bankAccountNumber: (settingsForm.bankAccountNumber || '').trim().slice(0, 30),
                        instalmentTerms: (settingsForm.instalmentTerms || '').trim().slice(0, 5000),
                        warrantyPolicy: (settingsForm.warrantyPolicy || '').trim().slice(0, 5000),
                        returnPolicy: (settingsForm.returnPolicy || '').trim().slice(0, 5000),
                        privacyPolicy: (settingsForm.privacyPolicy || '').trim().slice(0, 5000),
                        termsAndConditions: (settingsForm.termsAndConditions || '').trim().slice(0, 5000),
                        autoHappyNewMonth: settingsForm.autoHappyNewMonth !== false,
                        happyNewMonthMessage: (settingsForm.happyNewMonthMessage || '')
                          .trim()
                          .slice(0, 2000),
                        lastNewMonthSent: (settingsForm.lastNewMonthSent || '').trim().slice(0, 20),
                        updatedAt: serverTimestamp(),
                      },
                      { merge: true }
                    );
                    showNotice('Happy New Month template & auto-send setting saved.');
                  } catch (err) {
                    showError(err instanceof Error ? err.message : 'Unable to save template.');
                  } finally {
                    setSavingSettings(false);
                  }
                }}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
              >
                {savingSettings ? 'Saving...' : 'Save Template'}
              </button>

              <button
                type="button"
                disabled={sendingNewMonth || usersList.length === 0}
                onClick={() => void handleSendHappyNewMonth(false)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {sendingNewMonth
                  ? 'Sending Greeting...'
                  : `Send Happy New Month Now (${usersList.length})`}
              </button>
            </div>
          </div>

          {/* New Product & Package Announcement Broadcast */}
          <form
            onSubmit={handleSendBroadcastCampaign}
            className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  New Product &amp; Package Mail Broadcast
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Notify all {usersList.length} registered users by email and in-app alert whenever
                  new solar products or packages arrive.
                </p>
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quick Pre-Fill from Catalog (Optional)
              </label>
              <select
                value={selectedCatalogRef}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedCatalogRef(val);
                  if (!val) return;
                  if (val.startsWith('prod:')) {
                    const p = products.find((item) => item.id === val.slice(5));
                    if (p) {
                      setBroadcastSubject(`New Solar Product Available: ${p.name}`);
                      setBroadcastMessage(
                        `Great news! We just added ${p.name} (${p.model}) under ${p.category} at OFFNOT ENERGY.\n\nPrice: ${
                          p.priceNgn > 0 ? formatNgn(p.priceNgn) : 'Contact Branch for Current Price'
                        }\nKey Specs: ${p.specs}\n\n${p.description}\n\nOrder online anytime or visit our Dugbe & Dalute branches in Ibadan.`
                      );
                    }
                  } else if (val.startsWith('pkg:')) {
                    const pkg = packages.find((item) => item.id === val.slice(4));
                    if (pkg) {
                      setBroadcastSubject(`New Solar Package Launch: ${pkg.name} (${pkg.capacityKva})`);
                      setBroadcastMessage(
                        `Introducing our ${pkg.name} (${pkg.capacityKva}) complete solar energy package at OFFNOT ENERGY!\n\nFull Price: ${formatNgn(
                          pkg.priceNgn
                        )}\nSystem Specs: ${pkg.inverterCapacity} · ${pkg.batteryCapacity} · ${
                          pkg.panelQuantity
                        } Solar Panels (${pkg.panelWattage})\n\nAvailable for outright purchase or flexible 2–5 month instalment plans. Sign in to apply online today!`
                      );
                    }
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
              >
                <option value="">-- Choose a product or solar package to auto-fill --</option>
                <optgroup label="Solar Packages">
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={`pkg:${pkg.id}`}>
                      {pkg.name} ({pkg.capacityKva}) — {formatNgn(pkg.priceNgn)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Individual Products">
                  {products.map((prod) => (
                    <option key={prod.id} value={`prod:${prod.id}`}>
                      {prod.name} ({prod.category})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Email Subject
              </label>
              <input
                required
                maxLength={160}
                value={broadcastSubject}
                onChange={(e) => setBroadcastSubject(e.target.value)}
                placeholder="e.g. New Arrival: 5kVA Lithium Hybrid Inverter Now in Stock!"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div className="text-xs">
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Announcement Message
              </label>
              <textarea
                required
                rows={6}
                maxLength={4000}
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Describe the new solar product, pricing, warranty, and branch availability..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sends email (when Resend email key is configured) and an instant dashboard
                notification to all registered customers.
              </p>
              <button
                type="submit"
                disabled={sendingBroadcast || usersList.length === 0}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                {sendingBroadcast
                  ? 'Sending Broadcast...'
                  : `Send Mail to All Users (${usersList.length})`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* G. INQUIRIES, REVIEWS, AUDIT & NOTIFICATIONS */}
      {tab === 'inquiries' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Service &amp; Contact Inquiries ({branchScopedInquiries.length})
            </h2>
            {branchScopedInquiries.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No inquiries yet.</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {branchScopedInquiries.map((inq) => (
                  <div
                    key={inq.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-2"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">{inq.name}</p>
                        <p className="text-slate-500 dark:text-slate-400">
                          {inq.email} · {inq.phone} · {inq.branch || 'General'}
                        </p>
                      </div>
                      <select
                        value={inq.status}
                        disabled={staffRole === 'accounts_staff'}
                        onChange={async (e) => {
                          const nextStatus = e.target.value;
                          try {
                            await updateDoc(doc(db, 'inquiries', inq.id), {
                              status: nextStatus,
                            });
                            showNotice(`Inquiry from ${inq.name} marked ${nextStatus}.`);
                          } catch (err) {
                            showError(err instanceof Error ? err.message : 'Unable to update inquiry status.');
                            handleFirestoreError(err, OperationType.UPDATE, `inquiries/${inq.id}`);
                          }
                        }}
                        className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-semibold disabled:opacity-50"
                      >
                        <option value="NEW">NEW</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                      </select>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{inq.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Customer Reviews Moderation ({reviews.length})
              </h2>
              {reviews.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No submitted reviews yet.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {reviews.map((rev: Review) => (
                    <div
                      key={rev.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
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
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const nextPub = !rev.isPublished;
                                  await updateDoc(doc(db, 'reviews', rev.id), {
                                    isPublished: nextPub,
                                  });
                                  showNotice(
                                    nextPub
                                      ? `Published review by ${rev.customerName}.`
                                      : `Unpublished review by ${rev.customerName}.`
                                  );
                                } catch (err) {
                                  showError(err instanceof Error ? err.message : 'Unable to update review.');
                                  handleFirestoreError(err, OperationType.UPDATE, `reviews/${rev.id}`);
                                }
                              }}
                              className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                                rev.isPublished
                                  ? 'bg-emerald-700 text-white'
                                  : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {rev.isPublished ? 'Published' : 'Publish'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, 'reviews', rev.id));
                                  showNotice(`Deleted review by ${rev.customerName}.`);
                                } catch (err) {
                                  showError(err instanceof Error ? err.message : 'Unable to delete review.');
                                  handleFirestoreError(err, OperationType.DELETE, `reviews/${rev.id}`);
                                }
                              }}
                              className="p-1.5 rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                              aria-label="Delete Review"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 italic">&ldquo;{rev.quote}&rdquo;</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Recent Audit &amp; Notification Logs ({auditLogs.length})
              </h2>
              <div className="space-y-2 max-h-56 overflow-y-auto text-xs">
                {auditLogs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800 p-2.5"
                  >
                    <p className="font-bold text-slate-900 dark:text-white">
                      {log.action} ·{' '}
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        {log.actorEmail}
                      </span>
                    </p>
                    <p className="text-slate-700 dark:text-slate-300">{log.details}</p>
                    {log.reason && (
                      <p className="text-amber-800 dark:text-amber-300 font-semibold">
                        Reason: {log.reason}
                      </p>
                    )}
                  </div>
                ))}
                {notificationsList.slice(0, 5).map((n) => (
                  <div
                    key={n.id}
                    className="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 p-2.5"
                  >
                    <p className="font-semibold text-emerald-900 dark:text-emerald-300">
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
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                  Super Admin Password Login Setup ({user.email})
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
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
                    className="px-3.5 py-2 pr-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm w-56"
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
            <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Create New Staff Login Account
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Provision logins for CEO, Managing Director, Manager, Dugbe Sales Rep, Dalute
                    Sales Rep, or Accounts Staff without signing out.
                  </p>
                </div>
              </div>

              <form onSubmit={handleCreateStaffLogin} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Full Name
                    </label>
                    <input
                      required
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      placeholder="e.g. Adebayo Tunde"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Phone Number
                    </label>
                    <input
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      placeholder="e.g. 080..."
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Staff Login Email
                  </label>
                  <input
                    required
                    type="email"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    placeholder="staff@offnotenergy.com"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                      className="w-full px-3 py-2.5 pr-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                    >
                      <option value="ceo">CEO (Executive Operations)</option>
                      <option value="managing_director">Managing Director</option>
                      <option value="manager">Manager</option>
                      <option value="sales_rep">Sales Rep (Branch)</option>
                      <option value="accounts_staff">Accounts Staff</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Assigned Branch
                    </label>
                    <select
                      value={newStaffBranch}
                      onChange={(e) => setNewStaffBranch(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
            <div className="lg:col-span-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Assign Role to Existing Registered User
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Only the Super Admin (francisgabriel932@gmail.com) assigns and updates staff roles.
                All staff roles below operate under the Super Admin.
              </p>
              <form onSubmit={handleAssignStaff} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Registered User
                  </label>
                  <select
                    required
                    value={staffUidInput}
                    onChange={(e) => setStaffUidInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="">Select a registered user...</option>
                    {usersList
                      .filter((u) => u.uid !== user.uid)
                      .map((u) => (
                        <option key={u.uid} value={u.uid}>
                          {u.displayName} ({u.email})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Role
                    </label>
                    <select
                      value={staffRoleInput}
                      onChange={(e) => setStaffRoleInput(e.target.value as StaffRole)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                    >
                      <option value="ceo">CEO</option>
                      <option value="managing_director">Managing Director</option>
                      <option value="manager">Manager</option>
                      <option value="sales_rep">Sales Rep</option>
                      <option value="accounts_staff">Accounts Staff</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Branch
                    </label>
                    <select
                      value={staffBranchInput}
                      onChange={(e) => setStaffBranchInput(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                    >
                      <option value="Dugbe Branch">Dugbe Branch</option>
                      <option value="Dalute Branch">Dalute Branch</option>
                      <option value="Head Office">Head Office</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-bold hover:bg-slate-800 dark:hover:bg-slate-600 cursor-pointer"
                >
                  Assign / Update Existing User Role
                </button>
              </form>
            </div>
          </div>

          {/* Active Staff Directory */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Active Staff Directory ({staffList.length})
            </h2>
            {staffList.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No additional staff accounts assigned yet. Use the form above to create logins for
                your CEO, Managing Director, Manager, Dugbe Sales Rep, and Dalute Sales Rep.
              </p>
            ) : (
              <div className="space-y-3">
                {staffList.map((m) => (
                  <div
                    key={m.uid}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs"
                  >
                    <div>
                      <p className="font-bold text-sm text-slate-900 dark:text-white">
                        {m.displayName}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">{m.email}</p>
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
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-semibold"
                      >
                        <option value="ceo">CEO</option>
                        <option value="managing_director">Managing Director</option>
                        <option value="manager">Manager</option>
                        <option value="sales_rep">Sales Rep</option>
                        <option value="accounts_staff">Accounts Staff</option>
                        {m.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                      </select>
                      <select
                        value={m.branch || 'Dugbe Branch'}
                        onChange={(e) =>
                          handleUpdateStaffRoleBranch(m, m.role, e.target.value)
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-semibold"
                      >
                        <option value="Head Office">Head Office</option>
                        <option value="Dugbe Branch">Dugbe Branch</option>
                        <option value="Dalute Branch">Dalute Branch</option>
                      </select>
                      <button
                        type="button"
                        disabled={!m.email || resettingEmail === m.email}
                        onClick={() => void handleAdminResetPassword(m.email, m.displayName)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
                        title="Send password reset email"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        {resettingEmail === m.email ? 'Sending...' : 'Reset Password'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleStaffActive(m)}
                        className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                          m.active
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {m.active ? 'Active' : 'Disabled'}
                      </button>
                      <button
                        type="button"
                        disabled={m.uid === user.uid}
                        onClick={async () => {
                          if (m.uid === user.uid) {
                            showError('You cannot remove your own Super Admin account.');
                            return;
                          }
                          try {
                            await deleteDoc(doc(db, 'staff', m.uid));
                            await writeAuditLog({
                              action: 'REMOVE_STAFF',
                              targetType: 'staff',
                              targetId: m.uid,
                              details: `Removed ${m.email} from staff directory.`,
                            });
                            showNotice(`Removed ${m.displayName} from staff directory.`);
                          } catch (err) {
                            showError(err instanceof Error ? err.message : 'Unable to remove staff member.');
                            handleFirestoreError(err, OperationType.DELETE, `staff/${m.uid}`);
                          }
                        }}
                        className="p-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 cursor-pointer"
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
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 overflow-x-auto">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Role Permissions Matrix
            </h2>
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
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
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
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
                    <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                      {perm.label}
                    </td>
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

      {/* I. SETTINGS, POLICIES & SUPER ADMIN BRANDING / BANNERS */}
      {tab === 'settings' && (canEditSettings || isSuperAdmin) && (
        <div className="space-y-6">
          {isSuperAdmin && (
            <>
              {/* Super-Admin-Only Website Logo & Favicon Manager */}
              <form
                onSubmit={handleSaveBranding}
                className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-6 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                      Website Logo &amp; Favicon (Super Admin Only)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Changes here reflect immediately across the navigation header, footer,
                      receipts, and browser tab icon for every visitor.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                  {/* Website Logo */}
                  <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        Website Brand Logo
                      </span>
                      <button
                        type="button"
                        onClick={() => setBrandingLogoUrl(DEFAULT_LOGO_URL)}
                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Reset Default
                      </button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-1.5 flex items-center justify-center shrink-0">
                        <img
                          src={brandingLogoUrl || DEFAULT_LOGO_URL}
                          alt="Website Logo Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                        <Upload className="w-4 h-4" />
                        Upload Logo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const url = await compressBrandingAsset(file, 600, 600, true);
                              setBrandingLogoUrl(url);
                            } catch (err) {
                              showError(err instanceof Error ? err.message : 'Unable to process logo.');
                            }
                          }}
                        />
                      </label>
                    </div>
                    <input
                      value={brandingLogoUrl}
                      onChange={(e) => setBrandingLogoUrl(e.target.value)}
                      placeholder="Or paste Logo image URL"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    />
                  </div>

                  {/* Website Favicon */}
                  <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        Browser Favicon Icon
                      </span>
                      <button
                        type="button"
                        onClick={() => setBrandingFaviconUrl(DEFAULT_FAVICON_URL)}
                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Reset Default
                      </button>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-lg border border-slate-200 dark:border-slate-700 bg-white p-2 flex items-center justify-center shrink-0">
                        <img
                          src={brandingFaviconUrl || DEFAULT_FAVICON_URL}
                          alt="Favicon Preview"
                          className="w-8 h-8 object-contain"
                        />
                      </div>
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                        <Upload className="w-4 h-4" />
                        Upload Favicon
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const url = await compressBrandingAsset(file, 256, 256, true);
                              setBrandingFaviconUrl(url);
                            } catch (err) {
                              showError(
                                err instanceof Error ? err.message : 'Unable to process favicon.'
                              );
                            }
                          }}
                        />
                      </label>
                    </div>
                    <input
                      value={brandingFaviconUrl}
                      onChange={(e) => setBrandingFaviconUrl(e.target.value)}
                      placeholder="Or paste Favicon URL"
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingBranding}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                >
                  {savingBranding ? 'Updating Branding...' : 'Save Website Logo & Favicon'}
                </button>
              </form>

              {/* Super-Admin-Only 1285 x 63 Header Slideshow Banner Manager */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Header Slideshow Banners (1285 × 63 · Auto-rotates every 3s)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Shown at the top of Home, Shop, Solar Packages, Contact Us, and My Account
                      pages. Recommended banner upload size: 1285 × 63 px.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={seedingBanners}
                      onClick={() => void handleSeedDefaultBanners()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-60 cursor-pointer"
                    >
                      <Database className="w-3.5 h-3.5" />
                      {seedingBanners ? 'Syncing...' : 'Sync Default Slides'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBanner({
                          id: `ban_${Date.now()}`,
                          title: '',
                          subtitle: '',
                          ctaText: 'Explore Offers',
                          ctaRoute: 'packages',
                          imageUrl: '',
                          themeVariant: 'emerald',
                          sortOrder: banners.length + 1,
                          isActive: true,
                        });
                        setShowBannerModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add Banner Slide
                    </button>
                  </div>
                </div>

                {banners.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No slides configured yet. Add a slide or sync default slides.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {banners.map((b) => (
                      <div
                        key={b.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5 text-xs"
                      >
                        <div className="w-full max-w-4xl aspect-[1285/63] min-h-[38px] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-emerald-800 text-white flex items-center justify-between px-4 relative">
                          {b.imageUrl && (
                            <img
                              src={b.imageUrl}
                              alt={b.title}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                          )}
                          <div className="relative z-10 flex items-center gap-2 truncate">
                            <span className="font-bold truncate">{b.title}</span>
                            {b.subtitle && (
                              <span className="hidden sm:inline opacity-85 truncate">
                                — {b.subtitle}
                              </span>
                            )}
                          </div>
                          <span className="relative z-10 px-2 py-0.5 rounded bg-white/95 text-slate-900 font-bold text-[10px] shrink-0">
                            {b.ctaText}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
                            <span className="font-mono-num font-bold text-slate-800 dark:text-slate-200">
                              Order #{b.sortOrder}
                            </span>
                            <span>·</span>
                            <span>Route: /{b.ctaRoute}</span>
                            <span>·</span>
                            <span>Theme: {b.themeVariant || 'emerald'}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleToggleBannerActive(b)}
                              className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                                b.isActive
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {b.isActive ? 'Active' : 'Paused'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBanner({ ...b });
                                setShowBannerModal(true);
                              }}
                              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteBanner(b)}
                              className="p-1.5 rounded border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                              aria-label="Delete Banner"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {canEditSettings && (
            <form
              onSubmit={handleSaveSettings}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6"
            >
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Official Bank Details, Instalment Settings &amp; Store Policies
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Official Bank Name
                  </label>
                  <input
                    value={settingsForm.bankName}
                    onChange={(e) => setSettingsForm({ ...settingsForm, bankName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Name
                  </label>
                  <input
                    value={settingsForm.bankAccountName}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, bankAccountName: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Account Number
                  </label>
                  <input
                    value={settingsForm.bankAccountNumber}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, bankAccountNumber: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <span className="text-slate-700 dark:text-slate-300">
                  Default Allowed Payment Durations (Max 5 Months):
                </span>
                {[1, 2, 3, 4, 5].map((m) => {
                  const currentDurations = settingsForm.allowedDurations?.length
                    ? settingsForm.allowedDurations
                    : [1, 2, 3, 4, 5];
                  const checked = currentDurations.includes(m);
                  return (
                    <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...currentDurations, m].sort((a, b) => a - b)
                            : currentDurations.filter((d) => d !== m);
                          setSettingsForm({
                            ...settingsForm,
                            allowedDurations: next.length > 0 ? next : [1],
                          });
                        }}
                        className="accent-emerald-700"
                      />
                      {m === 1 ? 'Full Pay' : `${m} Months`}
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Instalment Terms
                  </label>
                  <textarea
                    rows={4}
                    value={settingsForm.instalmentTerms}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, instalmentTerms: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Warranty Policy
                  </label>
                  <textarea
                    rows={4}
                    value={settingsForm.warrantyPolicy}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, warrantyPolicy: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Return Policy
                  </label>
                  <textarea
                    rows={3}
                    value={settingsForm.returnPolicy}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, returnPolicy: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Privacy Policy
                  </label>
                  <textarea
                    rows={3}
                    value={settingsForm.privacyPolicy}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, privacyPolicy: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Terms &amp; Conditions
                  </label>
                  <textarea
                    rows={3}
                    value={settingsForm.termsAndConditions}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, termsAndConditions: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-3 rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                {savingSettings ? 'Saving Configuration...' : 'Save Store Configuration'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* MODALS */}
      {/* Product Editor Modal */}
      {showProductModal && editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (savingProduct) return;
              setProductModalError('');
              const safeName = editingProduct.name.trim().slice(0, 160);
              const safeModel = editingProduct.model.trim().slice(0, 100);
              const safeSpecs = editingProduct.specs.trim().slice(0, 2000);
              const safeDesc = editingProduct.description.trim().slice(0, 2000);
              if (!safeName || !safeModel || !safeSpecs || !safeDesc) {
                const msg = 'Product name, model code, specifications, and description are required.';
                setProductModalError(msg);
                showError(msg);
                return;
              }
              setSavingProduct(true);
              try {
                const retailPrice = Math.max(0, Math.round(Number(editingProduct.priceNgn) || 0));
                const instPrice = Math.max(
                  0,
                  Math.round(Number(editingProduct.installerPriceNgn ?? retailPrice) || 0)
                );
                await setDoc(doc(db, 'products', editingProduct.id), {
                  id: editingProduct.id,
                  name: safeName,
                  model: safeModel,
                  category: editingProduct.category,
                  description: safeDesc,
                  specs: safeSpecs,
                  priceNgn: retailPrice,
                  installerPriceNgn: instPrice,
                  stock: Math.max(0, Math.round(Number(editingProduct.stock) || 0)),
                  lowStockThreshold: Math.max(
                    0,
                    Math.round(Number(editingProduct.lowStockThreshold ?? 3) || 0)
                  ),
                  imageUrl: (editingProduct.imageUrl || '').trim().slice(0, 295000),
                  warranty: (editingProduct.warranty || '').trim().slice(0, 200),
                  isBestSeller: Boolean(editingProduct.isBestSeller),
                  isPublished: Boolean(editingProduct.isPublished),
                  isDemo: false,
                  createdAt: editingProduct.createdAt || serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                await writeAuditLog({
                  action: 'SAVE_PRODUCT',
                  targetType: 'product',
                  targetId: editingProduct.id,
                  details: `Saved product ${safeName} (${safeModel}).`,
                });
                if (notifyUsersOnProductSave && editingProduct.isPublished && usersList.length > 0) {
                  await broadcastToAllCustomers({
                    subject: `New Product Alert: ${safeName} at OFFNOT ENERGY`,
                    message: `Good news! ${safeName} (${safeModel}) is now available in our ${editingProduct.category} catalog.\n\nPrice: ${
                      retailPrice > 0 ? formatNgn(retailPrice) : 'Contact Branch for Price'
                    }\nSpecs: ${safeSpecs}\n\n${safeDesc}\n\nShop online or visit our Dugbe Head Office and Dalute Branch in Ibadan.`,
                    campaignType: 'new_product',
                    notifType: 'NEW_PRODUCT_ANNOUNCEMENT',
                  });
                  showNotice(`Saved ${safeName} and emailed/notified all ${usersList.length} customers.`);
                } else {
                  showNotice(`Saved product ${safeName}.`);
                }
                setNotifyUsersOnProductSave(false);
                setShowProductModal(false);
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unable to save product.';
                setProductModalError(msg);
                showError(msg);
                handleFirestoreError(err, OperationType.WRITE, `products/${editingProduct.id}`);
              } finally {
                setSavingProduct(false);
              }
            }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4 text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Product Details</h3>
              <button
                type="button"
                onClick={() => setShowProductModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {productModalError && (
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-800 dark:text-red-200">
                {productModalError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Product Name</label>
                <input
                  required
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Model Code</label>
                <input
                  required
                  value={editingProduct.model}
                  onChange={(e) => setEditingProduct({ ...editingProduct, model: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {PRODUCT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">End-User Retail Price (₦)</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={editingProduct.priceNgn}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, priceNgn: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-orange-800 dark:text-orange-400">
                  Installer Wholesale Price (₦)
                </label>
                <input
                  type="number"
                  min={0}
                  value={editingProduct.installerPriceNgn ?? editingProduct.priceNgn}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      installerPriceNgn: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Warranty</label>
                <input
                  value={editingProduct.warranty || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, warranty: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>
            </div>

            <div className="text-xs space-y-2">
              <label className="block font-semibold">Product Image (Upload or URL)</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-4 h-4" />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const url = await compressImageToDataUrl(file);
                        setEditingProduct({ ...editingProduct, imageUrl: url });
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Unable to process image.';
                        setProductModalError(msg);
                        showError(msg);
                      }
                    }}
                  />
                </label>
                <input
                  value={editingProduct.imageUrl || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, imageUrl: e.target.value })
                  }
                  placeholder="Or paste image URL"
                  className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-semibold mb-1">Key Specifications</label>
              <input
                required
                value={editingProduct.specs}
                onChange={(e) => setEditingProduct({ ...editingProduct, specs: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-6 text-xs font-semibold">
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
              {canSendCampaigns && (
                <label className="flex items-center gap-2 cursor-pointer text-emerald-800 dark:text-emerald-400">
                  <input
                    type="checkbox"
                    checked={notifyUsersOnProductSave}
                    onChange={(e) => setNotifyUsersOnProductSave(e.target.checked)}
                    className="accent-emerald-700"
                  />
                  Email &amp; notify all users about this new product
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={savingProduct}
              className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
            >
              {savingProduct ? 'Saving Product...' : 'Save Product'}
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
              if (savingPackage) return;
              setPackageModalError('');
              const safeName = editingPackage.name.trim().slice(0, 160);
              const safeKva = editingPackage.capacityKva.trim().slice(0, 60);
              const safeInv = editingPackage.inverterCapacity.trim().slice(0, 120);
              const safeBat = editingPackage.batteryCapacity.trim().slice(0, 120);
              const safeTech = editingPackage.batteryTechnology.trim().slice(0, 120);
              const safeWatt = editingPackage.panelWattage.trim().slice(0, 100);
              const safeAcc =
                editingPackage.accessoriesIncluded.trim().slice(0, 1000) ||
                'DC/AC Surge Protection Devices, Breaker Box, DC & AC Solar Cables, Mounting Rails';
              const safeInst =
                editingPackage.installationDetails.trim().slice(0, 1000) ||
                'Professional rooftop mounting, commissioning, and load testing after 100% full payment.';
              const safeWar =
                editingPackage.warrantyInfo.trim().slice(0, 500) ||
                'Official OFFNOT ENERGY & Manufacturer Warranty';
              const safeDesc = editingPackage.description.trim().slice(0, 2500);
              if (!safeName || !safeKva || !safeInv || !safeBat || !safeTech || !safeWatt || !safeDesc) {
                const msg =
                  'Please fill in Package Name, Capacity, Inverter, Battery, Panel Wattage, and Description.';
                setPackageModalError(msg);
                showError(msg);
                return;
              }
              setSavingPackage(true);
              try {
                const cleanAllowedDurations =
                  editingPackage.allowedDurations && editingPackage.allowedDurations.length > 0
                    ? editingPackage.allowedDurations
                    : [1, 2, 3, 4, 5];
                const safePrice = Math.max(0, Math.round(Number(editingPackage.priceNgn) || 0));
                const safeSurcharge = Math.max(
                  0,
                  Math.round(Number(editingPackage.instalmentSurchargeNgn) || 0)
                );
                const safeLoad = (editingPackage.loadCapacity || '').trim().slice(0, 1000);
                await setDoc(doc(db, 'packages', editingPackage.id), {
                  id: editingPackage.id,
                  name: safeName,
                  capacityKva: safeKva,
                  inverterCapacity: safeInv,
                  batteryCapacity: safeBat,
                  batteryTechnology: safeTech,
                  panelQuantity: Math.max(0, Math.round(Number(editingPackage.panelQuantity) || 0)),
                  panelWattage: safeWatt,
                  accessoriesIncluded: safeAcc,
                  installationDetails: safeInst,
                  warrantyInfo: safeWar,
                  loadCapacity: safeLoad,
                  description: safeDesc,
                  priceNgn: safePrice,
                  instalmentSurchargeNgn: safeSurcharge,
                  imageUrl: (editingPackage.imageUrl || '').trim().slice(0, 295000),
                  allowedDurations: cleanAllowedDurations,
                  initialDepositPercent: Math.min(
                    90,
                    Math.max(0, Number(editingPackage.initialDepositPercent) || 0)
                  ),
                  adminChargePercent: Math.min(
                    50,
                    Math.max(0, Number(editingPackage.adminChargePercent) || 0)
                  ),
                  isFeatured: Boolean(editingPackage.isFeatured),
                  isPublished: Boolean(editingPackage.isPublished),
                  isDemo: false,
                  createdAt: editingPackage.createdAt || serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                await writeAuditLog({
                  action: 'SAVE_PACKAGE',
                  targetType: 'package',
                  targetId: editingPackage.id,
                  details: `Saved solar package ${safeName} (${safeKva}).`,
                });
                if (notifyUsersOnPackageSave && editingPackage.isPublished && usersList.length > 0) {
                  await broadcastToAllCustomers({
                    subject: `New Solar Package Launch: ${safeName} (${safeKva})`,
                    message: `Introducing ${safeName} (${safeKva}) at OFFNOT ENERGY!\n\nPrice: ${formatNgn(
                      safePrice
                    )}\nSpecs: ${safeInv} · ${safeBat} · ${
                      Math.max(0, Math.round(Number(editingPackage.panelQuantity) || 0))
                    } Solar Panels (${safeWatt})\n${
                      safeLoad ? `What It Can Carry: ${safeLoad}\n` : ''
                    }\n${safeDesc}\n\nEligible for full payment or up to 5-month flexible instalments.`,
                    campaignType: 'new_product',
                    notifType: 'NEW_PRODUCT_ANNOUNCEMENT',
                  });
                  showNotice(
                    `Saved ${safeName} and emailed/notified all ${usersList.length} customers.`
                  );
                } else {
                  showNotice(`Saved solar package ${safeName}.`);
                }
                setNotifyUsersOnPackageSave(false);
                setShowPackageModal(false);
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unable to save solar package.';
                setPackageModalError(msg);
                showError(msg);
                handleFirestoreError(err, OperationType.WRITE, `packages/${editingPackage.id}`);
              } finally {
                setSavingPackage(false);
              }
            }}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4 text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Solar Package Editor
              </h3>
              <button
                type="button"
                onClick={() => setShowPackageModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {packageModalError && (
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-800 dark:text-red-200">
                {packageModalError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Package Name</label>
                <input
                  required
                  value={editingPackage.name}
                  onChange={(e) => setEditingPackage({ ...editingPackage, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Full Payment Price (₦)</label>
                <input
                  required
                  type="number"
                  min={0}
                  value={editingPackage.priceNgn}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, priceNgn: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-orange-800 dark:text-orange-400">
                  Instalment Plan Fee Added (₦)
                </label>
                <input
                  type="number"
                  min={0}
                  value={editingPackage.instalmentSurchargeNgn ?? 0}
                  onChange={(e) =>
                    setEditingPackage({
                      ...editingPackage,
                      instalmentSurchargeNgn: Number(e.target.value),
                    })
                  }
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2 rounded-lg border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  ₦0 on full payment; added when customer picks 2–5 months instalment.
                </p>
              </div>
              <div>
                <label className="block font-semibold mb-1">Inverter Capacity</label>
                <input
                  required
                  value={editingPackage.inverterCapacity}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, inverterCapacity: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold mb-1">Solar Panel Wattage</label>
                <input
                  required
                  value={editingPackage.panelWattage}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, panelWattage: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>
            </div>

            <div className="text-xs space-y-2">
              <label className="block font-semibold">Package Image</label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-4 h-4" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const url = await compressImageToDataUrl(file);
                        setEditingPackage({ ...editingPackage, imageUrl: url });
                      } catch (err) {
                        showError(err instanceof Error ? err.message : 'Unable to process image.');
                      }
                    }}
                  />
                </label>
                <input
                  value={editingPackage.imageUrl || ''}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, imageUrl: e.target.value })
                  }
                  placeholder="Or paste image URL"
                  className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block font-semibold text-emerald-800 dark:text-emerald-400 mb-1">
                  What This Package Can Carry (Load Capacity)
                </label>
                <textarea
                  rows={2}
                  value={editingPackage.loadCapacity || ''}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, loadCapacity: e.target.value })
                  }
                  placeholder="e.g. 1 Inverter AC (1HP), 1 Fridge/Freezer, 2 TVs, 5 Fans, 15 LED Lights, Laptop & Starlink"
                  className="w-full px-3 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Accessories Included</label>
                <input
                  required
                  value={editingPackage.accessoriesIncluded}
                  onChange={(e) =>
                    setEditingPackage({ ...editingPackage, accessoriesIncluded: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm font-mono-num"
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

            <div className="flex flex-wrap items-center gap-6 text-xs font-semibold">
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
              {canSendCampaigns && (
                <label className="flex items-center gap-2 cursor-pointer text-emerald-800 dark:text-emerald-400">
                  <input
                    type="checkbox"
                    checked={notifyUsersOnPackageSave}
                    onChange={(e) => setNotifyUsersOnPackageSave(e.target.checked)}
                    className="accent-emerald-700"
                  />
                  Email &amp; notify all users about this new package
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={savingPackage}
              className="w-full py-3 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
            >
              {savingPackage ? 'Saving Solar Package...' : 'Save Solar Package'}
            </button>
          </form>
        </div>
      )}

      {/* Instalment Approval Modal */}
      {approvalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Review Instalment Application · {approvalOrder.orderNumber}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
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
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
            />
            {approvalError && (
              <div className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 p-2.5 text-xs text-red-700 dark:text-red-300">
                {approvalError}
              </div>
            )}
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={decidingApproval}
                onClick={() => handleDecisionApproval('APPROVED')}
                className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                {decidingApproval ? 'Saving...' : 'Approve Application'}
              </button>
              <button
                type="button"
                disabled={decidingApproval}
                onClick={() => handleDecisionApproval('REJECTED')}
                className="flex-1 py-2.5 px-3 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 cursor-pointer"
              >
                {decidingApproval ? 'Saving...' : 'Decline'}
              </button>
              <button
                type="button"
                disabled={decidingApproval}
                onClick={() => setApprovalOrder(null)}
                className="px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Payment Entry Modal */}
      {manualPayOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRecordManualPayment}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Record Verified Payment · {manualPayOrder.orderNumber}
            </h3>
            <div className="text-xs space-y-3 text-slate-700 dark:text-slate-300">
              <div>
                <label className="block font-semibold mb-1">Amount (₦)</label>
                <input
                  required
                  type="number"
                  min={1}
                  max={manualPayOrder.outstandingBalanceNgn}
                  value={manualPayAmount}
                  onChange={(e) => setManualPayAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm font-mono-num"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Channel</label>
                <select
                  value={manualPayMethod}
                  onChange={(e) =>
                    setManualPayMethod(e.target.value as 'bank_transfer' | 'branch_cash')
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
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
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingManualPay}
                className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                {savingManualPay ? 'Saving...' : 'Save Verified Payment'}
              </button>
              <button
                type="button"
                disabled={savingManualPay}
                onClick={() => setManualPayOrder(null)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delivery & Installation Schedule Modal */}
      {scheduleOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleScheduleDelivery}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Schedule Delivery &amp; Installation · {scheduleOrder.orderNumber}
            </h3>
            <div className="text-xs space-y-3 text-slate-700 dark:text-slate-300">
              <div>
                <label className="block font-semibold mb-1">Delivery Date</label>
                <input
                  required
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Installation Date</label>
                <input
                  required
                  type="date"
                  value={installationDate}
                  onChange={(e) => setInstallationDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingSchedule}
                className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                {savingSchedule ? 'Saving...' : 'Confirm Schedule'}
              </button>
              <button
                type="button"
                disabled={savingSchedule}
                onClick={() => setScheduleOrder(null)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Super Admin Override Modal */}
      {overrideOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSuperAdminOverride}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-300 dark:border-amber-700 max-w-md w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              Super Admin Authorised Delivery Override
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
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
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingOverride}
                className="flex-1 py-2.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-60 cursor-pointer"
              >
                {savingOverride ? 'Authorizing...' : 'Authorize Override'}
              </button>
              <button
                type="button"
                disabled={savingOverride}
                onClick={() => setOverrideOrder(null)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Refund Resolution Modal (Accounts & Super Admin) */}
      {resolvingRefund && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-sm">
                <RotateCcw className="w-5 h-5 shrink-0" />
                Process Customer Refund · {resolvingRefund.orderNumber}
              </div>
              <button
                type="button"
                disabled={savingRefundDecision}
                onClick={() => setResolvingRefund(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close refund modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-3.5 text-xs space-y-1.5 text-slate-700 dark:text-slate-300">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Customer: <strong className="text-slate-900 dark:text-slate-100">{resolvingRefund.customerName}</strong> ({resolvingRefund.customerPhone})
                </span>
                <span className="font-mono-num font-bold text-rose-700 dark:text-rose-400">
                  {formatNgn(resolvingRefund.amountRequestedNgn)}
                </span>
              </div>
              <div>
                Bank Payout: <strong className="text-slate-900 dark:text-slate-100">{resolvingRefund.bankName}</strong> ·{' '}
                <span className="font-mono-num">{resolvingRefund.accountNumber}</span> ({resolvingRefund.accountName})
              </div>
              <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="font-semibold text-slate-900 dark:text-slate-100">Customer Reason:</span>{' '}
                {resolvingRefund.reason}
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Refund Transfer Reference (when approving payout)
                </label>
                <input
                  value={refundDecisionRef}
                  onChange={(e) => setRefundDecisionRef(e.target.value)}
                  placeholder="e.g., NIP-REF-20261201-8842"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Accounts / Management Notes
                </label>
                <textarea
                  rows={3}
                  value={refundDecisionNotes}
                  onChange={(e) => setRefundDecisionNotes(e.target.value)}
                  placeholder="Enter payout confirmation note or reason for declining..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                disabled={savingRefundDecision}
                onClick={() => handleResolveRefund('REFUNDED')}
                className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                {savingRefundDecision ? 'Processing...' : 'Approve & Mark Refunded'}
              </button>
              <button
                type="button"
                disabled={savingRefundDecision}
                onClick={() => handleResolveRefund('DECLINED')}
                className="flex-1 py-2.5 px-3 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 cursor-pointer"
              >
                {savingRefundDecision ? 'Processing...' : 'Decline Refund'}
              </button>
              <button
                type="button"
                disabled={savingRefundDecision}
                onClick={() => setResolvingRefund(null)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Super-Admin-Only 1285x63 Header Slideshow Banner Modal */}
      {showBannerModal && editingBanner && isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveBanner}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90dvh] overflow-y-auto p-6 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Edit 1285 × 63 Header Slideshow Banner
              </h3>
              <button
                type="button"
                disabled={savingBanner}
                onClick={() => setShowBannerModal(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close banner modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Live Slim 1285x63 Preview */}
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Live Header Strip Preview (1285 × 63 aspect)
              </div>
              <div
                className={`relative w-full min-h-[44px] sm:aspect-[1285/63] rounded-xl overflow-hidden flex items-center justify-between gap-3 px-4 py-2 text-white ${
                  editingBanner.themeVariant === 'orange'
                    ? 'bg-gradient-to-r from-amber-700 via-orange-600 to-amber-700'
                    : editingBanner.themeVariant === 'slate'
                      ? 'bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950'
                      : editingBanner.themeVariant === 'teal'
                        ? 'bg-gradient-to-r from-teal-900 via-emerald-800 to-slate-900'
                        : 'bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900'
                }`}
              >
                {editingBanner.imageUrl && (
                  <img
                    src={editingBanner.imageUrl}
                    alt={editingBanner.title || 'Banner preview'}
                    className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
                  />
                )}
                <div className="relative z-10 min-w-0 flex items-center gap-2 truncate">
                  <span className="font-bold text-xs sm:text-sm truncate">
                    {editingBanner.title || 'Your Banner Headline'}
                  </span>
                  {editingBanner.subtitle && (
                    <span className="hidden sm:inline text-xs text-white/85 truncate">
                      — {editingBanner.subtitle}
                    </span>
                  )}
                </div>
                <span className="relative z-10 shrink-0 px-2.5 py-1 rounded-full bg-white text-slate-900 text-[11px] font-bold">
                  {editingBanner.ctaText || 'Explore'}
                </span>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Banner Headline *
                </label>
                <input
                  required
                  maxLength={160}
                  value={editingBanner.title}
                  onChange={(e) => setEditingBanner({ ...editingBanner, title: e.target.value })}
                  placeholder="e.g., December Solar Promo: Flexible 5-Month Instalments!"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Subtitle / Supporting Detail
                </label>
                <input
                  maxLength={200}
                  value={editingBanner.subtitle}
                  onChange={(e) => setEditingBanner({ ...editingBanner, subtitle: e.target.value })}
                  placeholder="e.g., Visit Dugbe or Dalute Ibadan for genuine Itel, Felicity & Jinko gear."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  CTA Button Text
                </label>
                <input
                  required
                  maxLength={60}
                  value={editingBanner.ctaText}
                  onChange={(e) => setEditingBanner({ ...editingBanner, ctaText: e.target.value })}
                  placeholder="e.g., View Packages"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  CTA Destination Page
                </label>
                <select
                  value={editingBanner.ctaRoute}
                  onChange={(e) =>
                    setEditingBanner({ ...editingBanner, ctaRoute: e.target.value as PageRoute })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                >
                  <option value="packages">Solar Packages</option>
                  <option value="shop">Shop Storefront</option>
                  <option value="home">Home</option>
                  <option value="how-it-works">How Instalment Works</option>
                  <option value="services">Services &amp; Engineering</option>
                  <option value="about">About Us</option>
                  <option value="contact">Contact Us</option>
                  <option value="policies">Policies</option>
                  <option value="account">My Account</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Theme Gradient Variant
                </label>
                <select
                  value={editingBanner.themeVariant || 'emerald'}
                  onChange={(e) =>
                    setEditingBanner({
                      ...editingBanner,
                      themeVariant: e.target.value as BannerSlide['themeVariant'],
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                >
                  <option value="emerald">Emerald Solar Green</option>
                  <option value="slate">Executive Dark Slate</option>
                  <option value="orange">Warm Promo Orange</option>
                  <option value="teal">Deep Energy Teal</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Slide Sort Order
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  value={editingBanner.sortOrder}
                  onChange={(e) =>
                    setEditingBanner({ ...editingBanner, sortOrder: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm font-mono-num"
                />
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Optional Banner Background Image (1285 × 63 px recommended)
                  </label>
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const compressed = await compressBrandingAsset(file, 1285, 63, false);
                          setEditingBanner((prev) =>
                            prev ? { ...prev, imageUrl: compressed } : prev
                          );
                        } catch (err) {
                          showError(
                            err instanceof Error ? err.message : 'Unable to process banner image.'
                          );
                        }
                      }}
                    />
                  </label>
                </div>
                <input
                  value={editingBanner.imageUrl || ''}
                  onChange={(e) => setEditingBanner({ ...editingBanner, imageUrl: e.target.value })}
                  placeholder="Optional image URL or upload a 1285×63 banner graphic"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-base sm:text-sm"
                />
              </div>

              <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(editingBanner.isActive)}
                    onChange={(e) =>
                      setEditingBanner({ ...editingBanner, isActive: e.target.checked })
                    }
                    className="accent-emerald-700"
                  />
                  Show this banner slide in the 3-second storefront rotation
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={savingBanner}
                className="flex-1 py-2.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
              >
                {savingBanner ? 'Saving Banner...' : 'Save Banner Slide'}
              </button>
              <button
                type="button"
                disabled={savingBanner}
                onClick={() => setShowBannerModal(false)}
                className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
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
