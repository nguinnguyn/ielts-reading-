import {
  ExamData,
  LocalExamRecord,
  LocalAttemptRecord,
  NotesRegistry,
} from '../types';

const DB_NAME = 'ielts_reading_simulator_local_db';
const DB_VERSION = 1;
const EXAMS_STORE = 'exams';
const ATTEMPTS_STORE = 'attempts';

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EXAMS_STORE)) {
        db.createObjectStore(EXAMS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ATTEMPTS_STORE)) {
        db.createObjectStore(ATTEMPTS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllLocalExams(): Promise<LocalExamRecord[]> {
  try {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(EXAMS_STORE, 'readonly');
      const store = tx.objectStore(EXAMS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as LocalExamRecord[];
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB getAllLocalExams fallback:', e);
    return [];
  }
}

export async function saveLocalExam(
  exam: ExamData,
  existingId?: string
): Promise<LocalExamRecord> {
  const db = await openLocalDb();
  const now = Date.now();
  const id =
    existingId ||
    exam.id ||
    `exam_${now}_${Math.random().toString(36).slice(2, 7)}`;

  const partCount = exam.parts.length || 1;
  const questionCount = exam.parts.reduce(
    (acc, p) => acc + (p.questions?.length || 0),
    0
  );
  const keyCount = exam.parts.reduce(
    (acc, p) => acc + Object.keys(p.answers || {}).length,
    0
  );

  const record: LocalExamRecord = {
    id,
    title: exam.title || 'IELTS Reading Test',
    partCount,
    questionCount,
    keyCount,
    examPayload: {
      id,
      title: exam.title || 'IELTS Reading Test',
      parts: exam.parts,
    },
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXAMS_STORE, 'readwrite');
    const store = tx.objectStore(EXAMS_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as LocalExamRecord | undefined;
      const finalRecord: LocalExamRecord = existing
        ? { ...record, createdAt: existing.createdAt, updatedAt: now }
        : record;
      store.put(finalRecord);
      tx.oncomplete = () => resolve(finalRecord);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteLocalExam(examId: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EXAMS_STORE, 'readwrite');
    tx.objectStore(EXAMS_STORE).delete(examId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllLocalAttempts(): Promise<LocalAttemptRecord[]> {
  try {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ATTEMPTS_STORE, 'readonly');
      const store = tx.objectStore(ATTEMPTS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as LocalAttemptRecord[];
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB getAllLocalAttempts fallback:', e);
    return [];
  }
}

export async function saveLocalAttempt(params: {
  exam: ExamData;
  examId?: string;
  score: number;
  totalQuestions: number;
  bandScore: number;
  timeSpentSeconds: number;
  userAnswers: Record<string, string>;
  notesRegistry: NotesRegistry;
  savedPassageHtml: Record<string, string>;
}): Promise<LocalAttemptRecord> {
  const savedExam = await saveLocalExam(params.exam, params.examId);
  const db = await openLocalDb();
  const now = Date.now();
  const attemptId = `att_${now}_${Math.random().toString(36).slice(2, 7)}`;

  const record: LocalAttemptRecord = {
    id: attemptId,
    examId: savedExam.id,
    examTitle: savedExam.title,
    examSnapshot: savedExam.examPayload,
    score: params.score,
    totalQuestions: params.totalQuestions,
    bandScore: params.bandScore,
    timeSpentSeconds: params.timeSpentSeconds,
    userAnswers: { ...params.userAnswers },
    notesRegistry: { ...params.notesRegistry },
    savedPassageHtml: { ...params.savedPassageHtml },
    createdAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTEMPTS_STORE, 'readwrite');
    tx.objectStore(ATTEMPTS_STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteLocalAttempt(attemptId: string): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ATTEMPTS_STORE, 'readwrite');
    tx.objectStore(ATTEMPTS_STORE).delete(attemptId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllLocalHistory(): Promise<void> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([ATTEMPTS_STORE], 'readwrite');
    tx.objectStore(ATTEMPTS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
