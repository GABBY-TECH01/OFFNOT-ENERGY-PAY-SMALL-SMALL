import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  BannerSlide,
  GatewayConfig,
  NotificationLog,
  Order,
  PaymentRecord,
  Product,
  RefundRequest,
  Review,
  SolarPackage,
  StoreSetting,
} from '../types';
import {
  DEFAULT_BANNER_SLIDES,
  DEFAULT_FAVICON_URL,
  DEFAULT_LOGO_URL,
  DEFAULT_STORE_SETTINGS,
  OFFNOT_PACKAGES,
  OFFNOT_PRODUCTS,
  seedInitialCatalogIfAdmin,
} from '../utils/seedData';
import { useAuth } from './AuthContext';

interface StoreContextValue {
  products: Product[];
  packages: SolarPackage[];
  storeSettings: StoreSetting;
  logoUrl: string;
  faviconUrl: string;
  banners: BannerSlide[];
  activeBanners: BannerSlide[];
  reviews: Review[];
  customerOrders: Order[];
  customerPayments: PaymentRecord[];
  customerRefunds: RefundRequest[];
  customerNotifications: NotificationLog[];
  gatewayConfig: GatewayConfig;
  loadingCatalog: boolean;
  usingDemoCatalog: boolean;
  submitInquiry: (data: {
    name: string;
    email: string;
    phone: string;
    branch: string;
    serviceType: string;
    message: string;
  }) => Promise<void>;
  logAndSendNotification: (params: {
    userId: string;
    recipientEmail: string;
    recipientPhone?: string;
    type: string;
    title: string;
    message: string;
    orderId?: string;
  }) => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { user, isStaff, isSuperAdmin, authReady } = useAuth();
  const [firestoreProducts, setFirestoreProducts] = useState<Product[]>([]);
  const [firestorePackages, setFirestorePackages] = useState<SolarPackage[]>([]);
  const [hasLoadedProducts, setHasLoadedProducts] = useState(false);
  const [hasLoadedPackages, setHasLoadedPackages] = useState(false);
  const autoSyncedRef = useRef(false);
  const [storeSettings, setStoreSettings] = useState<StoreSetting>(DEFAULT_STORE_SETTINGS);
  const [firestoreBanners, setFirestoreBanners] = useState<BannerSlide[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [customerPayments, setCustomerPayments] = useState<PaymentRecord[]>([]);
  const [customerRefunds, setCustomerRefunds] = useState<RefundRequest[]>([]);
  const [customerNotifications, setCustomerNotifications] = useState<NotificationLog[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig>({
    paystackConfigured: false,
    paystackSecretPresent: false,
    paystackPublicKey: '',
    flutterwaveConfigured: false,
    flutterwaveSecretPresent: false,
    flutterwavePublicKey: '',
    emailConfigured: false,
    mapsConfigured: Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY),
    mode: 'sandbox',
  });

  // Load safe payment & gateway config from backend
  useEffect(() => {
    fetch('/api/payments/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setGatewayConfig(data);
      })
      .catch(() => {
        // fallback defaults
      });
  }, []);

  // Subscribe to public catalog (or full catalog for staff)
  useEffect(() => {
    if (!authReady) return;

    const productsQuery = isStaff
      ? query(collection(db, 'products'))
      : query(collection(db, 'products'), where('isPublished', '==', true));

    const unsubProducts = onSnapshot(
      productsQuery,
      (snap) => {
        setFirestoreProducts(snap.docs.map((d) => d.data() as Product));
        setHasLoadedProducts(true);
        setLoadingCatalog(false);
      },
      (err) => {
        setHasLoadedProducts(true);
        setLoadingCatalog(false);
        handleFirestoreError(err, OperationType.LIST, 'products');
      }
    );

    const packagesQuery = isStaff
      ? query(collection(db, 'packages'))
      : query(collection(db, 'packages'), where('isPublished', '==', true));

    const unsubPackages = onSnapshot(
      packagesQuery,
      (snap) => {
        setFirestorePackages(snap.docs.map((d) => d.data() as SolarPackage));
        setHasLoadedPackages(true);
      },
      (err) => {
        setHasLoadedPackages(true);
        handleFirestoreError(err, OperationType.LIST, 'packages');
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'storeConfig'),
      (snap) => {
        if (snap.exists()) {
          setStoreSettings({ ...DEFAULT_STORE_SETTINGS, ...(snap.data() as StoreSetting) });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/storeConfig')
    );

    const reviewsQuery = isStaff
      ? query(collection(db, 'reviews'))
      : query(collection(db, 'reviews'), where('isPublished', '==', true));

    const unsubReviews = onSnapshot(
      reviewsQuery,
      (snap) => {
        setReviews(snap.docs.map((d) => d.data() as Review));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    const bannersQuery = isSuperAdmin
      ? query(collection(db, 'banners'))
      : query(collection(db, 'banners'), where('isActive', '==', true));

    const unsubBanners = onSnapshot(
      bannersQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as BannerSlide)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        setFirestoreBanners(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'banners')
    );

    return () => {
      unsubProducts();
      unsubPackages();
      unsubSettings();
      unsubReviews();
      unsubBanners();
    };
  }, [authReady, isStaff, isSuperAdmin]);

  // Subscribe to signed-in customer's orders, payments, refunds, and notifications
  useEffect(() => {
    if (!authReady || !user) {
      setCustomerOrders([]);
      setCustomerPayments([]);
      setCustomerRefunds([]);
      setCustomerNotifications([]);
      return;
    }

    const toMs = (ts: unknown): number => {
      if (!ts) return 0;
      if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
        return (ts as { toMillis: () => number }).toMillis();
      }
      if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
        return Number((ts as { seconds: number }).seconds) * 1000;
      }
      return 0;
    };

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setCustomerOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PaymentRecord);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setCustomerPayments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as NotificationLog);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setCustomerNotifications(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const unsubRefunds = onSnapshot(
      query(collection(db, 'refunds'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as RefundRequest);
        list.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        setCustomerRefunds(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'refunds')
    );

    return () => {
      unsubOrders();
      unsubPayments();
      unsubNotifs();
      unsubRefunds();
    };
  }, [authReady, user]);

  const hasOldDemoProduct = firestoreProducts.some((p) => p.isDemo);
  const hasOldDemoPkg = firestorePackages.some(
    (p) => p.isDemo || p.id === 'demo-offnot-4kva-package'
  );
  const hasOldWikiImage = firestoreProducts.some(
    (p) => typeof p.imageUrl === 'string' && p.imageUrl.includes('wikimedia.org')
  );
  const missingCatalogItems =
    firestoreProducts.length < OFFNOT_PRODUCTS.length ||
    firestorePackages.length < OFFNOT_PACKAGES.length;

  const usingDemoCatalog =
    hasLoadedProducts &&
    hasLoadedPackages &&
    (firestorePackages.length === 0 ||
      firestoreProducts.length === 0 ||
      hasOldDemoProduct ||
      hasOldDemoPkg ||
      hasOldWikiImage ||
      missingCatalogItems);

  useEffect(() => {
    if (
      !authReady ||
      !isSuperAdmin ||
      !hasLoadedProducts ||
      !hasLoadedPackages ||
      autoSyncedRef.current
    ) {
      return;
    }
    if (usingDemoCatalog) {
      autoSyncedRef.current = true;
      seedInitialCatalogIfAdmin().catch((err) => {
        console.warn('Auto catalog sync notice:', err);
        autoSyncedRef.current = false;
      });
    }
  }, [authReady, isSuperAdmin, hasLoadedProducts, hasLoadedPackages, usingDemoCatalog]);

  const realFirestoreProducts = firestoreProducts.filter(
    (p) => !p.isDemo && !(typeof p.imageUrl === 'string' && p.imageUrl.includes('wikimedia.org'))
  );
  const realFirestorePackages = firestorePackages.filter(
    (p) => !p.isDemo && p.id !== 'demo-offnot-4kva-package'
  );

  const products =
    realFirestoreProducts.length > 0 ? realFirestoreProducts : OFFNOT_PRODUCTS;
  const packages = [
    ...(realFirestorePackages.length > 0 ? realFirestorePackages : OFFNOT_PACKAGES),
  ].sort((a, b) => a.priceNgn - b.priceNgn);

  async function submitInquiry(data: {
    name: string;
    email: string;
    phone: string;
    branch: string;
    serviceType: string;
    message: string;
  }) {
    const id = `inq_${Date.now()}`;
    try {
      await setDoc(doc(db, 'inquiries', id), {
        id,
        name: data.name.trim().slice(0, 120),
        email: data.email.trim().slice(0, 160),
        phone: data.phone.trim().slice(0, 32),
        branch: data.branch.trim().slice(0, 80),
        serviceType: data.serviceType.trim().slice(0, 100),
        message: data.message.trim().slice(0, 2000),
        status: 'NEW',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `inquiries/${id}`);
    }
  }

  async function logAndSendNotification(params: {
    userId: string;
    recipientEmail: string;
    recipientPhone?: string;
    type: string;
    title: string;
    message: string;
    orderId?: string;
  }) {
    let status: 'SENT' | 'LOGGED' = 'LOGGED';
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail: params.recipientEmail,
          recipientPhone: params.recipientPhone || '',
          subject: `[OFFNOT ENERGY] ${params.title}`,
          message: params.message,
          type: params.type,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { status?: string };
        if (json.status === 'SENT') status = 'SENT';
      }
    } catch {
      // continue to log in Firestore
    }

    const id = `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    try {
      await setDoc(doc(db, 'notifications', id), {
        id,
        userId: params.userId,
        recipientEmail: params.recipientEmail.slice(0, 160),
        recipientPhone: (params.recipientPhone || '').slice(0, 32),
        type: params.type.slice(0, 80),
        title: params.title.slice(0, 160),
        message: params.message.slice(0, 1500),
        channel: status === 'SENT' ? 'email' : 'in_app',
        status,
        orderId: (params.orderId || '').slice(0, 128),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Notification log write skipped:', err);
    }
  }

  const activeFromFirestore = firestoreBanners.filter((b) => b.isActive);
  const activeBanners =
    activeFromFirestore.length > 0 ? activeFromFirestore : DEFAULT_BANNER_SLIDES;
  const logoUrl = storeSettings.logoUrl?.trim() || DEFAULT_LOGO_URL;
  const faviconUrl = storeSettings.faviconUrl?.trim() || DEFAULT_FAVICON_URL;

  return (
    <StoreContext.Provider
      value={{
        products,
        packages,
        storeSettings,
        logoUrl,
        faviconUrl,
        banners: firestoreBanners,
        activeBanners,
        reviews,
        customerOrders,
        customerPayments,
        customerRefunds,
        customerNotifications,
        gatewayConfig,
        loadingCatalog,
        usingDemoCatalog,
        submitInquiry,
        logAndSendNotification,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
