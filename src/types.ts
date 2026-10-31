export type QuestionType = 'tfng' | 'yes_no' | 'mcq' | 'select' | 'fill';

export type ContrastTheme = 'default' | 'dark' | 'yellow';

export type FontSizeScale = 'sm' | 'base' | 'lg' | 'xl' | '2xl';

export type HighlightColor = 'hl-yellow' | 'hl-green' | 'hl-blue' | 'hl-pink' | 'hl-orange';

export interface ExamQuestion {
  id: number;
  groupTitle?: string | null;
  type: QuestionType;
  options?: string[];
  prompt: string;
}

export interface ExamPart {
  id: number;
  title: string;
  instructions: string;
  content: string;
  questions: ExamQuestion[];
  answers: Record<string, string>;
}

export interface ExamData {
  id?: string;
  title: string;
  parts: ExamPart[];
}

export interface HighlightEntry {
  partId: number;
  text: string;
  note: string;
  color: HighlightColor;
}

export type NotesRegistry = Record<string, HighlightEntry>;

export interface LocalExamRecord {
  id: string;
  title: string;
  partCount: number;
  questionCount: number;
  keyCount: number;
  examPayload: ExamData;
  createdAt: number;
  updatedAt: number;
}

export interface LocalAttemptRecord {
  id: string;
  examId: string;
  examTitle: string;
  examSnapshot: ExamData;
  score: number;
  totalQuestions: number;
  bandScore: number;
  timeSpentSeconds: number;
  userAnswers: Record<string, string>;
  notesRegistry: NotesRegistry;
  savedPassageHtml: Record<string, string>;
  createdAt: number;
}
