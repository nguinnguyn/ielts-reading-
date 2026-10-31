/**
 * Security Rules Verification Suite (Dirty Dozen Payloads)
 * Verifies all 12 adversarial payloads against firestore.rules invariants.
 */

export interface SecurityPayloadTest {
  id: number;
  name: string;
  collection: 'exams' | 'attempts';
  docId: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityPayloadTest[] = [
  {
    id: 1,
    name: 'Unauthenticated Write',
    collection: 'exams',
    docId: 'exam_1',
    operation: 'create',
    auth: null,
    payload: { ownerId: 'user_1', title: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof',
    collection: 'exams',
    docId: 'exam_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: false },
    payload: { ownerId: 'user_1', title: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity Spoofing',
    collection: 'exams',
    docId: 'exam_1',
    operation: 'create',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'victim_uid', title: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection',
    collection: 'exams',
    docId: 'exam_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { isAdmin: true, title: 'Updated' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Path ID Poisoning',
    collection: 'exams',
    docId: 'invalid$id!with*spaces',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', title: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned Attempt Creation',
    collection: 'attempts',
    docId: 'att_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', examId: 'missing_exam_id', examTitle: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Cross-Tenant Relational Hijack',
    collection: 'attempts',
    docId: 'att_1',
    operation: 'create',
    auth: { uid: 'attacker_uid', email_verified: true },
    payload: { ownerId: 'attacker_uid', examId: 'victim_exam_id', examTitle: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Timestamp Forgery',
    collection: 'exams',
    docId: 'exam_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', title: 'Test', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable Field Mutation',
    collection: 'exams',
    docId: 'exam_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'new_owner_uid' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Value Poisoning / Overlong Title',
    collection: 'exams',
    docId: 'exam_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', title: 'A'.repeat(1000) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Cross-Tenant Get Read',
    collection: 'exams',
    docId: 'victim_exam_1',
    operation: 'get',
    auth: { uid: 'attacker_uid', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized Attempt Score Mutation',
    collection: 'attempts',
    docId: 'att_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { score: 40, bandScore: 9.0 },
    expectedResult: 'PERMISSION_DENIED',
  },
];
