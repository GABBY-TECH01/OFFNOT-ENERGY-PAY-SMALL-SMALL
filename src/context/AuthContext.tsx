import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  EmailAuthProvider,
  googleProvider,
  handleFirestoreError,
  linkWithCredential,
  OperationType,
  provisionStaffAuthAccount,
  sendEmailVerification,
  updatePassword,
} from '../firebase';
import type { RolePermission, SavedAddress, StaffMember, StaffRole, UserProfile } from '../types';
import { DEFAULT_ROLE_PERMISSIONS } from '../utils/seedData';

const BOOTSTRAP_ADMIN_EMAILS = ['francisgabriel932@gmail.com', 'offnotenergy@gmail.com'];

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  staffRecord: StaffMember | null;
  staffRole: StaffRole | null;
  permissions: RolePermission | null;
  isStaff: boolean;
  isSuperAdmin: boolean;
  isBootstrapEmailUnverified: boolean;
  authReady: boolean;
  staffLoading: boolean;
  savedAddresses: SavedAddress[];
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string, phone: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  linkOrUpdatePassword: (newPassword: string) => Promise<void>;
  createStaffAccount: (params: {
    displayName: string;
    email: string;
    password: string;
    role: StaffRole;
    branch: string;
    phone?: string;
  }) => Promise<{ uid: string }>;
  logout: () => Promise<void>;
  updateUserProfile: (updates: {
    displayName: string;
    phone: string;
    defaultAddress: string;
    defaultCity: string;
    defaultState: string;
  }) => Promise<void>;
  addSavedAddress: (addr: Omit<SavedAddress, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  deleteSavedAddress: (addressId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [staffRecord, setStaffRecord] = useState<StaffMember | null>(null);
  const [permissions, setPermissions] = useState<RolePermission | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [staffLoading, setStaffLoading] = useState(true);

  const isBootstrapEmailMatch = Boolean(
    user?.email && BOOTSTRAP_ADMIN_EMAILS.includes(user.email.toLowerCase())
  );

  const isBootstrappedSuperAdmin = Boolean(isBootstrapEmailMatch && user?.emailVerified);
  const isBootstrapEmailUnverified = Boolean(isBootstrapEmailMatch && !user?.emailVerified && !staffRecord?.active);

  const staffRole: StaffRole | null = isBootstrappedSuperAdmin
    ? 'super_admin'
    : staffRecord?.active
      ? staffRecord.role
      : null;

  const isStaff = Boolean(staffRole);
  const isSuperAdmin = staffRole === 'super_admin' || staffRole === 'ceo';

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setStaffRecord(null);
        setPermissions(null);
        setSavedAddresses([]);
        setStaffLoading(false);
        setAuthReady(true);
        return;
      }

      setStaffLoading(true);
      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            displayName:
              firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'OFFNOT User',
            email: firebaseUser.email || '',
            phone: '',
            defaultAddress: '',
            defaultCity: 'Ibadan',
            defaultState: 'Oyo State',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('Profile bootstrap warning:', err);
      }
      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  // Subscribe to user profile, saved addresses, and staff record
  useEffect(() => {
    if (!user) return;

    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}`)
    );

    const unsubAddresses = onSnapshot(
      collection(db, 'users', user.uid, 'addresses'),
      (snap) => {
        setSavedAddresses(snap.docs.map((d) => d.data() as SavedAddress));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/addresses`)
    );

    const unsubStaff = onSnapshot(
      doc(db, 'staff', user.uid),
      (snap) => {
        if (snap.exists()) {
          setStaffRecord(snap.data() as StaffMember);
        } else {
          setStaffRecord(null);
        }
        setStaffLoading(false);
      },
      (error) => {
        console.warn('Staff lookup notice:', error);
        setStaffLoading(false);
      }
    );

    return () => {
      unsubProfile();
      unsubAddresses();
      unsubStaff();
    };
  }, [user]);

  // Load role permissions for active staff
  useEffect(() => {
    if (!staffRole) {
      setPermissions(null);
      return;
    }

    const unsubPerm = onSnapshot(
      doc(db, 'rolePermissions', staffRole),
      (snap) => {
        if (snap.exists()) {
          setPermissions(snap.data() as RolePermission);
        } else {
          setPermissions(DEFAULT_ROLE_PERMISSIONS[staffRole] || DEFAULT_ROLE_PERMISSIONS.sales_rep);
        }
      },
      () => {
        setPermissions(DEFAULT_ROLE_PERMISSIONS[staffRole] || DEFAULT_ROLE_PERMISSIONS.sales_rep);
      }
    );

    return () => unsubPerm();
  }, [staffRole]);

  async function signInWithGoogle() {
    setStaffLoading(true);
    await signInWithPopup(auth, googleProvider);
  }

  async function signInWithEmail(email: string, password: string) {
    setStaffLoading(true);
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }

  async function registerWithEmail(name: string, email: string, password: string, phone: string) {
    setStaffLoading(true);
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }
    if (BOOTSTRAP_ADMIN_EMAILS.includes(email.trim().toLowerCase()) && !cred.user.emailVerified) {
      try {
        await sendEmailVerification(cred.user);
      } catch {
        // non-fatal
      }
    }
    try {
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        displayName: name.trim() || email.trim().split('@')[0],
        email: email.trim(),
        phone: phone.trim(),
        defaultAddress: '',
        defaultCity: 'Ibadan',
        defaultState: 'Oyo State',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${cred.user.uid}`);
    }
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email.trim());
  }

  async function resendVerificationEmail() {
    if (!auth.currentUser) throw new Error('You must be signed in.');
    await sendEmailVerification(auth.currentUser);
  }

  async function linkOrUpdatePassword(newPassword: string) {
    if (!auth.currentUser || !auth.currentUser.email) {
      throw new Error('No signed-in account with an email address.');
    }
    const hasPasswordProvider = auth.currentUser.providerData.some(
      (p) => p.providerId === 'password'
    );
    if (hasPasswordProvider) {
      await updatePassword(auth.currentUser, newPassword);
    } else {
      const cred = EmailAuthProvider.credential(auth.currentUser.email, newPassword);
      await linkWithCredential(auth.currentUser, cred);
    }
  }

  async function createStaffAccount(params: {
    displayName: string;
    email: string;
    password: string;
    role: StaffRole;
    branch: string;
    phone?: string;
  }): Promise<{ uid: string }> {
    if (!user || !isSuperAdmin) {
      throw new Error('Only Super Admin or CEO can create staff accounts.');
    }
    const { uid } = await provisionStaffAuthAccount(
      params.email,
      params.password,
      params.displayName
    );

    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        displayName: params.displayName.trim().slice(0, 120),
        email: params.email.trim().slice(0, 160),
        phone: (params.phone || '').trim().slice(0, 32),
        defaultAddress: params.branch,
        defaultCity: 'Ibadan',
        defaultState: 'Oyo State',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'staff', uid), {
        uid,
        email: params.email.trim().slice(0, 160),
        displayName: params.displayName.trim().slice(0, 120),
        role: params.role,
        branch: params.branch.slice(0, 60),
        active: true,
        addedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `staff/${uid}`);
    }

    return { uid };
  }

  async function logout() {
    await signOut(auth);
  }

  async function updateUserProfile(updates: {
    displayName: string;
    phone: string;
    defaultAddress: string;
    defaultCity: string;
    defaultState: string;
  }) {
    if (!user) throw new Error('You must be signed in.');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: updates.displayName.slice(0, 120),
        phone: updates.phone.slice(0, 32),
        defaultAddress: updates.defaultAddress.slice(0, 300),
        defaultCity: updates.defaultCity.slice(0, 100),
        defaultState: updates.defaultState.slice(0, 80),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  async function addSavedAddress(addr: Omit<SavedAddress, 'id' | 'userId' | 'createdAt'>) {
    if (!user) throw new Error('You must be signed in.');
    const id = `addr_${Date.now()}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'addresses', id), {
        id,
        userId: user.uid,
        label: addr.label.slice(0, 60),
        recipientName: addr.recipientName.slice(0, 120),
        phone: addr.phone.slice(0, 32),
        streetAddress: addr.streetAddress.slice(0, 300),
        city: addr.city.slice(0, 100),
        state: addr.state.slice(0, 80),
        landmark: (addr.landmark || '').slice(0, 160),
        ...(typeof addr.lat === 'number' ? { lat: addr.lat } : {}),
        ...(typeof addr.lng === 'number' ? { lng: addr.lng } : {}),
        isDefault: Boolean(addr.isDefault),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/addresses/${id}`);
    }
  }

  async function deleteSavedAddress(addressId: string) {
    if (!user) throw new Error('You must be signed in.');
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'addresses', addressId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/addresses/${addressId}`);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        staffRecord,
        staffRole,
        permissions,
        isStaff,
        isSuperAdmin,
        isBootstrapEmailUnverified,
        authReady,
        staffLoading,
        savedAddresses,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        resetPassword,
        resendVerificationEmail,
        linkOrUpdatePassword,
        createStaffAccount,
        logout,
        updateUserProfile,
        addSavedAddress,
        deleteSavedAddress,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
