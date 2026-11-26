import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { Product, RolePermission, SolarPackage, StaffRole, StoreSetting } from '../types';

export const DEFAULT_STORE_SETTINGS: StoreSetting = {
  id: 'storeConfig',
  allowedDurations: [1, 2, 3, 4, 5],
  defaultInitialDepositPercent: 0,
  defaultAdminChargePercent: 0,
  gracePeriodDays: 5,
  bankName: 'Configure Official Bank Name in Admin Settings',
  bankAccountName: 'OFFNOT ENERGY',
  bankAccountNumber: 'Configure in Admin',
  instalmentTerms:
    '1. Maximum Repayment Duration: OFFNOT ENERGY offers flexible instalment plans up to a maximum of five (5) months (Full Payment, 2, 3, 4, or 5 months).\n' +
    '2. Management Approval: All instalment applications are subject to review and approval by OFFNOT ENERGY management before payment collection begins.\n' +
    '3. Strict Pay-Before-Delivery Policy: Customers MUST complete 100% of all required instalment payments before any solar package or equipment is released, dispatched, or scheduled for installation. No delivery, dispatch, or installation occurs before full payment is verified.\n' +
    '4. Completion & Scheduling: Once your final instalment brings the outstanding balance to ₦0, your order status automatically updates to "FULLY PAID – AWAITING DELIVERY" and our engineering team schedules delivery and professional installation.\n' +
    '5. Payment Verification: Online payments via Paystack/Flutterwave are verified automatically on our server. Direct bank transfers are verified by OFFNOT ENERGY Accounts Staff before updating your balance.',
  warrantyPolicy:
    'OFFNOT ENERGY supplies genuine solar components backed by manufacturer and branch warranty terms configured per product and solar package. Warranty documentation and official receipts are issued upon verified full payment and installation completion. Configure specific manufacturer warranty periods per product in the Admin Dashboard.',
  returnPolicy:
    'Unused individual products in sealed original packaging may be inspected at our Dugbe or Dalute branch in Ibadan within the approved inspection window, subject to technical verification. Complete solar packages paid on instalment are reserved upon approval and released only after 100% payment completion.',
  privacyPolicy:
    'OFFNOT ENERGY respects customer privacy. Personal contact details, saved Nigerian delivery addresses, and payment transaction references are stored securely to process orders, verify instalment schedules, coordinate installation in Ibadan and nationwide, and dispatch official payment receipts.',
  termsAndConditions:
    'All purchases on the OFFNOT ENERGY platform are governed by Nigerian commercial regulations and our strict PAY FULLY BEFORE DELIVERY AND INSTALLATION policy for instalment solar packages. Prices are denominated in Nigerian Naira (₦).',
  autoHappyNewMonth: true,
  happyNewMonthMessage:
    'Happy New Month from OFFNOT ENERGY! Wishing you uninterrupted clean solar power, peace of mind, and great success all month long. Visit our Dugbe or Dalute branch in Ibadan or explore our latest solar packages and up to 5-month flexible instalment plans online.',
  lastNewMonthSent: '',
};

export const DEMO_PACKAGES: SolarPackage[] = [
  {
    id: 'demo-offnot-4kva-package',
    name: 'OFFNOT 4KVA SOLAR PACKAGE',
    capacityKva: '4kVA',
    inverterCapacity: '4kVA Hybrid Solar Inverter (Demonstration Spec)',
    batteryCapacity: 'Sample Battery Bank — Update in Admin',
    batteryTechnology: 'Lithium / Deep-Cycle Options (Editable by Admin)',
    panelQuantity: 6,
    panelWattage: 'Monocrystalline Solar Panels (Editable by Admin)',
    accessoriesIncluded:
      'DC/AC Surge Protection Devices, PV Combiner/Breakers, Solar DC Cables, Battery Interconnects & Mounting Rails (Editable by Admin)',
    installationDetails:
      'Professional site assessment, rooftop mounting, inverter/battery commissioning, and load testing by OFFNOT ENERGY engineers after 100% full payment.',
    warrantyInfo: 'Official OFFNOT ENERGY & Manufacturer Warranty — Update exact terms in Admin Dashboard',
    description:
      'Demonstration solar package matching the OFFNOT 4KVA Solar Package specification template. Designed for reliable residential and small business clean energy backup with flexible up to 5-month instalment payments.',
    priceNgn: 2400000,
    allowedDurations: [1, 2, 3, 4, 5],
    initialDepositPercent: 0,
    adminChargePercent: 0,
    isFeatured: true,
    isPublished: true,
    isDemo: true,
  },
];

export const DEMO_PRODUCTS: Product[] = [
  {
    id: 'demo-hybrid-inverter',
    name: 'OFFNOT Sample Hybrid Solar Inverter',
    model: 'DEMO-INV-HYB (Replace in Admin)',
    category: 'Hybrid Inverters',
    description:
      'Demonstration catalog listing for the Hybrid Inverters category. Administrators can edit specifications, upload product photography, and set verified pricing in the Admin Dashboard.',
    specs: 'Pure Sine Wave · MPPT Solar Charge Controller · Demonstration Entry',
    priceNgn: 0,
    stock: 5,
    lowStockThreshold: 2,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: true,
    isPublished: true,
    isDemo: true,
  },
  {
    id: 'demo-lithium-battery',
    name: 'OFFNOT Sample LiFePO4 Lithium Battery',
    model: 'DEMO-BAT-LFP (Replace in Admin)',
    category: 'Lithium Batteries',
    description:
      'Demonstration catalog listing for Lithium Batteries. Replace with your verified battery model, kWh capacity, BMS rating, and Naira price in Admin.',
    specs: 'LiFePO4 Chemistry · Integrated BMS · Demonstration Entry',
    priceNgn: 0,
    stock: 5,
    lowStockThreshold: 2,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: true,
    isPublished: true,
    isDemo: true,
  },
  {
    id: 'demo-tubular-battery',
    name: 'OFFNOT Sample Tall Tubular Battery',
    model: 'DEMO-BAT-TUB (Replace in Admin)',
    category: 'Tubular Batteries',
    description:
      'Demonstration catalog listing for Tubular Batteries. Update capacity (Ah), voltage, and Naira price from Admin Product Management.',
    specs: 'Deep-Cycle Tubular Plate · 12V · Demonstration Entry',
    priceNgn: 0,
    stock: 8,
    lowStockThreshold: 3,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: false,
    isPublished: true,
    isDemo: true,
  },
  {
    id: 'demo-solar-panel',
    name: 'OFFNOT Sample Monocrystalline Solar Panel',
    model: 'DEMO-PV-MONO (Replace in Admin)',
    category: 'Solar Panels',
    description:
      'Demonstration catalog listing for Solar Panels. Replace with verified wattage, cell technology, and current branch price in Admin.',
    specs: 'High-Efficiency Monocrystalline PV Module · Demonstration Entry',
    priceNgn: 0,
    stock: 20,
    lowStockThreshold: 5,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: true,
    isPublished: true,
    isDemo: true,
  },
  {
    id: 'demo-solar-generator',
    name: 'OFFNOT Sample Solar Generator System',
    model: 'DEMO-SOL-GEN (Replace in Admin)',
    category: 'Solar Generators',
    description:
      'Demonstration catalog listing for Solar Generators. Update output wattage, battery storage, and pricing in Admin.',
    specs: 'Plug-and-Play AC/DC Output · Solar Input Ready · Demonstration Entry',
    priceNgn: 0,
    stock: 4,
    lowStockThreshold: 2,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: false,
    isPublished: true,
    isDemo: true,
  },
  {
    id: 'demo-portable-station',
    name: 'OFFNOT Sample Portable Power Station',
    model: 'DEMO-PPS-01 (Replace in Admin)',
    category: 'Portable Power Stations',
    description:
      'Demonstration catalog listing for Portable Power Stations. Configure exact Wh capacity, ports, and price in Admin.',
    specs: 'Compact LiFePO4 Portable Unit · USB-C & AC Outlets · Demonstration Entry',
    priceNgn: 0,
    stock: 6,
    lowStockThreshold: 2,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: true,
    isPublished: true,
    isDemo: true,
  },
  {
    id: 'demo-solar-cable',
    name: 'OFFNOT Sample PV Solar DC Cable',
    model: 'DEMO-CBL-PV (Replace in Admin)',
    category: 'Solar Cables',
    description:
      'Demonstration catalog listing for Solar Cables. Update conductor gauge (mm²), roll length, and price in Admin.',
    specs: 'UV-Resistant Tinned Copper PV Cable · Demonstration Entry',
    priceNgn: 0,
    stock: 30,
    lowStockThreshold: 5,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: false,
    isPublished: true,
    isDemo: true,
  },
  {
    id: 'demo-surge-device',
    name: 'OFFNOT Sample DC/AC Surge Protection Device',
    model: 'DEMO-SPD-01 (Replace in Admin)',
    category: 'Surge Protection Devices',
    description:
      'Demonstration catalog listing for Surge Protection Devices. Set rated voltage, kA discharge rating, and price in Admin.',
    specs: 'Type 2 PV Surge Arrester & Circuit Protection · Demonstration Entry',
    priceNgn: 0,
    stock: 15,
    lowStockThreshold: 4,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: false,
    isPublished: true,
    isDemo: true,
  },
  {
    id: 'demo-solar-accessory',
    name: 'OFFNOT Sample Mounting & Protection Accessories',
    model: 'DEMO-ACC-01 (Replace in Admin)',
    category: 'Solar Accessories',
    description:
      'Demonstration catalog listing for Solar Accessories (MC4 connectors, rails, DC breakers, changeovers). Update specs & pricing in Admin.',
    specs: 'MC4 Connectors, Breakers & Roof Mounting Hardware · Demonstration Entry',
    priceNgn: 0,
    stock: 25,
    lowStockThreshold: 5,
    warranty: 'Editable in Admin Dashboard',
    isBestSeller: false,
    isPublished: true,
    isDemo: true,
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, RolePermission> = {
  super_admin: {
    role: 'super_admin',
    canManageProducts: true,
    canManagePackages: true,
    canApproveInstalments: true,
    canVerifyPayments: true,
    canScheduleDelivery: true,
    canOverrideDeliveryLock: true,
    canManageStaff: true,
    canEditSettings: true,
  },
  ceo: {
    role: 'ceo',
    canManageProducts: true,
    canManagePackages: true,
    canApproveInstalments: true,
    canVerifyPayments: true,
    canScheduleDelivery: true,
    canOverrideDeliveryLock: false,
    canManageStaff: false,
    canEditSettings: true,
  },
  managing_director: {
    role: 'managing_director',
    canManageProducts: true,
    canManagePackages: true,
    canApproveInstalments: true,
    canVerifyPayments: true,
    canScheduleDelivery: true,
    canOverrideDeliveryLock: false,
    canManageStaff: false,
    canEditSettings: true,
  },
  manager: {
    role: 'manager',
    canManageProducts: true,
    canManagePackages: true,
    canApproveInstalments: true,
    canVerifyPayments: true,
    canScheduleDelivery: true,
    canOverrideDeliveryLock: false,
    canManageStaff: false,
    canEditSettings: true,
  },
  sales_rep: {
    role: 'sales_rep',
    canManageProducts: true,
    canManagePackages: false,
    canApproveInstalments: false,
    canVerifyPayments: false,
    canScheduleDelivery: true,
    canOverrideDeliveryLock: false,
    canManageStaff: false,
    canEditSettings: false,
  },
  sales_staff: {
    role: 'sales_staff',
    canManageProducts: true,
    canManagePackages: false,
    canApproveInstalments: false,
    canVerifyPayments: false,
    canScheduleDelivery: true,
    canOverrideDeliveryLock: false,
    canManageStaff: false,
    canEditSettings: false,
  },
  accounts_staff: {
    role: 'accounts_staff',
    canManageProducts: false,
    canManagePackages: false,
    canApproveInstalments: false,
    canVerifyPayments: true,
    canScheduleDelivery: false,
    canOverrideDeliveryLock: false,
    canManageStaff: false,
    canEditSettings: false,
  },
};

export async function seedInitialCatalogIfAdmin(): Promise<void> {
  try {
    const configRef = doc(db, 'settings', 'storeConfig');
    const configSnap = await getDoc(configRef);
    if (!configSnap.exists()) {
      await setDoc(
        configRef,
        {
          ...DEFAULT_STORE_SETTINGS,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }

    for (const pkg of DEMO_PACKAGES) {
      const pkgRef = doc(db, 'packages', pkg.id);
      const pkgSnap = await getDoc(pkgRef);
      if (!pkgSnap.exists()) {
        await setDoc(pkgRef, {
          ...pkg,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const prod of DEMO_PRODUCTS) {
      const prodRef = doc(db, 'products', prod.id);
      const prodSnap = await getDoc(prodRef);
      if (!prodSnap.exists()) {
        await setDoc(prodRef, {
          ...prod,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const roleRef = doc(db, 'rolePermissions', role);
      const roleSnap = await getDoc(roleRef);
      if (!roleSnap.exists()) {
        await setDoc(roleRef, {
          ...perms,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'seedInitialCatalog');
  }
}
