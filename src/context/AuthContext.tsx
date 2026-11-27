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
  getDocs,
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
import type {
  AccountPricingType,
  RolePermission,
  SavedAddress,
  StaffMember,
  StaffRole,
  UserProfile,
} from '../types';
import { DEFAULT_ROLE_PERMISSIONS } from '../utils/seedData';

const BOOTSTRAP_ADMIN_EMAILS = ['francisgabriel932@gmail.com'];
const INSTALLER_CHOICE_STORAGE_KEY = 'offnot_installer_choice_v1';

function readStoredAccountTypeChoice(): AccountPricingType | null {
  try {
    const val = sessionStorage.getItem(INSTALLER_CHOICE_STORAGE_KEY);
    if (val === 'installer' || val === 'end_user') return val;
  } catch {
    // ignore
  }
  return null;
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  staffRecord: StaffMember | null;
  staffRole: StaffRole | null;
  permissions: RolePermission | null;
  isStaff: boolean;
  isSuperAdmin: boolean;
  isInstaller: boolean;
  needsCustomerOnboarding: boolean;
  accountTypeChoice: AccountPricingType | null;
  setInstallerChoice: (isInstallerChoice: boolean) => Promise<void>;
  completeCustomerOnboarding: (params: {
    displayName: string;
    phone: string;
    accountType: AccountPricingType;
    installerNetworkJoined: boolean;
  }) => Promise<void>;
  isBootstrapEmailUnverified: boolean;
  authReady: boolean;
  staffLoading: boolean;
  savedAddresses: SavedAddress[];
  signInWithGoogle: (selectedType?: AccountPricingType) => Promise<void>;
  signInWithEmail: (email: string, password: string, selectedType?: AccountPricingType) => Promise<void>;
  registerWithEmail: (
    name: string,
    email: string,
    password: string,
    phone: string,
    selectedType?: AccountPricingType,
    installerNetworkJoined?: boolean
  ) => Promise<void>;
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
  deleteUserRecord: (targetUid: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (updates: {
    displayName: string;
    phone: string;
    defaultAddress: string;
    defaultCity: string;
    defaultState: string;
    accountType?: AccountPricingType;
    installerNetworkJoined?: boolean;
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
  const [accountTypeChoice, setAccountTypeChoice] = useState<AccountPricingType | null>(() =>
    readStoredAccountTypeChoice()
  );
  const [, setAuthVersion] = useState(0);

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
  const isSuperAdmin = staffRole === 'super_admin';
  const savedPhoneDigits = (profile?.phone || '').replace(/\D/g, '');
  const needsCustomerOnboarding = Boolean(
    authReady &&
      !staffLoading &&
      user &&
      !isStaff &&
      profile &&
      (savedPhoneDigits.length < 10 ||
        (profile.accountType === 'installer' && profile.installerNetworkJoined !== true))
  );
  // Strictly unlock installer pricing ONLY for signed-in users who completed WhatsApp onboarding & joined the Installer Network
  const isInstaller = Boolean(
    user &&
      profile?.accountType === 'installer' &&
      savedPhoneDigits.length >= 10 &&
      profile?.installerNetworkJoined === true
  );

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
        const storedChoice = readStoredAccountTypeChoice();
        const userRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: firebaseUser.uid,
            displayName:
              firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'OFFNOT User',
            email: firebaseUser.email || '',
            phone: '',
            accountType: storedChoice || 'end_user',
            installerNetworkJoined: false,
            defaultAddress: '',
            defaultCity: 'Ibadan',
            defaultState: 'Oyo State',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (
          storedChoice &&
          !snap.data()?.phone &&
          snap.data()?.accountType !== storedChoice
        ) {
          await updateDoc(userRef, {
            accountType: storedChoice,
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

  async function setInstallerChoice(isInstallerChoice: boolean) {
    const nextType: AccountPricingType = isInstallerChoice ? 'installer' : 'end_user';
    setAccountTypeChoice(nextType);
    try {
      sessionStorage.setItem(INSTALLER_CHOICE_STORAGE_KEY, nextType);
    } catch {
      // ignore storage failure
    }
  }

  async function completeCustomerOnboarding(params: {
    displayName: string;
    phone: string;
    accountType: AccountPricingType;
    installerNetworkJoined: boolean;
  }) {
    if (!user) throw new Error('You must be signed in.');
    const digits = params.phone.replace(/\D/g, '');
    if (digits.length < 10) {
      throw new Error(
        'Please enter a valid WhatsApp number (at least 10 digits) so OFFNOT ENERGY staff can follow up on you.'
      );
    }
    if (params.accountType === 'installer' && !params.installerNetworkJoined) {
      throw new Error(
        'Installers/Dealers must join the OFFNOT ENERGY Installer Network WhatsApp group and confirm before continuing.'
      );
    }
    const safeName =
      params.displayName.trim().slice(0, 120) ||
      profile?.displayName ||
      user.displayName ||
      user.email?.split('@')[0] ||
      'OFFNOT Customer';
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: safeName,
        phone: params.phone.trim().slice(0, 32),
        accountType: params.accountType,
        installerNetworkJoined: params.accountType === 'installer',
        updatedAt: serverTimestamp(),
      });
      setAccountTypeChoice(params.accountType);
      try {
        sessionStorage.setItem(INSTALLER_CHOICE_STORAGE_KEY, params.accountType);
      } catch {
        // ignore
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  async function signInWithGoogle(selectedType?: AccountPricingType) {
    setStaffLoading(true);
    if (selectedType) {
      setAccountTypeChoice(selectedType);
      try {
        sessionStorage.setItem(INSTALLER_CHOICE_STORAGE_KEY, selectedType);
      } catch {
        // ignore
      }
    }
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (selectedType && cred.user) {
        const userRef = doc(db, 'users', cred.user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists() && !snap.data()?.phone && snap.data()?.accountType !== selectedType) {
          await updateDoc(userRef, {
            accountType: selectedType,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      setStaffLoading(false);
      throw err;
    }
  }

  async function signInWithEmail(
    email: string,
    password: string,
    selectedType?: AccountPricingType
  ) {
    setStaffLoading(true);
    if (selectedType) {
      setAccountTypeChoice(selectedType);
      try {
        sessionStorage.setItem(INSTALLER_CHOICE_STORAGE_KEY, selectedType);
      } catch {
        // ignore
      }
    }
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (selectedType && cred.user) {
        const userRef = doc(db, 'users', cred.user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists() && !snap.data()?.phone && snap.data()?.accountType !== selectedType) {
          await updateDoc(userRef, {
            accountType: selectedType,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      setStaffLoading(false);
      throw err;
    }
  }

  async function registerWithEmail(
    name: string,
    email: string,
    password: string,
    phone: string,
    selectedType?: AccountPricingType,
    installerNetworkJoined?: boolean
  ) {
    const chosenType: AccountPricingType = selectedType || accountTypeChoice || 'end_user';
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      throw new Error(
        'Please enter a valid WhatsApp number (at least 10 digits) so OFFNOT ENERGY staff can follow up on you.'
      );
    }
    if (chosenType === 'installer' && !installerNetworkJoined) {
      throw new Error(
        'Installers/Dealers must join the OFFNOT ENERGY Installer Network WhatsApp group and confirm before registering.'
      );
    }
    setStaffLoading(true);
    setAccountTypeChoice(chosenType);
    try {
      sessionStorage.setItem(INSTALLER_CHOICE_STORAGE_KEY, chosenType);
    } catch {
      // ignore
    }
    try {
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
          accountType: chosenType,
          installerNetworkJoined:
            chosenType === 'installer' ? Boolean(installerNetworkJoined) : false,
          defaultAddress: '',
          defaultCity: 'Ibadan',
          defaultState: 'Oyo State',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${cred.user.uid}`);
      }
    } catch (err) {
      setStaffLoading(false);
      throw err;
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
    await auth.currentUser.reload();
    setUser(auth.currentUser);
    setAuthVersion((v) => v + 1);
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
      throw new Error('Only the Super Admin can create staff accounts.');
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

  async function deleteUserRecord(targetUid: string): Promise<void> {
    if (!user || !isSuperAdmin) {
      throw new Error('Only the Super Admin can delete user accounts.');
    }
    if (targetUid === user.uid) {
      throw new Error('You cannot delete your own active Super Admin account.');
    }
    try {
      const addrSnap = await getDocs(collection(db, 'users', targetUid, 'addresses'));
      for (const addrDoc of addrSnap.docs) {
        await deleteDoc(doc(db, 'users', targetUid, 'addresses', addrDoc.id));
      }
      const staffSnap = await getDoc(doc(db, 'staff', targetUid));
      if (staffSnap.exists()) {
        await deleteDoc(doc(db, 'staff', targetUid));
      }
      await deleteDoc(doc(db, 'users', targetUid));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${targetUid}`);
    }
  }

  async function logout() {
    setAccountTypeChoice(null);
    try {
      sessionStorage.removeItem(INSTALLER_CHOICE_STORAGE_KEY);
    } catch {
      // ignore
    }
    await signOut(auth);
  }

  async function updateUserProfile(updates: {
    displayName: string;
    phone: string;
    defaultAddress: string;
    defaultCity: string;
    defaultState: string;
    accountType?: AccountPricingType;
    installerNetworkJoined?: boolean;
  }) {
    if (!user) throw new Error('You must be signed in.');
    const safeName = updates.displayName.trim().slice(0, 120);
    if (!safeName) throw new Error('Full name cannot be empty.');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: safeName,
        phone: updates.phone.trim().slice(0, 32),
        defaultAddress: updates.defaultAddress.trim().slice(0, 300),
        defaultCity: updates.defaultCity.trim().slice(0, 100),
        defaultState: updates.defaultState.trim().slice(0, 80),
        ...(updates.accountType ? { accountType: updates.accountType } : {}),
        ...(typeof updates.installerNetworkJoined === 'boolean'
          ? { installerNetworkJoined: updates.installerNetworkJoined }
          : {}),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  async function addSavedAddress(addr: Omit<SavedAddress, 'id' | 'userId' | 'createdAt'>) {
    if (!user) throw new Error('You must be signed in.');
    const id = `addr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'addresses', id), {
        id,
        userId: user.uid,
        label: addr.label.trim().slice(0, 60) || 'Home',
        recipientName: addr.recipientName.trim().slice(0, 120),
        phone: addr.phone.trim().slice(0, 32),
        streetAddress: addr.streetAddress.trim().slice(0, 300),
        city: addr.city.trim().slice(0, 100),
        state: addr.state.trim().slice(0, 80),
        landmark: (addr.landmark || '').trim().slice(0, 160),
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
        isInstaller,
        needsCustomerOnboarding,
        accountTypeChoice,
        setInstallerChoice,
        completeCustomerOnboarding,
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
        deleteUserRecord,
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
