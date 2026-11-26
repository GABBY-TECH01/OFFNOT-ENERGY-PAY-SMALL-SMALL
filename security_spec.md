# OFFNOT ENERGY Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Strict Ownership & PII Isolation**: Customer profiles (`users/{userId}`), saved addresses (`users/{userId}/addresses/{addressId}`), orders (`orders/{orderId}`), payments (`payments/{paymentId}`), and notifications (`notifications/{notificationId}`) contain PII and financial data. Only the owning authenticated user (`request.auth.uid == userId`) or verified authorized OFFNOT ENERGY staff may read them.
2. **No Self-Assigned Admin/Staff Privileges**: Regular users cannot create or modify documents in `staff/{staffId}` or `rolePermissions/{roleId}`. Only the sole root Super Administrator (`francisgabriel932@gmail.com` with verified email) or an active `super_admin` in `staff` can manage staff roles, permissions, and user deletion. CEO, Managing Director, Manager, Dugbe/Dalute Sales Reps, and Accounts Staff sit strictly beneath the Super Administrator.
3. **Pay Fully Before Delivery & Installation**: An `Order` cannot have `deliveryAuthorized == true` or transition to `FULLY_PAID_AWAITING_DELIVERY`, `SCHEDULED_FOR_INSTALLATION`, or `COMPLETED` while `outstandingBalanceNgn > 0` (or `amountPaidNgn < totalAmountNgn`), unless an authorised `super_admin` applies an explicit management override with `overrideApplied == true` and a non-empty `overrideReason` (`>= 10` characters) alongside an immutable `auditLogs` entry.
4. **Instalment Approval Gate**: A customer cannot self-approve their own instalment application (`approvalStatus == 'APPROVED'` or `approvedBy` set on creation/update).
5. **5-Month Maximum Instalment Ceiling**: Orders with `paymentPlan == 'instalment'` must satisfy `durationMonths >= 2 && durationMonths <= 5`. Full payment orders have `durationMonths == 1`.
6. **Immutable Audit Trail**: `auditLogs` cannot be updated or deleted by any user, including Super Administrators.
7. **Timestamp & Key Integrity**: Every document enforces strict `keys().hasAll(...)` and `keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on customer updates, server `request.time` timestamps (`createdAt`, `updatedAt`), and `isValidId()` path validation.

## 2. Dirty Dozen Attack Payloads (Must Return PERMISSION_DENIED)
1. **Self-Role Escalation**: Authenticated customer attempts `setDoc(doc(db, 'staff', uid), { uid, role: 'super_admin', active: true, ... })`.
2. **PII Blanket List Scraping**: Authenticated customer executes `getDocs(collection(db, 'users'))` or `getDocs(collection(db, 'orders'))` without `where('userId', '==', uid)`.
3. **Unauthenticated Order Read**: Unauthenticated visitor attempts `getDoc(doc(db, 'orders', 'ord_1'))`.
4. **Instalment Self-Approval**: Customer creates an order with `paymentPlan: 'instalment'` and `approvalStatus: 'APPROVED'`.
5. **Bypass Pay-Before-Delivery**: Customer updates their own order to `deliveryAuthorized: true` or `orderStatus: 'SCHEDULED_FOR_INSTALLATION'` while `amountPaidNgn < totalAmountNgn`.
6. **Exceed 5-Month Maximum**: Customer submits an instalment order with `durationMonths: 12`.
7. **Shadow Field Injection**: Customer creates an order including extra unknown field `isVipBypass: true`.
8. **Fake Payment Verification**: Customer creates a `bank_transfer` payment with `status: 'VERIFIED'` directly from client.
9. **Audit Log Tampering**: Staff member attempts `updateDoc` or `deleteDoc` on `auditLogs/{logId}`.
10. **Path Variable Poisoning**: Attacker writes to `orders/../../../invalid!id` or a 1.5KB document ID.
11. **Timestamp Forgery**: Customer creates an order with backdated `createdAt` instead of `request.time`.
12. **Unverified Admin Email Spoof**: User with unverified email token (`email_verified: false`) attempts admin access.
