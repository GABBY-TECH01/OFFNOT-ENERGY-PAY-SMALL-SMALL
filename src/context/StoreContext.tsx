import React, { createContext, useContext, useEffect, useState } from 'react';
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
  GatewayConfig,
  NotificationLog,
  Order,
  PaymentRecord,
  Product,
  Review,
  SolarPackage,
  StoreSetting,
} from '../types';
import { DEFAULT_STORE_SETTINGS, DEMO_PACKAGES, OFFNOT_PRODUCTS } from '../utils/seedData';
import { useAuth } from './AuthContext';

interface StoreContextValue {
  products: Product[];
  packages: SolarPackage[];
  storeSettings: StoreSetting;
  reviews: Review[];
  customerOrders: Order[];
  customerPayments: PaymentRecord[];
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
  const { user, isStaff, authReady } = useAuth();
  const [firestoreProducts, setFirestoreProducts] = useState<Product[]>([]);
  const [firestorePackages, setFirestorePackages] = useState<SolarPackage[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSetting>(DEFAULT_STORE_SETTINGS);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [customerPayments, setCustomerPayments] = useState<PaymentRecord[]>([]);
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
        setLoadingCatalog(false);
      },
      (err) => {
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
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'packages')
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

    return () => {
      unsubProducts();
      unsubPackages();
      unsubSettings();
      unsubReviews();
    };
  }, [authReady, isStaff]);

  // Subscribe to signed-in customer's orders, payments, and notifications
  useEffect(() => {
    if (!authReady || !user) {
      setCustomerOrders([]);
      setCustomerPayments([]);
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

    return () => {
      unsubOrders();
      unsubPayments();
      unsubNotifs();
    };
  }, [authReady, user]);

  const hasRealProducts = firestoreProducts.some((p) => !p.isDemo);
  const usingDemoCatalog = firestorePackages.length === 0 || (!hasRealProducts && firestoreProducts.length > 0);
  const products = hasRealProducts
    ? firestoreProducts
    : firestoreProducts.length > 0
      ? [...OFFNOT_PRODUCTS, ...firestoreProducts.filter((fp) => !OFFNOT_PRODUCTS.some((op) => op.id === fp.id))]
      : OFFNOT_PRODUCTS;
  const packages = firestorePackages.length > 0 ? firestorePackages : DEMO_PACKAGES;

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

  return (
    <StoreContext.Provider
      value={{
        products,
        packages,
        storeSettings,
        reviews,
        customerOrders,
        customerPayments,
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
