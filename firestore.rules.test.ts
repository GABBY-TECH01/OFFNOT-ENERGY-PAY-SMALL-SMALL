/**
 * Phase 0 Security Verification Suite for OFFNOT ENERGY Firestore Rules
 * Tests the "Dirty Dozen" adversarial payloads against firestore.rules.
 */

export const dirtyDozenPayloads = [
  {
    name: '1. Self-Role Escalation',
    path: 'staff/attackerUid',
    operation: 'create',
    payload: { uid: 'attackerUid', role: 'super_admin', active: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. PII Blanket List Scraping',
    path: 'users',
    operation: 'list',
    payload: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Unauthenticated Order Read',
    path: 'orders/ord_1',
    operation: 'get',
    payload: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Instalment Self-Approval',
    path: 'orders/ord_2',
    operation: 'create',
    payload: { paymentPlan: 'instalment', approvalStatus: 'APPROVED', durationMonths: 4 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Bypass Pay-Before-Delivery',
    path: 'orders/ord_3',
    operation: 'update',
    payload: { deliveryAuthorized: true, orderStatus: 'SCHEDULED_FOR_INSTALLATION' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Exceed 5-Month Maximum',
    path: 'orders/ord_4',
    operation: 'create',
    payload: { paymentPlan: 'instalment', durationMonths: 12 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Shadow Field Injection',
    path: 'orders/ord_5',
    operation: 'create',
    payload: { isVipBypass: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Fake Bank Transfer Verification',
    path: 'payments/pay_1',
    operation: 'create',
    payload: { method: 'bank_transfer', status: 'VERIFIED' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Audit Log Tampering',
    path: 'auditLogs/log_1',
    operation: 'delete',
    payload: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Path Variable Poisoning',
    path: 'orders/invalid!path$id',
    operation: 'create',
    payload: {},
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Timestamp Forgery',
    path: 'orders/ord_6',
    operation: 'create',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Unverified Admin Email Spoof',
    path: 'packages/pkg_1',
    operation: 'create',
    payload: { email: 'francisgabriel932@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
];
