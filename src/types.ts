export type PageRoute =
  | 'home'
  | 'shop'
  | 'packages'
  | 'package-detail'
  | 'how-it-works'
  | 'services'
  | 'about'
  | 'contact'
  | 'policies'
  | 'checkout'
  | 'auth'
  | 'account'
  | 'admin';

export type ProductCategory =
  | 'Hybrid Inverters'
  | 'Lithium Batteries'
  | 'Tubular Batteries'
  | 'Solar Panels'
  | 'Solar Generators'
  | 'Portable Power Stations'
  | 'Solar Cables'
  | 'Surge Protection Devices'
  | 'Solar Accessories';

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Hybrid Inverters',
  'Lithium Batteries',
  'Tubular Batteries',
  'Solar Panels',
  'Solar Generators',
  'Portable Power Stations',
  'Solar Cables',
  'Surge Protection Devices',
  'Solar Accessories',
];

export type StaffRole =
  | 'super_admin'
  | 'ceo'
  | 'managing_director'
  | 'manager'
  | 'sales_rep'
  | 'sales_staff'
  | 'accounts_staff';

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: 'Super Admin',
  ceo: 'CEO',
  managing_director: 'Managing Director',
  manager: 'Manager',
  sales_rep: 'Sales Rep',
  sales_staff: 'Sales Staff',
  accounts_staff: 'Accounts Staff',
};

export type AccountPricingType = 'installer' | 'end_user';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  accountType?: AccountPricingType;
  defaultAddress?: string;
  defaultCity?: string;
  defaultState?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SavedAddress {
  id: string;
  userId: string;
  label: string;
  recipientName: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  isDefault?: boolean;
  createdAt?: unknown;
}

export interface StaffMember {
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  branch?: string;
  active: boolean;
  addedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RolePermission {
  role: StaffRole;
  canManageProducts: boolean;
  canManagePackages: boolean;
  canApproveInstalments: boolean;
  canVerifyPayments: boolean;
  canScheduleDelivery: boolean;
  canOverrideDeliveryLock: boolean;
  canManageStaff: boolean;
  canEditSettings: boolean;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  name: string;
  model: string;
  category: ProductCategory;
  description: string;
  specs: string;
  priceNgn: number;
  installerPriceNgn?: number;
  stock: number;
  lowStockThreshold?: number;
  imageUrl?: string;
  warranty?: string;
  isBestSeller?: boolean;
  isPublished: boolean;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SolarPackage {
  id: string;
  name: string;
  capacityKva: string;
  inverterCapacity: string;
  batteryCapacity: string;
  batteryTechnology: string;
  panelQuantity: number;
  panelWattage: string;
  accessoriesIncluded: string;
  installationDetails: string;
  warrantyInfo: string;
  description: string;
  priceNgn: number;
  imageUrl?: string;
  allowedDurations: number[];
  initialDepositPercent?: number;
  adminChargePercent?: number;
  isFeatured?: boolean;
  isPublished: boolean;
  isDemo?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderItem {
  productId: string;
  name: string;
  model: string;
  category: ProductCategory;
  quantity: number;
  unitPriceNgn: number;
  lineTotalNgn: number;
}

export interface InstalmentScheduleItem {
  instalmentNumber: number;
  label: string;
  dueDate: string;
  amountNgn: number;
  status: 'PENDING' | 'AWAITING_VERIFICATION' | 'PAID';
  paidAt?: string;
  paymentReference?: string;
}

export type OrderStatus =
  | 'PENDING_APPROVAL'
  | 'AWAITING_PAYMENT'
  | 'IN_INSTALMENT'
  | 'FULLY_PAID_AWAITING_DELIVERY'
  | 'SCHEDULED_FOR_INSTALLATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type PaymentStatus = 'UNPAID' | 'AWAITING_VERIFICATION' | 'PARTIALLY_PAID' | 'FULLY_PAID';

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderType: 'product_order' | 'package_order';
  items?: OrderItem[];
  packageId?: string;
  packageName?: string;
  subtotalNgn: number;
  deliveryFeeNgn?: number;
  installationFeeNgn?: number;
  adminChargeNgn?: number;
  totalAmountNgn: number;
  amountPaidNgn: number;
  outstandingBalanceNgn: number;
  paymentPlan: 'full' | 'instalment';
  durationMonths: number;
  monthlyInstalmentNgn?: number;
  initialDepositNgn?: number;
  approvalStatus: ApprovalStatus;
  approvalNotes?: string;
  approvedBy?: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  deliveryAuthorized: boolean;
  deliveryAddress: string;
  deliveryState?: string;
  deliveryBranch?: string;
  deliveryScheduledDate?: string;
  installationScheduledDate?: string;
  completedAt?: string;
  nextPaymentDueDate?: string;
  schedule?: InstalmentScheduleItem[];
  acceptedPolicyAt: string;
  overrideApplied?: boolean;
  overrideBy?: string;
  overrideReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentRecord {
  id: string;
  receiptNumber: string;
  reference: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  amountNgn: number;
  method: 'paystack' | 'flutterwave' | 'bank_transfer' | 'branch_cash';
  channel?: string;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'FAILED';
  instalmentNumber?: number;
  verifiedBy?: string;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditLog {
  id: string;
  action: string;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
  targetType: string;
  targetId: string;
  details: string;
  reason?: string;
  createdAt?: unknown;
}

export interface Review {
  id: string;
  userId: string;
  customerName: string;
  location: string;
  packageOrProduct: string;
  rating: number;
  quote: string;
  isPublished: boolean;
  createdAt?: unknown;
}

export interface Inquiry {
  id: string;
  name: string;
  email: string;
  phone: string;
  branch?: string;
  serviceType?: string;
  message: string;
  status: 'NEW' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt?: unknown;
}

export interface NotificationLog {
  id: string;
  userId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  type: string;
  title: string;
  message: string;
  channel: 'email' | 'whatsapp' | 'in_app';
  status: 'SENT' | 'QUEUED' | 'LOGGED';
  orderId?: string;
  createdAt?: unknown;
}

export interface StoreSetting {
  id: string;
  allowedDurations: number[];
  defaultInitialDepositPercent: number;
  defaultAdminChargePercent: number;
  gracePeriodDays: number;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  instalmentTerms: string;
  warrantyPolicy: string;
  returnPolicy: string;
  privacyPolicy: string;
  termsAndConditions: string;
  autoHappyNewMonth?: boolean;
  happyNewMonthMessage?: string;
  lastNewMonthSent?: string;
  updatedAt?: unknown;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface GatewayConfig {
  paystackConfigured: boolean;
  paystackSecretPresent: boolean;
  paystackPublicKey: string;
  flutterwaveConfigured: boolean;
  flutterwaveSecretPresent: boolean;
  flutterwavePublicKey: string;
  emailConfigured: boolean;
  mapsConfigured: boolean;
  mode: 'sandbox' | 'live';
}
