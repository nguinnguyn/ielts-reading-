# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every `/exams/{examId}` and `/attempts/{attemptId}` document must have an `ownerId` matching `request.auth.uid` with a verified email (`request.auth.token.email_verified == true`). No user can read, list, update, or delete another user's exams or attempts.
2. **Relational Integrity (Master Gate)**: An `Attempt` document cannot be created unless the referenced `/exams/{examId}` document exists and its `ownerId` matches `request.auth.uid`.
3. **Immutable & Temporal Fields**: `ownerId`, `examId` (on attempts), and `createdAt` are strictly immutable after creation. `createdAt` and `updatedAt` must equal `request.time`.
4. **Strict Key Allowlisting & Volumetric Bounds**: All string fields, map sizes, and path IDs (`^[a-zA-Z0-9_\-]+$`, max 128 chars) are strictly bounded. Shadow fields are rejected via `hasAll` and `hasOnly`.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: Creating `/exams/exam_1` with `auth == null`.
2. **Unverified Email Spoof**: Creating `/exams/exam_1` with `email_verified: false`.
3. **Identity Spoofing**: Creating `/exams/exam_1` where `ownerId: "victim_uid" != request.auth.uid`.
4. **Shadow Field Injection**: Updating `/exams/exam_1` with an extra undeclared field `isAdmin: true`.
5. **Path ID Poisoning**: Creating `/exams/invalid$id!with*spaces` or ID > 128 chars.
6. **Orphaned Attempt Creation**: Creating `/attempts/att_1` referencing a non-existent `examId: "non_existent"`.
7. **Cross-Tenant Relational Hijack**: Creating `/attempts/att_1` referencing an `examId` owned by another user.
8. **Timestamp Forgery**: Creating `/exams/exam_1` with a past or future client-supplied `createdAt != request.time`.
9. **Immutable Field Mutation**: Updating `/exams/exam_1` to change `ownerId` or `createdAt`.
10. **Value Poisoning / Denial of Wallet**: Creating `/exams/exam_1` with a 10,000-character `title` (> 200 max).
11. **Blanket List Scraping**: Listing `/exams` or `/attempts` without filtering `resource.data.ownerId == request.auth.uid`.
12. **Unauthorized Update Key**: Updating `/attempts/att_1` to mutate `examId` or `score` outside allowed action keys.
