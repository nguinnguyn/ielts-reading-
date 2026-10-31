import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ExamData,
  ContrastTheme,
  HighlightColor,
  NotesRegistry,
  LocalExamRecord,
  LocalAttemptRecord,
  ExamQuestion,
} from './types';
import {
  scanAndParsePdfFile,
  scanAndParsePdfArrayBuffer,
  countTotalQuestions,
  countTotalKeys,
  checkIsAnswerCorrect,
  calculateIeltsBand,
  parseRawAnswerKeyText,
} from './utils/pdfParser';
import {
  getAllLocalExams,
  saveLocalExam,
  deleteLocalExam,
  getAllLocalAttempts,
  saveLocalAttempt,
  deleteLocalAttempt,
  clearAllLocalHistory,
} from './utils/localStorageDb';
import { BUILT_IN_SAMPLE_PDFS, BuiltInSamplePdf } from './utils/sampleTestsCatalog';
import {
  Upload,
  Clock,
  BookOpen,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Sparkles,
  FileText,
  Play,
  Eye,
  EyeOff,
  KeyRound,
  Trophy,
  Library,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  StickyNote,
  Check,
  Download,
} from 'lucide-react';
import { jsPDF } from 'jspdf';

const FONT_SIZE_PRESETS = [
  { label: 'Small', viLabel: 'Nhỏ', px: 14 },
  { label: 'Standard', viLabel: 'Tiêu chuẩn (Mặc định)', px: 16 },
  { label: 'Large', viLabel: 'Lớn', px: 18 },
  { label: 'Extra Large', viLabel: 'Rất lớn', px: 21 },
  { label: 'Huge', viLabel: 'Cực lớn', px: 24 },
];

export default function App() {
  // Local IndexedDB State (Exams, Attempts & Achievements)
  const [localExams, setLocalExams] = useState<LocalExamRecord[]>([]);
  const [localAttempts, setLocalAttempts] = useState<LocalAttemptRecord[]>([]);
  const [setupTab, setSetupTab] = useState<'upload' | 'samples' | 'library' | 'history'>('upload');
  const [localStatusMsg, setLocalStatusMsg] = useState<string | null>(null);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);

  // Setup & PDF Parsing State
  const [isSetupOpen, setIsSetupOpen] = useState(true);
  const [examData, setExamData] = useState<ExamData | null>(null);
  const [currentExamLocalId, setCurrentExamLocalId] = useState<string | undefined>(undefined);
  const [selectedFileName, setSelectedFileName] = useState<string>(
    'Click or drag & drop your IELTS Reading PDF file here'
  );
  const [parseStatus, setParseStatus] = useState<{
    type: 'info' | 'success' | 'error';
    message: string;
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Quick Answer Key Importer / Editor State
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const [rawKeyInputText, setRawKeyInputText] = useState('');

  // Timer Setup & Exam Runtime Timer State
  const [timerPreset, setTimerPreset] = useState<number | null>(60);
  const [customMinutes, setCustomMinutes] = useState<number>(60);
  const [initialTimerSeconds, setInitialTimerSeconds] = useState<number>(3600);
  const [timerSeconds, setTimerSeconds] = useState<number>(3600);
  const [isUntimed, setIsUntimed] = useState<boolean>(false);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [isTimerVisible, setIsTimerVisible] = useState<boolean>(true);
  const [showMinutesOnlyMode, setShowMinutesOnlyMode] = useState<boolean>(false);
  const [showTimeAdjustPopover, setShowTimeAdjustPopover] = useState<boolean>(false);
  const [adjustMinutesInput, setAdjustMinutesInput] = useState<string>('60');

  // Exam Workspace State
  const [hasStartedExam, setHasStartedExam] = useState<boolean>(false);
  const [currentPart, setCurrentPart] = useState<number>(1);
  const [currentQuestionId, setCurrentQuestionId] = useState<number>(1);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [reviewFlags, setReviewFlags] = useState<Record<number, boolean>>({});
  const [savedPassageHtml, setSavedPassageHtml] = useState<Record<string, string>>({});
  const [notesRegistry, setNotesRegistry] = useState<NotesRegistry>({});
  const [isNotesDrawerOpen, setIsNotesDrawerOpen] = useState<boolean>(false);

  // Authentic Inspera Appearance, Font Scaling & Modals State
  const [theme, setTheme] = useState<ContrastTheme>(() => {
    const saved = localStorage.getItem('ielts_theme') as ContrastTheme | null;
    return saved || 'default';
  });
  const [fontSizePx, setFontSizePx] = useState<number>(() => {
    const saved = Number(localStorage.getItem('ielts_font_size_px'));
    return saved >= 12 && saved <= 28 ? saved : 16;
  });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);
  const [isScreenHidden, setIsScreenHidden] = useState<boolean>(false);

  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState<number>(50);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  // Highlighter & Sticky Note Popover State
  const [floatToolbarPos, setFloatToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [notePopoverState, setNotePopoverState] = useState<{
    x: number;
    y: number;
    hlId: string;
    noteText: string;
  } | null>(null);

  // Result Page State
  const [isResultModalOpen, setIsResultModalOpen] = useState<boolean>(false);
  const [hasSubmittedExam, setHasSubmittedExam] = useState<boolean>(false);
  const [lastTimeSpent, setLastTimeSpent] = useState<number>(0);

  // Refs
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const splitPaneRef = useRef<HTMLDivElement | null>(null);
  const passageContentRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const floatToolbarRef = useRef<HTMLDivElement | null>(null);
  const notePopoverRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const activeHighlightElRef = useRef<HTMLElement | null>(null);

  // Sync body theme class and persist theme/font-size preferences
  useEffect(() => {
    document.body.className = `h-screen flex flex-col overflow-hidden antialiased theme-${theme}`;
    localStorage.setItem('ielts_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--exam-font-size', `${fontSizePx}px`);
    localStorage.setItem('ielts_font_size_px', String(fontSizePx));
  }, [fontSizePx]);

  const adjustFontSize = (delta: number) => {
    setFontSizePx((prev) => Math.min(28, Math.max(12, prev + delta)));
  };

  // Load local exams & attempt history from IndexedDB (auto-invalidate stale sample cache on parser upgrade)
  const PARSER_CACHE_VERSION = 'v6_wbr_2025';
  const refreshLocalData = useCallback(async () => {
    const currentVer = localStorage.getItem('ielts_parser_cache_ver');
    let exams = await getAllLocalExams();
    if (currentVer !== PARSER_CACHE_VERSION) {
      for (const ex of exams) {
        if (ex.id.startsWith('sample-test-')) {
          await deleteLocalExam(ex.id);
        }
      }
      localStorage.setItem('ielts_parser_cache_ver', PARSER_CACHE_VERSION);
      exams = await getAllLocalExams();
    }
    const attempts = await getAllLocalAttempts();
    setLocalExams(exams);
    setLocalAttempts(attempts);
  }, []);

  useEffect(() => {
    refreshLocalData();
  }, [refreshLocalData]);

  // Countdown / Elapsed Timer Interval
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (isUntimed) {
          return prev + 1;
        }
        if (prev <= 1) {
          clearInterval(interval);
          setIsTimerRunning(false);
          setTimeout(() => {
            handleSubmitAndGrade();
          }, 50);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, isUntimed]);

  // Split-pane Resizer mouse handlers
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!splitPaneRef.current) return;
      const totalW = splitPaneRef.current.offsetWidth;
      const leftPct = (e.clientX / totalW) * 100;
      if (leftPct > 20 && leftPct < 80) {
        setLeftPaneWidthPct(leftPct);
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Save current passage DOM innerHTML before switching parts
  const syncCurrentPassageDomToState = useCallback(() => {
    if (passageContentRef.current && passageContentRef.current.innerHTML.trim()) {
      const html = passageContentRef.current.innerHTML;
      setSavedPassageHtml((prev) => ({
        ...prev,
        [String(currentPart)]: html,
      }));
      return html;
    }
    return undefined;
  }, [currentPart]);

  // Populate passage innerHTML only when part changes or exam changes
  const activePartObj =
    examData?.parts.find((p) => p.id === currentPart) || examData?.parts[0] || null;

  useEffect(() => {
    if (!passageContentRef.current || !activePartObj) return;
    const htmlToRender = savedPassageHtml[String(activePartObj.id)] || activePartObj.content;
    if (passageContentRef.current.innerHTML !== htmlToRender) {
      passageContentRef.current.innerHTML = htmlToRender;
    }
  }, [currentPart, examData, activePartObj, savedPassageHtml, isResultModalOpen]);

  // Text selection & click-on-highlight listener
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        floatToolbarRef.current?.contains(target) ||
        notePopoverRef.current?.contains(target)
      ) {
        return;
      }

      const hlNode = target.closest('[data-hl-id]') as HTMLElement | null;
      if (hlNode && passageContentRef.current?.contains(hlNode)) {
        const hlId = hlNode.getAttribute('data-hl-id') || '';
        activeHighlightElRef.current = hlNode;
        setFloatToolbarPos(null);
        setNotePopoverState({
          x: Math.min(window.innerWidth - 300, Math.max(12, e.clientX - 40)),
          y: Math.min(window.innerHeight - 210, Math.max(12, e.clientY + 10)),
          hlId,
          noteText: notesRegistry[hlId]?.note || '',
        });
        return;
      }

      setNotePopoverState(null);

      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      const inLeft =
        sel?.anchorNode && passageContentRef.current?.contains(sel.anchorNode);

      if (sel && text.length > 0 && inLeft) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
        setFloatToolbarPos({
          x: Math.min(window.innerWidth - 230, Math.max(12, e.clientX - 60)),
          y: Math.max(12, e.clientY - 46),
        });
      } else {
        setFloatToolbarPos(null);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [notesRegistry]);

  // Apply 5-color highlight to selected range
  const applyHighlight = (colorClass: HighlightColor, openNoteAfter = false) => {
    const range = savedRangeRef.current;
    if (!range) return;

    const hlId = `hl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const span = document.createElement('span');
    span.className = colorClass;
    span.setAttribute('data-hl-id', hlId);
    const selectedText = range.toString().trim();

    try {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    } catch (err) {
      console.warn('Highlight wrap warning:', err);
    }

    setNotesRegistry((prev) => ({
      ...prev,
      [hlId]: {
        partId: currentPart,
        text: selectedText.slice(0, 120),
        note: '',
        color: colorClass,
      },
    }));

    syncCurrentPassageDomToState();
    setFloatToolbarPos(null);
    window.getSelection()?.removeAllRanges();
    savedRangeRef.current = null;

    if (openNoteAfter) {
      const rect = span.getBoundingClientRect();
      activeHighlightElRef.current = span;
      setNotePopoverState({
        x: Math.min(window.innerWidth - 300, Math.max(12, rect.left)),
        y: Math.min(window.innerHeight - 210, Math.max(12, rect.bottom + 8)),
        hlId,
        noteText: '',
      });
    }
  };

  const changeActiveHighlightColor = (newColor: HighlightColor) => {
    const el = activeHighlightElRef.current;
    if (!el || !notePopoverState) return;
    const { hlId } = notePopoverState;
    (['hl-yellow', 'hl-green', 'hl-blue', 'hl-pink', 'hl-orange'] as HighlightColor[]).forEach(
      (c) => el.classList.remove(c)
    );
    el.classList.add(newColor);
    setNotesRegistry((prev) =>
      prev[hlId] ? { ...prev, [hlId]: { ...prev[hlId], color: newColor } } : prev
    );
    syncCurrentPassageDomToState();
  };

  const saveActiveNote = () => {
    const el = activeHighlightElRef.current;
    if (!el || !notePopoverState) return;
    const { hlId, noteText } = notePopoverState;
    const trimmed = noteText.trim();

    setNotesRegistry((prev) => ({
      ...prev,
      [hlId]: {
        partId: prev[hlId]?.partId || currentPart,
        text: prev[hlId]?.text || (el.textContent || '').slice(0, 120),
        note: trimmed,
        color: prev[hlId]?.color || 'hl-yellow',
      },
    }));

    if (trimmed) {
      el.classList.add('has-note');
      el.title = trimmed;
    } else {
      el.classList.remove('has-note');
      el.removeAttribute('title');
    }

    syncCurrentPassageDomToState();
    setNotePopoverState(null);
    activeHighlightElRef.current = null;
  };

  const removeActiveHighlight = () => {
    const el = activeHighlightElRef.current;
    if (!el || !notePopoverState) return;
    const { hlId } = notePopoverState;
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    }
    setNotesRegistry((prev) => {
      const next = { ...prev };
      delete next[hlId];
      return next;
    });
    syncCurrentPassageDomToState();
    setNotePopoverState(null);
    activeHighlightElRef.current = null;
  };

  const jumpToHighlight = (hlId: string, partId: number) => {
    if (currentPart !== partId) {
      syncCurrentPassageDomToState();
      setCurrentPart(partId);
    }
    setTimeout(() => {
      const el = passageContentRef.current?.querySelector(`[data-hl-id="${hlId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  };

  // Handle PDF Upload (purely local + saved to IndexedDB)
  const processPdfFile = async (file: File) => {
    setSelectedFileName(file.name);
    setIsScanning(true);
    setParseStatus({
      type: 'info',
      message: `Scanning "${file.name}" — Filtering watermarks/footnotes and extracting questions & answer keys...`,
    });

    try {
      const { exam, usedAi } = await scanAndParsePdfFile(file, (progressMsg) => {
        setParseStatus({ type: 'info', message: progressMsg });
      });

      const savedRecord = await saveLocalExam(exam);
      setExamData(savedRecord.examPayload);
      setCurrentExamLocalId(savedRecord.id);
      await refreshLocalData();

      const totalQs = countTotalQuestions(exam);
      const totalKeys = countTotalKeys(exam);

      setParseStatus({
        type: 'success',
        message: `✓ Scanned "${exam.title}" ${usedAi ? '(Enhanced by AI)' : ''}: ${exam.parts.length} Passages, ${totalQs} Questions, and ${totalKeys} Answer Keys extracted (Saved to Local Library).`,
      });
    } catch (err: any) {
      console.error('PDF Scan Error:', err);
      setParseStatus({
        type: 'error',
        message: `Error reading PDF: ${err?.message || 'Invalid or encrypted PDF file.'}`,
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Load and start one of the 20 built-in FC Reading sample PDFs
  const handleSelectBuiltInSample = async (sample: BuiltInSamplePdf, autoStart = true) => {
    setLoadingSampleId(sample.id);
    setParseStatus({
      type: 'info',
      message: `Loading "${sample.title}"...`,
    });

    try {
      const existing = localExams.find((e) => e.id === sample.id);
      if (existing && existing.questionCount >= 40 && existing.keyCount >= 40) {
        setExamData(existing.examPayload);
        setCurrentExamLocalId(existing.id);
        setLoadingSampleId(null);
        if (autoStart) {
          startExam(existing.examPayload, existing.id);
        }
        return;
      }

      const res = await fetch(sample.url);
      if (!res.ok) throw new Error(`Could not fetch ${sample.title}`);
      const buffer = await res.arrayBuffer();

      const { exam } = await scanAndParsePdfArrayBuffer(buffer, sample.title);
      const saved = await saveLocalExam({ ...exam, id: sample.id, title: sample.title }, sample.id);
      setExamData(saved.examPayload);
      setCurrentExamLocalId(saved.id);
      await refreshLocalData();

      setParseStatus({
        type: 'success',
        message: `✓ Ready: "${sample.title}" (${saved.partCount} Passages · ${saved.questionCount} Questions · ${saved.keyCount} Answer Keys).`,
      });

      if (autoStart) {
        startExam(saved.examPayload, saved.id);
      }
    } catch (err: any) {
      console.error('Sample load error:', err);
      setParseStatus({
        type: 'error',
        message: `Could not load sample PDF: ${err?.message || 'Error'}`,
      });
    } finally {
      setLoadingSampleId(null);
    }
  };

  // Apply pasted / edited Answer Keys into current examData and update Local DB
  const handleApplyPastedKeys = async () => {
    if (!examData || !rawKeyInputText.trim()) return;
    const parsedKeys = parseRawAnswerKeyText(rawKeyInputText);
    const extractedCount = Object.keys(parsedKeys).length;
    if (extractedCount === 0) return;

    const updatedParts = examData.parts.map((part) => {
      const nextAnswers = { ...(part.answers || {}) };
      part.questions.forEach((q) => {
        const k = String(q.id);
        if (parsedKeys[k]) {
          nextAnswers[k] = parsedKeys[k];
        }
      });
      return {
        ...part,
        answers: nextAnswers,
      };
    });

    const updatedExam: ExamData = {
      ...examData,
      parts: updatedParts,
    };
    setExamData(updatedExam);
    setShowKeyEditor(false);
    setRawKeyInputText('');

    const totalQs = countTotalQuestions(updatedExam);
    const totalKeys = countTotalKeys(updatedExam);
    setParseStatus({
      type: 'success',
      message: `✓ Updated Answer Keys for "${updatedExam.title}": ${totalKeys} / ${totalQs} Answer Keys ready.`,
    });

    try {
      const saved = await saveLocalExam(updatedExam, currentExamLocalId);
      setCurrentExamLocalId(saved.id);
      await refreshLocalData();
    } catch (e) {
      console.warn('Failed to update exam keys in local storage:', e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processPdfFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.pdf')) {
      processPdfFile(file);
    }
  };

  // Start Exam from Setup Modal
  const startExam = (customExam?: ExamData, localId?: string) => {
    const targetExam = customExam || examData;
    if (!targetExam || !targetExam.parts || targetExam.parts.length === 0) return;

    if (customExam) {
      setExamData(customExam);
    }
    if (localId) {
      setCurrentExamLocalId(localId);
    }

    setUserAnswers({});
    setReviewFlags({});
    setSavedPassageHtml({});
    setNotesRegistry({});

    const mins = Number(customMinutes);
    if (isNaN(mins) || mins <= 0) {
      setIsUntimed(true);
      setInitialTimerSeconds(0);
      setTimerSeconds(0);
    } else {
      setIsUntimed(false);
      setInitialTimerSeconds(mins * 60);
      setTimerSeconds(mins * 60);
    }

    const firstPartId = targetExam.parts[0].id;
    const firstQId = targetExam.parts[0]?.questions?.[0]?.id || 1;
    setCurrentPart(firstPartId);
    setCurrentQuestionId(firstQId);
    setHasStartedExam(true);
    setHasSubmittedExam(false);
    setIsSetupOpen(false);
    setIsResultModalOpen(false);
    setIsTimerRunning(true);
  };

  // Review a past local attempt
  const handleReviewLocalAttempt = (attempt: LocalAttemptRecord) => {
    const matchingExam = localExams.find((e) => e.id === attempt.examId);
    const loadedExam: ExamData | null =
      attempt.examSnapshot ||
      (matchingExam
        ? {
            id: matchingExam.id,
            title: matchingExam.examPayload.title || matchingExam.title,
            parts: matchingExam.examPayload.parts || [],
          }
        : null);

    if (!loadedExam || !loadedExam.parts?.length) {
      setLocalStatusMsg('The original exam data for this attempt is unavailable.');
      return;
    }

    setExamData(loadedExam);
    setCurrentExamLocalId(loadedExam.id);
    setUserAnswers(attempt.userAnswers || {});
    setReviewFlags({});
    setSavedPassageHtml(attempt.savedPassageHtml || {});
    setNotesRegistry(attempt.notesRegistry || {});
    setLastTimeSpent(attempt.timeSpentSeconds || 0);
    setIsTimerRunning(false);

    const firstPartId = loadedExam.parts[0]?.id || 1;
    setCurrentPart(firstPartId);
    setCurrentQuestionId(loadedExam.parts[0]?.questions?.[0]?.id || 1);
    setHasStartedExam(true);
    setHasSubmittedExam(true);
    setIsSetupOpen(false);
    setIsResultModalOpen(true);
  };

  // Switch Part
  const switchPart = (partId: number) => {
    syncCurrentPassageDomToState();
    setCurrentPart(partId);
    const partObj = examData?.parts.find((p) => p.id === partId);
    if (partObj?.questions?.length) {
      setCurrentQuestionId(partObj.questions[0].id);
    }
  };

  // Jump to question
  const jumpToQuestion = (qId: number, partId?: number) => {
    setCurrentQuestionId(qId);
    const targetPart =
      partId ||
      examData?.parts.find((p) => p.questions.some((q) => q.id === qId))?.id ||
      (qId <= 13 ? 1 : qId <= 26 ? 2 : 3);
    if (currentPart !== targetPart) {
      syncCurrentPassageDomToState();
      setCurrentPart(targetPart);
    }
    setTimeout(() => {
      const card = document.getElementById(`q-card-${qId}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  };

  // Step Previous / Next Question (1..40) like real Inspera arrows
  const stepQuestion = (direction: -1 | 1) => {
    if (!allQuestionsList.length) return;
    const idx = allQuestionsList.findIndex((item) => item.id === currentQuestionId);
    const nextIdx = idx === -1 ? 0 : Math.min(allQuestionsList.length - 1, Math.max(0, idx + direction));
    const target = allQuestionsList[nextIdx];
    if (target) {
      jumpToQuestion(target.id, target.partId);
    }
  };

  // Save user answer for a question
  const handleSaveAnswer = (qId: number, value: string) => {
    setCurrentQuestionId(qId);
    setUserAnswers((prev) => ({
      ...prev,
      [String(qId)]: value,
    }));
  };

  // Submit & Auto-Grade Test (persisted locally in IndexedDB)
  const handleSubmitAndGrade = async () => {
    setIsTimerRunning(false);
    const latestPassageHtml = syncCurrentPassageDomToState();
    const mergedPassageHtml = {
      ...savedPassageHtml,
      ...(latestPassageHtml ? { [String(currentPart)]: latestPassageHtml } : {}),
    };

    const elapsed = isUntimed ? timerSeconds : Math.max(0, initialTimerSeconds - timerSeconds);
    setLastTimeSpent(elapsed);
    setHasSubmittedExam(true);
    setIsResultModalOpen(true);

    if (examData) {
      try {
        const allKeys: Record<string, string> = {};
        const allQs: number[] = [];
        examData.parts.forEach((p) => {
          Object.assign(allKeys, p.answers || {});
          p.questions.forEach((q) => allQs.push(q.id));
        });
        const hasKeys = Object.keys(allKeys).length > 0;
        let correctCount = 0;
        allQs.forEach((id) => {
          const uAns = userAnswers[String(id)] || '';
          const cAns = allKeys[String(id)] || '';
          if (hasKeys && checkIsAnswerCorrect(uAns, cAns)) {
            correctCount++;
          }
        });
        const totalQCount = allQs.length || 40;
        const band = hasKeys ? calculateIeltsBand(correctCount) : 0;

        await saveLocalAttempt({
          exam: examData,
          examId: currentExamLocalId,
          score: hasKeys ? correctCount : Object.keys(userAnswers).length,
          totalQuestions: totalQCount,
          bandScore: band,
          timeSpentSeconds: elapsed,
          userAnswers,
          notesRegistry,
          savedPassageHtml: mergedPassageHtml,
        });
        await refreshLocalData();
        setLocalStatusMsg('✓ Saved to Local History & Achievements');
      } catch (err) {
        console.warn('Could not save attempt to local storage:', err);
      }
    }
  };

  // Format timer string
  const formatTime = (secs: number, prefix = '') => {
    const mins = Math.floor(Math.max(0, secs) / 60);
    const remSecs = Math.max(0, secs) % 60;
    return `${prefix}${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
  };

  // Apply inline timer adjustment
  const handleApplyTimerAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(adjustMinutesInput, 10);
    if (!isNaN(mins)) {
      if (mins <= 0) {
        setIsUntimed(true);
        setInitialTimerSeconds(0);
        setTimerSeconds(0);
      } else {
        setIsUntimed(false);
        setInitialTimerSeconds(mins * 60);
        setTimerSeconds(mins * 60);
      }
      setIsTimerRunning(true);
    }
    setShowTimeAdjustPopover(false);
  };

  // Compute all questions & grading stats for bottom bar & result modal
  const allQuestionsList: { id: number; partId: number }[] = [];
  const allAnswerKeys: Record<string, string> = {};
  if (examData?.parts) {
    examData.parts.forEach((p) => {
      Object.assign(allAnswerKeys, p.answers || {});
      p.questions.forEach((q) => {
        allQuestionsList.push({ id: q.id, partId: p.id });
      });
    });
  }
  const hasAnswerKeys = Object.keys(allAnswerKeys).length > 0;
  let totalCorrectCount = 0;
  allQuestionsList.forEach(({ id }) => {
    const uAns = userAnswers[String(id)] || '';
    const cAns = allAnswerKeys[String(id)] || '';
    if (hasAnswerKeys && checkIsAnswerCorrect(uAns, cAns)) {
      totalCorrectCount++;
    }
  });
  const totalQCount = allQuestionsList.length || 40;
  const calculatedBand = hasAnswerKeys ? calculateIeltsBand(totalCorrectCount) : 0;

  // Safe filename helper for exports
  const getSafeExportBaseName = () => {
    const rawTitle = examData?.title || 'IELTS-Reading-Test';
    const cleanTitle = rawTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    const datePart = new Date().toISOString().slice(0, 10);
    return `${cleanTitle || 'IELTS-Result'}-${datePart}`;
  };

  // Export Test Result as Official White-Black-Red PDF (.pdf)
  const handleExportResultPdf = () => {
    if (!examData) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;

    // 1. Top Black Header Bar with Red Bottom Border
    doc.setFillColor(17, 17, 17);
    doc.rect(0, 0, pageW, 20, 'F');
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 19.2, pageW, 1.2, 'F');

    // Red IELTS Badge
    doc.setFillColor(220, 38, 38);
    doc.roundedRect(10, 5, 18, 9, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('IELTS', 19, 11, { align: 'center' });

    // Header Title (Left)
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text('READING TEST RESULTS', 32, 11);

    // Centered Signature "nguinnguyn"
    doc.setFillColor(35, 35, 35);
    doc.roundedRect(pageW / 2 - 16, 5.5, 32, 8, 1.5, 1.5, 'F');
    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text('nguinnguyn', pageW / 2, 10.8, { align: 'center' });

    // Date on Right
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(200, 200, 200);
    doc.text(new Date().toLocaleString(), pageW - 10, 11, { align: 'right' });

    // 2. Test Title Banner
    const asciiTitle = (examData.title || 'IELTS Reading Test')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('OFFICIAL SCORE REPORT', 10, 28);

    doc.setTextColor(17, 17, 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(asciiTitle.slice(0, 75), 10, 35);

    // 3. 4 Summary KPI Boxes
    const boxY = 40;
    const boxH = 20;
    const gap = 4;
    const boxW = (pageW - 20 - gap * 3) / 4;
    const accuracyVal = hasAnswerKeys
      ? `${Math.round((totalCorrectCount / Math.max(1, totalQCount)) * 100)}%`
      : `${Math.round((Object.keys(userAnswers).length / Math.max(1, totalQCount)) * 100)}%`;

    const kpis = [
      {
        label: 'CORRECT ANSWERS',
        value: hasAnswerKeys
          ? `${totalCorrectCount} / ${totalQCount}`
          : `${Object.keys(userAnswers).length} / ${totalQCount}`,
        dark: false,
      },
      {
        label: 'IELTS BAND SCORE',
        value: hasAnswerKeys ? calculatedBand.toFixed(1) : 'N/A',
        dark: true,
      },
      {
        label: 'ACCURACY',
        value: accuracyVal,
        dark: false,
      },
      {
        label: 'TIME SPENT',
        value: formatTime(lastTimeSpent),
        dark: false,
      },
    ];

    kpis.forEach((kpi, idx) => {
      const x = 10 + idx * (boxW + gap);
      if (kpi.dark) {
        doc.setFillColor(17, 17, 17);
        doc.setDrawColor(220, 38, 38);
        doc.setLineWidth(0.6);
        doc.roundedRect(x, boxY, boxW, boxH, 2, 2, 'FD');
        doc.setTextColor(220, 38, 38);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(kpi.label, x + boxW / 2, boxY + 6.5, { align: 'center' });
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text(kpi.value, x + boxW / 2, boxY + 15.5, { align: 'center' });
      } else {
        doc.setFillColor(250, 250, 250);
        doc.setDrawColor(215, 215, 215);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, boxY, boxW, boxH, 2, 2, 'FD');
        doc.setTextColor(110, 110, 110);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(kpi.label, x + boxW / 2, boxY + 6.5, { align: 'center' });
        doc.setTextColor(17, 17, 17);
        doc.setFontSize(14);
        doc.text(kpi.value, x + boxW / 2, boxY + 15.5, { align: 'center' });
      }
    });

    // 4. 3-Column Part 1 / Part 2 / Part 3 Breakdown Table
    const colGap = 4;
    const colW = (pageW - 20 - colGap * 2) / 3;
    const startY = 66;

    examData.parts.slice(0, 3).forEach((part, pIdx) => {
      const colX = 10 + pIdx * (colW + colGap);
      const partQs = part.questions || [];
      const partCorrect = partQs.filter((q) => {
        const uAns = userAnswers[String(q.id)] || '';
        const cAns = allAnswerKeys[String(q.id)] || '';
        return hasAnswerKeys ? checkIsAnswerCorrect(uAns, cAns) : Boolean(uAns);
      }).length;
      const firstQ = partQs[0]?.id || 1;
      const lastQ = partQs[partQs.length - 1]?.id || partQs.length;

      // Part Column Header
      doc.setFillColor(17, 17, 17);
      doc.roundedRect(colX, startY, colW, 9, 1.5, 1.5, 'F');
      doc.setFillColor(220, 38, 38);
      doc.rect(colX, startY + 8.2, colW, 0.8, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`PART ${part.id} (Q${firstQ}-${lastQ})`, colX + 3, startY + 5.8);

      // Part Score Pill
      doc.setFillColor(220, 38, 38);
      doc.roundedRect(colX + colW - 16, startY + 2, 13.5, 5, 1, 1, 'F');
      doc.setFontSize(7.5);
      doc.text(`${partCorrect}/${partQs.length}`, colX + colW - 9.25, startY + 5.6, {
        align: 'center',
      });

      // Rows for questions in this Part
      let rowY = startY + 11.5;
      const rowH = 12.5;

      partQs.forEach((q) => {
        const id = q.id;
        const rawUser = (userAnswers[String(id)] || '(blank)')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const rawKey = (allAnswerKeys[String(id)] || 'N/A')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        const isOk = hasAnswerKeys
          ? checkIsAnswerCorrect(userAnswers[String(id)] || '', allAnswerKeys[String(id)] || '')
          : Boolean(userAnswers[String(id)]);

        if (isOk) {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(220, 220, 220);
        } else {
          doc.setFillColor(254, 242, 242);
          doc.setDrawColor(252, 165, 165);
        }
        doc.setLineWidth(0.25);
        doc.roundedRect(colX, rowY, colW, rowH, 1.2, 1.2, 'FD');

        // Question Number Square
        if (isOk) {
          doc.setFillColor(17, 17, 17);
        } else {
          doc.setFillColor(220, 38, 38);
        }
        doc.roundedRect(colX + 2, rowY + 2.5, 7.5, 7.5, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(String(id), colX + 5.75, rowY + 7.4, { align: 'center' });

        // User Answer & Key Text
        doc.setTextColor(90, 90, 90);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.text('You:', colX + 11.5, rowY + 5.2);
        doc.setTextColor(17, 17, 17);
        doc.setFont('helvetica', 'bold');
        doc.text(rawUser.slice(0, 22), colX + 18, rowY + 5.2);

        doc.setTextColor(90, 90, 90);
        doc.setFont('helvetica', 'normal');
        doc.text('Key:', colX + 11.5, rowY + 9.8);
        doc.setTextColor(17, 17, 17);
        doc.setFont('helvetica', 'bold');
        doc.text(rawKey.slice(0, 22), colX + 18, rowY + 9.8);

        // Status Badge on Right
        if (isOk) {
          doc.setFillColor(17, 17, 17);
        } else {
          doc.setFillColor(220, 38, 38);
        }
        doc.roundedRect(colX + colW - 11.5, rowY + 3.8, 9.5, 5, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.text(hasAnswerKeys ? (isOk ? 'OK' : 'X') : 'SAVED', colX + colW - 6.75, rowY + 7.2, {
          align: 'center',
        });

        rowY += rowH + 1.4;
      });
    });

    // Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text('IELTS Reading Simulator · nguinnguyn', pageW / 2, 290, { align: 'center' });

    doc.save(`${getSafeExportBaseName()}.pdf`);
  };

  // Export Test Result as Excel-compatible CSV (.csv)
  const handleExportResultCsv = () => {
    if (!examData) return;
    const escapeCsv = (val: string | number) => {
      const str = String(val ?? '');
      return `"${str.replace(/"/g, '""')}"`;
    };
    const accuracyVal = hasAnswerKeys
      ? `${Math.round((totalCorrectCount / Math.max(1, totalQCount)) * 100)}%`
      : `${Math.round((Object.keys(userAnswers).length / Math.max(1, totalQCount)) * 100)}%`;

    const rows: string[] = [
      [escapeCsv('IELTS Reading Official Score Report'), escapeCsv('nguinnguyn')].join(','),
      [escapeCsv('Test Title'), escapeCsv(examData.title)].join(','),
      [escapeCsv('Date'), escapeCsv(new Date().toLocaleString())].join(','),
      [
        escapeCsv('Correct Answers'),
        escapeCsv(
          hasAnswerKeys
            ? `${totalCorrectCount} / ${totalQCount}`
            : `${Object.keys(userAnswers).length} / ${totalQCount}`
        ),
      ].join(','),
      [
        escapeCsv('IELTS Band Score'),
        escapeCsv(hasAnswerKeys ? calculatedBand.toFixed(1) : 'N/A'),
      ].join(','),
      [escapeCsv('Accuracy'), escapeCsv(accuracyVal)].join(','),
      [escapeCsv('Time Spent'), escapeCsv(formatTime(lastTimeSpent))].join(','),
      '',
      [
        escapeCsv('Part'),
        escapeCsv('Question'),
        escapeCsv('Your Answer'),
        escapeCsv('Answer Key'),
        escapeCsv('Result'),
      ].join(','),
    ];

    allQuestionsList.forEach(({ id, partId }) => {
      const uAns = userAnswers[String(id)] || '';
      const cAns = allAnswerKeys[String(id)] || '';
      const isOk = hasAnswerKeys ? checkIsAnswerCorrect(uAns, cAns) : Boolean(uAns);
      rows.push(
        [
          escapeCsv(`Part ${partId}`),
          escapeCsv(id),
          escapeCsv(uAns || '(blank)'),
          escapeCsv(hasAnswerKeys ? cAns || 'N/A' : 'N/A'),
          escapeCsv(hasAnswerKeys ? (isOk ? 'CORRECT' : 'INCORRECT') : 'SAVED'),
        ].join(',')
      );
    });

    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getSafeExportBaseName()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Test Result as Clean Text Report (.txt)
  const handleExportResultTxt = () => {
    if (!examData) return;
    const accuracyVal = hasAnswerKeys
      ? `${Math.round((totalCorrectCount / Math.max(1, totalQCount)) * 100)}%`
      : `${Math.round((Object.keys(userAnswers).length / Math.max(1, totalQCount)) * 100)}%`;

    const lines: string[] = [
      '============================================================',
      '        IELTS READING OFFICIAL SCORE REPORT (nguinnguyn)    ',
      '============================================================',
      `Test Title      : ${examData.title}`,
      `Date            : ${new Date().toLocaleString()}`,
      `Correct Answers : ${
        hasAnswerKeys
          ? `${totalCorrectCount} / ${totalQCount}`
          : `${Object.keys(userAnswers).length} / ${totalQCount}`
      }`,
      `IELTS Band      : ${hasAnswerKeys ? calculatedBand.toFixed(1) : 'N/A'}`,
      `Accuracy        : ${accuracyVal}`,
      `Time Spent      : ${formatTime(lastTimeSpent)}`,
      '============================================================',
      '',
    ];

    examData.parts.forEach((part) => {
      const partQs = part.questions || [];
      const partCorrect = partQs.filter((q) => {
        const uAns = userAnswers[String(q.id)] || '';
        const cAns = allAnswerKeys[String(q.id)] || '';
        return hasAnswerKeys ? checkIsAnswerCorrect(uAns, cAns) : Boolean(uAns);
      }).length;
      lines.push(`--- PART ${part.id} (${partCorrect} / ${partQs.length}) ---`);
      partQs.forEach((q) => {
        const id = q.id;
        const uAns = userAnswers[String(id)] || '(blank)';
        const cAns = allAnswerKeys[String(id)] || 'N/A';
        const isOk = hasAnswerKeys
          ? checkIsAnswerCorrect(userAnswers[String(id)] || '', allAnswerKeys[String(id)] || '')
          : Boolean(userAnswers[String(id)]);
        const statusStr = hasAnswerKeys ? (isOk ? '[✓ CORRECT]' : '[✗ WRONG]') : '[SAVED]';
        lines.push(
          `Q${String(id).padEnd(2, ' ')} | You: ${uAns.padEnd(20, ' ')} | Key: ${cAns.padEnd(
            20,
            ' '
          )} | ${statusStr}`
        );
      });
      lines.push('');
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getSafeExportBaseName()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Compute Local Achievements Summary
  const totalAttemptsCount = localAttempts.length;
  const bestBandScore =
    totalAttemptsCount > 0
      ? Math.max(...localAttempts.map((a) => Number(a.bandScore || 0)))
      : 0;
  const avgBandScore =
    totalAttemptsCount > 0
      ? localAttempts.reduce((acc, a) => acc + Number(a.bandScore || 0), 0) / totalAttemptsCount
      : 0;
  const avgAccuracyPct =
    totalAttemptsCount > 0
      ? Math.round(
          (localAttempts.reduce(
            (acc, a) => acc + (a.totalQuestions ? a.score / a.totalQuestions : 0),
            0
          ) /
            totalAttemptsCount) *
            100
        )
      : 0;

  // Render structured Inspera Question Group Banner (only bold titles; instructions & items are regular weight)
  const renderGroupBanner = (rawGroupTitle: string, groupQType?: ExamQuestion['type']) => {
    const rawLines = rawGroupTitle
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (rawLines.length === 0) return null;

    const headerLine = /^Questions?\s+\d/i.test(rawLines[0]) ? rawLines[0] : null;
    const headerRangeMatch = headerLine?.match(/Questions?\s+(\d{1,2}\s*[\-–—toand&]+\s*\d{1,2})/i);
    const actualRangeStr = headerRangeMatch ? headerRangeMatch[1].replace(/\s+/g, '') : null;

    const contentLines = headerLine ? rawLines.slice(1) : rawLines;

    const instructionLines: string[] = [];
    let boxTitle: string | null = null;
    const boxItems: { key: string; text: string }[] = [];

    for (const line of contentLines) {
      const normalizedLine =
        actualRangeStr && /in boxes\s+1[\-–—]7\b/i.test(line)
          ? line.replace(/1[\-–—]7/, actualRangeStr)
          : line;

      if (/^List of\s+/i.test(normalizedLine)) {
        boxTitle = normalizedLine;
        continue;
      }

      const romanItem = normalizedLine.match(
        /^(i{1,3}|iv|v|vi{1,3}|ix|x|xi{1,2})[.):\s]\s*(.+)$/i
      );
      if (romanItem && !/^(?:in|is|it|if|into|its)\b/i.test(normalizedLine)) {
        boxItems.push({
          key: romanItem[1].toLowerCase(),
          text: romanItem[2].replace(/^[.\-–—•●○▪■◦]+\s*/, '').trim(),
        });
        continue;
      }

      const letterItem = normalizedLine.match(/^([A-K])[.):\s]\s*(.+)$/);
      if (
        letterItem &&
        (boxTitle ||
          boxItems.length > 0 ||
          !/^(?:A\s+new|A\s+few|A\s+single|A\s+French|A\s+genetic)\b/.test(normalizedLine))
      ) {
        boxItems.push({
          key: letterItem[1].toUpperCase(),
          text: letterItem[2].replace(/^[.\-–—•●○▪■◦]+\s*/, '').trim(),
        });
        continue;
      }

      instructionLines.push(normalizedLine.replace(/^[•●○▪■◦.\-–—]+\s*/, '').trim());
    }

    const isCompactWordBank =
      boxItems.length >= 3 &&
      !/^(?:i|ii|iii|iv|v)$/i.test(boxItems[0].key) &&
      boxItems.every((it) => it.text.length <= 32);

    const tfngRubric =
      groupQType === 'tfng'
        ? [
            { label: 'TRUE', desc: 'if the statement agrees with the information' },
            { label: 'FALSE', desc: 'if the statement contradicts the information' },
            { label: 'NOT GIVEN', desc: 'if there is no information on this' },
          ]
        : groupQType === 'yes_no'
        ? [
            { label: 'YES', desc: 'if the statement agrees with the claims of the writer' },
            { label: 'NO', desc: 'if the statement contradicts the claims of the writer' },
            { label: 'NOT GIVEN', desc: 'if it is impossible to say what the writer thinks about this' },
          ]
        : null;

    return (
      <div className="group-banner rounded-lg border border-neutral-300 bg-white text-neutral-900 overflow-hidden shadow-2xs font-normal">
        {headerLine && (
          <div className="px-4 py-2.5 bg-[#111111] text-white flex items-center justify-between border-b-2 border-[#dc2626]">
            <span className="font-bold tracking-tight">{headerLine}</span>
            <span className="text-[11px] font-mono-tabular font-normal text-neutral-300">
              Official Instructions
            </span>
          </div>
        )}

        <div className="p-4 space-y-3 bg-neutral-50/70 font-normal">
          {instructionLines.length > 0 && (
            <div className="space-y-1.5 font-normal text-neutral-800 leading-relaxed">
              {instructionLines.map((inst, idx) => (
                <p key={idx} className="leading-relaxed font-normal">
                  {inst}
                </p>
              ))}
            </div>
          )}

          {tfngRubric && (
            <div className="rounded-lg border border-neutral-200 bg-white divide-y divide-neutral-100 overflow-hidden font-normal">
              {tfngRubric.map((row) => (
                <div key={row.label} className="px-3.5 py-2 flex items-baseline gap-4 font-normal">
                  <span className="w-28 shrink-0 font-mono-tabular font-normal text-[#dc2626]">
                    {row.label}
                  </span>
                  <span className="text-neutral-700 font-normal">{row.desc}</span>
                </div>
              ))}
            </div>
          )}

          {(boxTitle || boxItems.length > 0) && (
            <div className="mt-2.5 rounded-lg border border-neutral-200 bg-white text-neutral-900 overflow-hidden font-normal">
              {boxTitle && (
                <div className="px-4 py-2 bg-neutral-100 border-b border-neutral-200 font-bold text-neutral-900 text-center tracking-tight">
                  {boxTitle}
                </div>
              )}
              <div
                className={
                  isCompactWordBank
                    ? 'p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 font-normal'
                    : 'divide-y divide-neutral-100 font-normal'
                }
              >
                {boxItems.map((item, idx) => (
                  <div
                    key={`${item.key}_${idx}`}
                    className={
                      isCompactWordBank
                        ? 'px-2.5 py-1.5 rounded-md border border-neutral-200 bg-neutral-50/60 flex items-center gap-2.5 hover:border-[#dc2626] transition-colors font-normal'
                        : 'px-3.5 py-2 flex items-baseline gap-3 hover:bg-neutral-50 transition-colors font-normal'
                    }
                  >
                    <span className="inline-flex items-center justify-center min-w-[1.85rem] px-1.5 py-0.5 rounded bg-[#111111] text-white font-mono-tabular font-normal text-center shrink-0">
                      {item.key}
                    </span>
                    <span className="font-normal text-neutral-800 leading-snug">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render an individual question card (all stems, options, and inputs use uniform font-normal; no leading dots/bullets)
  const renderQuestionCard = (q: ExamQuestion) => {
    const qKey = String(q.id);
    const currentVal = userAnswers[qKey] || '';
    const cleanPrompt = q.prompt
      .replace(new RegExp(`^${q.id}[.):]?\\s*`), '')
      .replace(/[•●○▪■◦↓]+/g, ' ')
      .replace(/^[.\-–—:]+\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    const isActive = currentQuestionId === q.id;
    const inlineSelectMarker = `[${q.id}] ______`;
    const hasInlineSelect = q.type === 'select' && cleanPrompt.includes(inlineSelectMarker);

    return (
      <React.Fragment key={q.id}>
        {q.groupTitle && renderGroupBanner(q.groupTitle, q.type)}
        <div
          id={`q-card-${q.id}`}
          onClick={() => setCurrentQuestionId(q.id)}
          className={`q-card p-4 border rounded-lg space-y-3 transition-all bg-white text-neutral-900 font-normal ${
            isActive
              ? 'active-q border-[#dc2626] ring-2 ring-[#dc2626]/15 shadow-xs'
              : 'border-neutral-200 hover:border-neutral-300'
          }`}
        >
          {q.type === 'fill' ? (
            <div className="font-normal leading-relaxed flex items-start">
              <span
                className={`q-badge inline-flex items-center justify-center px-2 mr-3 font-bold rounded-md border shrink-0 font-mono-tabular mt-0.5 ${
                  isActive
                    ? 'bg-[#dc2626] text-white border-[#dc2626]'
                    : 'bg-neutral-100 text-neutral-900 border-neutral-300'
                }`}
              >
                {q.id}
              </span>
              <div className="flex-1 leading-relaxed font-normal">
                {cleanPrompt.split('________').map((segment, idx, arr) => (
                  <React.Fragment key={idx}>
                    <span className="font-normal">{segment}</span>
                    {idx < arr.length - 1 && (
                      <input
                        type="text"
                        value={currentVal}
                        placeholder={`Question ${q.id}`}
                        onChange={(e) => handleSaveAnswer(q.id, e.target.value)}
                        spellCheck={false}
                        autoComplete="off"
                        className="q-input inline-block px-3 border border-neutral-300 rounded-md font-normal w-44 mx-1.5 bg-neutral-50 text-neutral-900 focus:bg-white focus:border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/20 focus:outline-none text-center align-baseline transition-all"
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ) : hasInlineSelect ? (
            <div className="font-normal leading-relaxed flex items-start">
              <span
                className={`q-badge inline-flex items-center justify-center px-2 mr-3 font-bold rounded-md border shrink-0 font-mono-tabular mt-0.5 ${
                  isActive
                    ? 'bg-[#dc2626] text-white border-[#dc2626]'
                    : 'bg-neutral-100 text-neutral-900 border-neutral-300'
                }`}
              >
                {q.id}
              </span>
              <div className="flex-1 leading-relaxed font-normal">
                {cleanPrompt.split(inlineSelectMarker).map((segment, idx, arr) => (
                  <React.Fragment key={idx}>
                    <span className="font-normal">{segment}</span>
                    {idx < arr.length - 1 && (
                      <select
                        value={currentVal}
                        onChange={(e) => handleSaveAnswer(q.id, e.target.value)}
                        className="q-select inline-block px-2.5 mx-1.5 border border-[#dc2626] rounded-md font-normal bg-red-50/40 text-neutral-900 focus:bg-white focus:border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/20 focus:outline-none cursor-pointer align-baseline"
                      >
                        <option value="">[{q.id}] Select</option>
                        {(q.options || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ) : q.type === 'tfng' || q.type === 'yes_no' ? (
            <>
              <div className="font-normal leading-relaxed flex items-start">
                <span
                  className={`q-badge inline-flex items-center justify-center px-2 mr-3 font-bold rounded-md border shrink-0 font-mono-tabular mt-0.5 ${
                    isActive
                      ? 'bg-[#dc2626] text-white border-[#dc2626]'
                      : 'bg-neutral-100 text-neutral-900 border-neutral-300'
                  }`}
                >
                  {q.id}
                </span>
                <span className="flex-1 font-normal">{cleanPrompt}</span>
              </div>
              <div className="pt-1 pl-10 grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-md font-normal">
                {(q.type === 'tfng'
                  ? ['TRUE', 'FALSE', 'NOT GIVEN']
                  : ['YES', 'NO', 'NOT GIVEN']
                ).map((opt) => {
                  const selected = currentVal === opt;
                  return (
                    <label
                      key={opt}
                      className={`flex items-center justify-center gap-2 cursor-pointer font-normal px-3 py-1.5 rounded-md border text-center transition-all ${
                        selected
                          ? 'bg-[#dc2626] border-[#dc2626] text-white shadow-2xs'
                          : 'border-neutral-200 bg-neutral-50 hover:border-neutral-400 text-neutral-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        value={opt}
                        checked={selected}
                        onChange={() => handleSaveAnswer(q.id, opt)}
                        className="accent-white cursor-pointer shrink-0"
                      />
                      <span className="whitespace-nowrap font-normal">{opt}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : q.type === 'mcq' ? (
            <>
              <div className="font-normal leading-relaxed flex items-start">
                <span
                  className={`q-badge inline-flex items-center justify-center px-2 mr-3 font-bold rounded-md border shrink-0 font-mono-tabular mt-0.5 ${
                    isActive
                      ? 'bg-[#dc2626] text-white border-[#dc2626]'
                      : 'bg-neutral-100 text-neutral-900 border-neutral-300'
                  }`}
                >
                  {q.id}
                </span>
                <span className="flex-1 font-normal">{cleanPrompt}</span>
              </div>
              <div className="space-y-1.5 pt-1 pl-10 font-normal">
                {(q.options || ['A', 'B', 'C', 'D']).map((opt) => {
                  const letter = opt.trim().charAt(0).toUpperCase();
                  const cleanOptText = opt
                    .trim()
                    .replace(/^([A-D])[.):]\s*/, '$1 ')
                    .replace(/[•●○▪■◦]+/g, '');
                  const selected = currentVal === letter;
                  return (
                    <label
                      key={opt}
                      className={`flex items-start space-x-2.5 cursor-pointer py-2 px-3 rounded-md border font-normal transition-all ${
                        selected
                          ? 'bg-red-50/70 border-[#dc2626] text-neutral-950 font-normal'
                          : 'border-neutral-200 hover:bg-neutral-50 font-normal text-neutral-900'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q_${q.id}`}
                        value={letter}
                        checked={selected}
                        onChange={() => handleSaveAnswer(q.id, letter)}
                        className="mt-1 accent-[#dc2626] cursor-pointer shrink-0"
                      />
                      <span className="flex-1 font-normal">{cleanOptText}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-4 font-normal">
              <div className="font-normal leading-relaxed flex items-start flex-1 min-w-0">
                <span
                  className={`q-badge inline-flex items-center justify-center px-2 mr-3 font-bold rounded-md border shrink-0 font-mono-tabular mt-0.5 ${
                    isActive
                      ? 'bg-[#dc2626] text-white border-[#dc2626]'
                      : 'bg-neutral-100 text-neutral-900 border-neutral-300'
                  }`}
                >
                  {q.id}
                </span>
                <span className="flex-1 font-normal">{cleanPrompt}</span>
              </div>
              <select
                value={currentVal}
                onChange={(e) => handleSaveAnswer(q.id, e.target.value)}
                className="q-select w-32 px-3 border border-neutral-300 rounded-md font-normal bg-neutral-50 text-neutral-900 shrink-0 focus:bg-white focus:border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/20 focus:outline-none cursor-pointer text-center"
              >
                <option value="">Select</option>
                {(q.options || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </React.Fragment>
    );
  };

  const totalAnsweredCount = Object.values(userAnswers).filter(
    (v) => v && String(v).trim() !== ''
  ).length;

  return (
    <div className="h-screen flex flex-col overflow-hidden select-none">
      {/* SCREEN 1: PDF UPLOAD, 20 SAMPLE TESTS, LOCAL LIBRARY & ACHIEVEMENTS MODAL (WHITE - BLACK - RED THEME) */}
      {isSetupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 overflow-y-auto">
          <div className="bg-white text-neutral-900 rounded-xl shadow-2xl max-w-3xl w-full p-6 border border-neutral-300 my-auto">
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-neutral-200 mb-5">
              <div className="flex items-center gap-3.5">
                <div className="bg-[#dc2626] text-white font-black text-base tracking-tighter px-2.5 py-1 rounded select-none">
                  IELTS
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight">
                    IELTS on Computer — Official Reading Simulator
                  </h1>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    3 Passages · 40 Questions · Full Caps Lock Grading · Local Browser Storage
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-neutral-600">
                  <HardDrive className="w-3.5 h-3.5 text-[#dc2626]" />
                  <span>Local Storage</span>
                </div>

                {hasStartedExam && (
                  <button
                    type="button"
                    onClick={() => setIsSetupOpen(false)}
                    className="h-9 px-3.5 text-xs font-bold text-white bg-[#111111] hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors"
                  >
                    Return to Test
                  </button>
                )}
              </div>
            </div>

            {/* Segmented Mode Switcher */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-neutral-100 rounded-lg mb-5 border border-neutral-200">
              <button
                type="button"
                onClick={() => setSetupTab('upload')}
                className={`h-9 px-3 text-xs font-bold rounded-md inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  setupTab === 'upload'
                    ? 'bg-[#111111] text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload PDF
              </button>
              <button
                type="button"
                onClick={() => setSetupTab('samples')}
                className={`h-9 px-3 text-xs font-bold rounded-md inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  setupTab === 'samples'
                    ? 'bg-[#111111] text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Library className="w-3.5 h-3.5" />
                Sample Tests (20)
              </button>
              <button
                type="button"
                onClick={() => setSetupTab('library')}
                className={`h-9 px-3 text-xs font-bold rounded-md inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  setupTab === 'library'
                    ? 'bg-[#111111] text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Saved Library ({localExams.length})
              </button>
              <button
                type="button"
                onClick={() => setSetupTab('history')}
                className={`h-9 px-3 text-xs font-bold rounded-md inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  setupTab === 'history'
                    ? 'bg-[#111111] text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                Achievements ({localAttempts.length})
              </button>
            </div>

            {/* Uniform Min-Height Tab Body Container */}
            <div className="min-h-[360px] flex flex-col justify-between">
              {setupTab === 'upload' && (
                <div className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-neutral-800">
                          1. Upload IELTS Reading PDF
                        </label>
                        <span className="text-[11px] text-neutral-600 font-medium inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-[#dc2626]" />
                          40/40 Question & Answer Key Scanner
                        </span>
                      </div>
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingOver(true);
                        }}
                        onDragLeave={() => setIsDraggingOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                          isDraggingOver
                            ? 'border-[#dc2626] bg-red-50/40'
                            : 'border-neutral-300 bg-neutral-50 hover:border-[#dc2626]'
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                        <Upload className="w-7 h-7 text-[#dc2626] mx-auto mb-2" />
                        <p className="text-sm font-bold text-neutral-900">{selectedFileName}</p>
                        <p className="text-xs text-neutral-500 mt-1">
                          Automatically extracts Passages 1–3, Questions 1–40, and Answer Keys
                        </p>
                      </div>

                      {parseStatus && (
                        <div
                          className={`mt-2.5 text-xs font-medium rounded-lg px-3.5 py-2.5 border flex items-center justify-between gap-2 ${
                            parseStatus.type === 'info'
                              ? 'bg-neutral-100 text-neutral-800 border-neutral-300'
                              : parseStatus.type === 'success'
                              ? 'bg-neutral-900 text-white border-neutral-900'
                              : 'bg-red-50 text-[#dc2626] border-red-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {parseStatus.type === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#dc2626]" />
                            ) : parseStatus.type === 'error' ? (
                              <AlertCircle className="w-4 h-4 shrink-0 text-[#dc2626]" />
                            ) : (
                              <Clock className="w-4 h-4 shrink-0 animate-spin text-[#dc2626]" />
                            )}
                            <span>{parseStatus.message}</span>
                          </div>
                          {examData && !isScanning && (
                            <button
                              type="button"
                              onClick={() => setShowKeyEditor((v) => !v)}
                              className="h-7 px-2.5 bg-white hover:bg-neutral-100 text-neutral-900 border border-neutral-300 rounded-md text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3 text-[#dc2626]" />
                              {showKeyEditor ? 'Hide Key Tool' : 'Paste / Edit Keys'}
                            </button>
                          )}
                        </div>
                      )}

                      {examData && showKeyEditor && (
                        <div className="mt-2.5 p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-800">
                              Paste Answer Key Text (1–40 in any English, Vietnamese, or table format)
                            </span>
                            <span className="text-[11px] text-neutral-500 font-mono-tabular">
                              Current keys: {countTotalKeys(examData)} / {countTotalQuestions(examData)}
                            </span>
                          </div>
                          <textarea
                            rows={3}
                            value={rawKeyInputText}
                            onChange={(e) => setRawKeyInputText(e.target.value)}
                            placeholder="Example: 1. TRUE  2. FALSE  14. iv  19 & 20. B, D  or  Câu 1: TRUE..."
                            className="w-full p-2 text-xs border border-neutral-300 rounded-md bg-white text-neutral-900 focus:ring-2 focus:ring-[#dc2626] focus:outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setShowKeyEditor(false)}
                              className="h-8 px-3 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleApplyPastedKeys}
                              className="h-8 px-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold rounded-md cursor-pointer"
                            >
                              Apply Answer Keys
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step 2: Timer Configuration */}
                    <div>
                      <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                        2. Set Exam Timer
                      </label>
                      <div className="grid grid-cols-4 gap-2 mb-2.5">
                        {[
                          { mins: 20, label: '20 mins' },
                          { mins: 40, label: '40 mins' },
                          { mins: 60, label: '60 mins (Standard)' },
                          { mins: 0, label: 'Untimed' },
                        ].map((preset) => (
                          <button
                            key={preset.mins}
                            type="button"
                            onClick={() => {
                              setTimerPreset(preset.mins);
                              setCustomMinutes(preset.mins);
                            }}
                            className={`h-9 text-xs font-bold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              timerPreset === preset.mins
                                ? 'border-[#dc2626] bg-[#dc2626] text-white'
                                : 'border-neutral-300 hover:bg-neutral-100 text-neutral-800'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-neutral-600">Custom (minutes):</span>
                        <input
                          type="number"
                          value={customMinutes}
                          min={0}
                          max={240}
                          onChange={(e) => {
                            setTimerPreset(null);
                            setCustomMinutes(parseInt(e.target.value || '0', 10));
                          }}
                          className="h-8 w-20 px-2.5 border border-neutral-300 rounded-md text-xs font-bold text-neutral-900 font-mono-tabular focus:border-[#dc2626] focus:outline-none"
                        />
                        <span className="text-[11px] text-neutral-400">(0 = Untimed)</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!examData || isScanning}
                    onClick={() => startExam()}
                    className={`w-full h-10 font-bold text-sm rounded-lg transition-all ${
                      examData && !isScanning
                        ? 'bg-[#dc2626] hover:bg-[#b91c1c] text-white shadow-xs cursor-pointer'
                        : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    }`}
                  >
                    {isScanning
                      ? 'Scanning & Structuring PDF...'
                      : examData
                      ? `Start "${examData.title}"`
                      : 'Upload a PDF or Choose a Sample Test'}
                  </button>
                </div>
              )}

              {setupTab === 'samples' && (
                <div className="space-y-3 flex-1 flex flex-col">
                  <div className="flex items-center justify-between text-xs text-neutral-600 pb-1">
                    <span>
                      20 Full IELTS Academic Reading Tests · 3 Passages · 40 Questions · 40 Keys
                    </span>
                    <span className="font-mono-tabular font-bold text-neutral-900">
                      Timer: {customMinutes > 0 ? `${customMinutes}m` : 'Untimed'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {BUILT_IN_SAMPLE_PDFS.map((sample) => {
                      const isBusy = loadingSampleId === sample.id;
                      return (
                        <div
                          key={sample.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:border-[#dc2626] bg-neutral-50/70 gap-3 transition-colors"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-neutral-900 truncate flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-[#dc2626] shrink-0" />
                              <span>{sample.title}</span>
                            </div>
                            <div
                              className="text-[11px] text-neutral-500 truncate mt-0.5"
                              title={sample.subtitle}
                            >
                              {sample.subtitle}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={Boolean(loadingSampleId)}
                            onClick={() => handleSelectBuiltInSample(sample, true)}
                            className="h-8 px-3 bg-[#dc2626] hover:bg-[#b91c1c] disabled:bg-neutral-300 text-white text-xs font-bold rounded-md inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                          >
                            <Play className="w-3 h-3" />
                            {isBusy ? 'Loading...' : 'Start'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {setupTab === 'library' && (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 flex-1">
                  {localExams.length === 0 ? (
                    <div className="h-[320px] flex items-center justify-center text-center px-6 text-xs text-neutral-500 bg-neutral-50 rounded-lg border border-neutral-200">
                      No exams saved in your local browser library yet. Upload a PDF or open any Sample Test to save it automatically.
                    </div>
                  ) : (
                    localExams.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:border-[#dc2626] bg-neutral-50/70 gap-3 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-neutral-900 truncate flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-[#dc2626] shrink-0" />
                            <span>{item.title}</span>
                          </div>
                          <div className="text-[11px] text-neutral-500 mt-0.5 font-mono-tabular">
                            <span>{item.partCount} Passages</span>
                            <span className="mx-1.5">·</span>
                            <span>{item.questionCount} Questions</span>
                            <span className="mx-1.5">·</span>
                            <span className="text-[#dc2626] font-bold">
                              {item.keyCount} Keys
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              startExam(
                                {
                                  id: item.id,
                                  title: item.examPayload.title || item.title,
                                  parts: item.examPayload.parts || [],
                                },
                                item.id
                              )
                            }
                            className="h-8 px-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold rounded-md inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3 h-3" />
                            Start Test
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteLocalExam(item.id);
                              await refreshLocalData();
                            }}
                            className="h-8 w-8 inline-flex items-center justify-center text-neutral-400 hover:text-[#dc2626] rounded-md border border-transparent hover:border-red-200 cursor-pointer"
                            title="Delete saved exam"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {setupTab === 'history' && (
                <div className="space-y-4 flex-1 flex flex-col">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-center">
                      <div className="text-[11px] font-bold text-neutral-500">Tests Completed</div>
                      <div className="text-xl font-extrabold text-neutral-900 mt-0.5 font-mono-tabular">
                        {totalAttemptsCount}
                      </div>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-center">
                      <div className="text-[11px] font-bold text-neutral-500">Best Band Score</div>
                      <div className="text-xl font-extrabold text-[#dc2626] mt-0.5 font-mono-tabular">
                        {totalAttemptsCount > 0 ? bestBandScore.toFixed(1) : '—'}
                      </div>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-center">
                      <div className="text-[11px] font-bold text-neutral-500">Average Band</div>
                      <div className="text-xl font-extrabold text-neutral-900 mt-0.5 font-mono-tabular">
                        {totalAttemptsCount > 0 ? avgBandScore.toFixed(1) : '—'}
                      </div>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-center">
                      <div className="text-[11px] font-bold text-neutral-500">Avg. Accuracy</div>
                      <div className="text-xl font-extrabold text-[#dc2626] mt-0.5 font-mono-tabular">
                        {totalAttemptsCount > 0 ? `${avgAccuracyPct}%` : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-[240px] overflow-y-auto pr-1 flex-1">
                    {localAttempts.length === 0 ? (
                      <div className="h-[220px] flex items-center justify-center text-center px-6 text-xs text-neutral-500 bg-neutral-50 rounded-lg border border-neutral-200">
                        No test attempts recorded yet. Complete and submit a test to track your IELTS Band progress and review highlights locally.
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[11px] text-neutral-500 px-1">
                          <span>Saved locally on this browser</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await clearAllLocalHistory();
                              await refreshLocalData();
                            }}
                            className="text-[#dc2626] hover:underline font-bold cursor-pointer"
                          >
                            Clear All History
                          </button>
                        </div>
                        {localAttempts.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center justify-between p-3 rounded-lg border border-neutral-200 hover:border-[#dc2626] bg-neutral-50/70 gap-3"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-neutral-900 truncate">
                                {att.examTitle}
                              </div>
                              <div className="text-[11px] text-neutral-500 mt-0.5 font-mono-tabular">
                                <span className="font-bold text-[#dc2626]">
                                  Band {Number(att.bandScore || 0).toFixed(1)}
                                </span>
                                <span className="mx-1.5">·</span>
                                <span>
                                  Score: {att.score} / {att.totalQuestions}
                                </span>
                                <span className="mx-1.5">·</span>
                                <span>Time: {formatTime(att.timeSpentSeconds || 0)}</span>
                                {att.createdAt && (
                                  <>
                                    <span className="mx-1.5">·</span>
                                    <span>{new Date(att.createdAt).toLocaleDateString()}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleReviewLocalAttempt(att)}
                                className="h-8 px-3 bg-[#111111] hover:bg-neutral-800 text-white text-xs font-bold rounded-md inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <Eye className="w-3 h-3" />
                                Review
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteLocalAttempt(att.id);
                                  await refreshLocalData();
                                }}
                                className="h-8 w-8 inline-flex items-center justify-center text-neutral-400 hover:text-[#dc2626] rounded-md border border-transparent hover:border-red-200 cursor-pointer"
                                title="Delete attempt"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Centered Signature Footer in Setup Modal */}
            <div className="mt-5 pt-3.5 border-t border-neutral-200 flex items-center justify-center">
              <span className="px-3 py-0.5 rounded bg-[#111111] text-white text-xs font-bold tracking-widest font-mono-tabular">
                nguinnguyn
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 2: OFFICIAL INSPERA IELTS ON COMPUTER WORKSPACE (WHITE - BLACK - RED) */}
      {hasStartedExam && examData && !isResultModalOpen && (
        <div className="flex flex-col h-screen">
          {/* OFFICIAL INSPERA 3-COLUMN BALANCED TOP HEADER BAR */}
          <header className="h-12 bg-[#111111] text-white px-4 flex items-center justify-between border-b border-neutral-800 shrink-0 z-20 gap-3">
            {/* Left Zone (flex-1): Official IELTS Badge & Test Title */}
            <div className="flex-1 flex items-center justify-start gap-3 min-w-0">
              <div className="bg-[#dc2626] text-white font-black text-sm tracking-tighter px-2.5 py-0.5 rounded select-none shrink-0">
                IELTS
              </div>
              <div className="hidden md:flex items-center gap-2 text-xs text-neutral-300 truncate">
                <span className="font-bold text-white truncate max-w-[220px]">
                  {examData.title}
                </span>
                <span className="text-neutral-600">·</span>
                <span className="text-[11px] font-mono-tabular font-normal text-neutral-300">
                  nguinnguyn
                </span>
              </div>
            </div>

            {/* Center Zone (shrink-0): Perfectly Centered Clock & Countdown */}
            <div className="flex items-center justify-center gap-1.5 relative shrink-0">
              {isTimerVisible ? (
                <button
                  type="button"
                  onClick={() => setShowMinutesOnlyMode((v) => !v)}
                  title="Click to switch between exact MM:SS and minutes remaining"
                  className={`h-8 inline-flex items-center gap-1.5 px-3 rounded-md text-xs font-bold cursor-pointer transition-colors ${
                    !isUntimed && timerSeconds <= 300
                      ? 'bg-[#dc2626] text-white border border-red-400'
                      : 'bg-neutral-900 text-white border border-neutral-700 hover:border-[#dc2626]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0 text-[#dc2626]" />
                  <span className="font-mono-tabular text-xs sm:text-sm">
                    {isUntimed
                      ? formatTime(timerSeconds, 'Elapsed ')
                      : showMinutesOnlyMode
                      ? `${Math.ceil(timerSeconds / 60)} mins left`
                      : `${formatTime(timerSeconds)} left`}
                  </span>
                </button>
              ) : (
                <span className="h-8 inline-flex items-center text-xs text-neutral-400 italic px-2.5 bg-neutral-900 rounded-md border border-neutral-800">
                  Timer hidden
                </span>
              )}

              <button
                type="button"
                onClick={() => setIsTimerVisible((v) => !v)}
                className="h-8 text-xs text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 px-2.5 rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title={isTimerVisible ? 'Hide Timer' : 'Show Timer'}
              >
                {isTimerVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span className="hidden xl:inline">{isTimerVisible ? 'Hide' : 'Show'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAdjustMinutesInput(String(Math.ceil(timerSeconds / 60)));
                  setShowTimeAdjustPopover((v) => !v);
                }}
                className="h-8 text-xs text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 px-2.5 rounded-md whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                Set Time
              </button>

              {showTimeAdjustPopover && (
                <form
                  onSubmit={handleApplyTimerAdjustment}
                  className="absolute top-10 left-1/2 -translate-x-1/2 z-50 bg-[#111111] border border-neutral-700 rounded-lg shadow-xl p-3 flex items-center space-x-2 text-xs text-white w-64"
                >
                  <label className="whitespace-nowrap text-neutral-300">Mins (0=Untimed):</label>
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={adjustMinutesInput}
                    onChange={(e) => setAdjustMinutesInput(e.target.value)}
                    className="h-8 w-16 px-2 bg-black border border-neutral-700 rounded-md text-white font-bold font-mono-tabular"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="h-8 px-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold rounded-md cursor-pointer"
                  >
                    Save
                  </button>
                </form>
              )}
            </div>

            {/* Right Zone (flex-1): Uniform h-8 Control Group */}
            <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
              {/* Quick Direct Font-Size Resizer Bar */}
              <div
                className="h-8 flex items-center bg-neutral-900 border border-neutral-700 rounded-md overflow-hidden shrink-0"
                title="Adjust exam text size (Passage & Questions)"
              >
                <button
                  type="button"
                  onClick={() => adjustFontSize(-2)}
                  disabled={fontSizePx <= 12}
                  className="h-full px-2 text-xs font-bold text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
                  title="Decrease font size (A-)"
                >
                  A-
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(true)}
                  className="h-full px-2 text-[11px] font-mono-tabular font-bold text-white hover:bg-neutral-800 border-x border-neutral-700 cursor-pointer"
                  title="Click for Display & Font Settings"
                >
                  {fontSizePx}px
                </button>
                <button
                  type="button"
                  onClick={() => adjustFontSize(2)}
                  disabled={fontSizePx >= 28}
                  className="h-full px-2 text-xs font-bold text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
                  title="Increase font size (A+)"
                >
                  A+
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(true)}
                className="h-8 px-2.5 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium rounded-md border border-neutral-700 text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="Settings (Text Size & Colour Scheme)"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Settings</span>
              </button>

              <button
                type="button"
                onClick={() => setIsHelpModalOpen(true)}
                className="h-8 px-2.5 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium rounded-md border border-neutral-700 text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="IELTS Reading Help & Instructions"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Help</span>
              </button>

              <button
                type="button"
                onClick={() => setIsScreenHidden(true)}
                className="h-8 px-2.5 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium rounded-md border border-neutral-700 text-white hidden lg:inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="Hide screen temporarily"
              >
                <span>Hide</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNotesDrawerOpen((v) => !v)}
                className="h-8 px-2.5 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium rounded-md border border-neutral-700 text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <StickyNote className="w-3.5 h-3.5 text-[#dc2626]" />
                <span className="hidden md:inline">Notes</span>
                <span className="font-mono-tabular text-neutral-300">
                  ({Object.keys(notesRegistry).length})
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsSetupOpen(true)}
                className="h-8 px-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs font-medium rounded-md text-white whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                Tests
              </button>

              {hasSubmittedExam && (
                <button
                  type="button"
                  onClick={() => setIsResultModalOpen(true)}
                  className="h-8 px-3 bg-white hover:bg-neutral-200 text-[#111111] font-bold text-xs rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  title="Go to Test Results Page"
                >
                  <span>Results</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSubmitAndGrade}
                className="h-8 px-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs rounded-md inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer shadow-2xs transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Submit</span>
              </button>
            </div>
          </header>

          {/* OFFICIAL INSPERA 3-COLUMN BALANCED SUB-HEADER BANNER */}
          <div className="inspera-subheader h-10 bg-neutral-100 border-b border-neutral-300 px-5 flex items-center justify-between gap-3 text-neutral-900 shrink-0">
            <div className="flex-1 flex items-center justify-start gap-2.5 min-w-0">
              <span className="font-bold text-xs sm:text-sm tracking-tight whitespace-nowrap text-neutral-900">
                Part {activePartObj?.id}
              </span>
              <span className="text-neutral-400">·</span>
              <span className="text-xs sm:text-sm font-normal text-neutral-800 truncate">
                Read the text below and answer{' '}
                {(activePartObj?.instructions || `Questions 1–13`).replace(
                  /^Questions\s+/i,
                  'questions '
                )}
                .
              </span>
            </div>

            {/* Perfectly Centered nguinnguyn Signature */}
            <div className="flex items-center justify-center shrink-0">
              <span className="px-3 py-0.5 rounded bg-[#111111] text-white text-xs font-mono-tabular font-bold tracking-widest border border-[#dc2626]/50">
                nguinnguyn
              </span>
            </div>

            <div className="flex-1 flex items-center justify-end gap-3 text-xs text-neutral-700 min-w-0">
              <span className="font-mono-tabular font-normal text-neutral-800 whitespace-nowrap">
                Answered: {totalAnsweredCount} / {totalQCount}
              </span>
              <span className="hidden lg:inline text-neutral-400">·</span>
              <span className="hidden lg:inline truncate font-normal">
                Select text to Highlight or add Notes
              </span>
            </div>
          </div>

          {/* SPLIT-PANE WORKSPACE (WITH INSPERA CENTER GRAB HANDLE) */}
          <div ref={splitPaneRef} className="split-pane flex-1 relative">
            {/* Left Pane: Reading Passage */}
            <div
              style={{ width: `${leftPaneWidthPct}%` }}
              className="pane border-r border-neutral-300 bg-white select-text"
            >
              <div className="pb-3.5 mb-5 border-b border-neutral-200">
                <div className="text-[11px] font-mono-tabular font-bold text-[#dc2626] uppercase tracking-wider mb-1">
                  Reading Passage {activePartObj?.id}
                </div>
                <h2 className="passage-title font-bold text-neutral-950">{activePartObj?.title}</h2>
              </div>
              <div
                ref={passageContentRef}
                className="passage-prose leading-relaxed space-y-4 font-normal"
              />
            </div>

            {/* Official Inspera Divider & Center Grab Handle */}
            <div
              onMouseDown={() => setIsResizing(true)}
              onDoubleClick={() => setLeftPaneWidthPct(50)}
              className={`resizer ${isResizing ? 'active' : ''}`}
              title="Drag left/right to resize panes (Double-click to reset 50/50)"
            >
              <div className="resizer-handle">◄►</div>
            </div>

            {/* Right Pane: Questions */}
            <div
              ref={rightPaneRef}
              style={{ width: `${100 - leftPaneWidthPct}%` }}
              className="pane questions-pane bg-[#f5f5f5] select-text font-normal"
            >
              <div className="space-y-3.5">
                {activePartObj?.questions.map((q) => renderQuestionCard(q))}
              </div>
            </div>

            {/* Notes Drawer */}
            {isNotesDrawerOpen && (
              <div className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l border-neutral-300 shadow-xl z-30 flex flex-col text-neutral-900">
                <div className="px-4 py-3 bg-[#111111] text-white border-b border-neutral-800 flex items-center justify-between">
                  <span className="font-bold text-xs">Highlights & Notes</span>
                  <button
                    type="button"
                    onClick={() => setIsNotesDrawerOpen(false)}
                    className="text-neutral-400 hover:text-white font-bold text-base leading-none cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
                <div className="p-3 overflow-y-auto flex-1 space-y-2 text-xs">
                  {Object.entries(notesRegistry).length === 0 ? (
                    <p className="text-neutral-400 text-center py-6">
                      Select any text in the passage to highlight or add a sticky note.
                    </p>
                  ) : (
                    Object.entries(notesRegistry).map(([id, item]) => (
                      <div
                        key={id}
                        onClick={() => jumpToHighlight(id, item.partId)}
                        className="p-2.5 rounded-lg border border-neutral-200 hover:border-[#dc2626] cursor-pointer space-y-1 bg-neutral-50"
                      >
                        <div className="flex items-center justify-between text-[10px] font-bold text-neutral-500">
                          <span>PART {item.partId}</span>
                          <span className={`px-1.5 py-0.5 rounded ${item.color}`}>Highlight</span>
                        </div>
                        <div className="italic text-neutral-700 line-clamp-2">"{item.text}"</div>
                        {item.note && (
                          <div className="font-normal text-[#dc2626] pt-1">Note: {item.note}</div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* OFFICIAL INSPERA 3-COLUMN SYMMETRIC BOTTOM PALETTE BAR */}
          <footer className="h-14 bg-[#111111] text-white px-4 flex items-center justify-between border-t border-neutral-800 shrink-0 gap-3 z-20">
            {/* Left Zone (w-28): Review Flag Checkbox */}
            <div className="w-28 shrink-0 flex items-center justify-start">
              <label
                className="h-9 inline-flex items-center space-x-2 cursor-pointer px-3 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs font-bold text-white select-none transition-colors"
                title="Flag current question for review"
              >
                <input
                  type="checkbox"
                  checked={!!reviewFlags[currentQuestionId]}
                  onChange={(e) =>
                    setReviewFlags((prev) => ({
                      ...prev,
                      [currentQuestionId]: e.target.checked,
                    }))
                  }
                  className="rounded accent-[#dc2626] cursor-pointer w-3.5 h-3.5"
                />
                <span>Review</span>
              </label>
            </div>

            {/* Center Zone (flex-1): Centered Part 1 / Part 2 / Part 3 Question Palette */}
            <div className="flex items-center justify-center space-x-2.5 overflow-x-auto py-1 flex-1">
              {examData.parts.map((part) => {
                const isPartActive = part.id === currentPart;
                const partAnsweredCount = part.questions.filter((q) => {
                  const v = userAnswers[String(q.id)];
                  return v && String(v).trim() !== '';
                }).length;

                return (
                  <div
                    key={part.id}
                    className={`flex items-center space-x-1.5 px-2 py-1 rounded-md border transition-colors shrink-0 ${
                      isPartActive
                        ? 'bg-neutral-900 border-neutral-600'
                        : 'bg-black/60 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => switchPart(part.id)}
                      className={`h-6 text-xs font-bold px-2 rounded cursor-pointer whitespace-nowrap inline-flex items-center transition-colors ${
                        isPartActive
                          ? 'bg-[#dc2626] text-white'
                          : 'text-neutral-300 hover:text-white'
                      }`}
                    >
                      <span>Part {part.id}</span>
                      {!isPartActive && (
                        <span className="ml-1.5 text-[11px] font-mono-tabular text-neutral-400 font-normal">
                          {partAnsweredCount}/{part.questions.length}
                        </span>
                      )}
                    </button>

                    <div className="flex items-center space-x-1">
                      {part.questions.map((q) => {
                        const answered =
                          userAnswers[String(q.id)] &&
                          String(userAnswers[String(q.id)]).trim() !== '';
                        const reviewed = !!reviewFlags[q.id];
                        const isCurrent = q.id === currentQuestionId;

                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => jumpToQuestion(q.id, part.id)}
                            className={`nav-q-btn cursor-pointer ${
                              answered ? 'answered' : ''
                            } ${reviewed ? 'reviewed' : ''} ${isCurrent ? 'current' : ''}`}
                            title={`Question ${q.id}${answered ? ' (Answered)' : ''}${
                              reviewed ? ' (Flagged for Review)' : ''
                            }`}
                          >
                            {q.id}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Zone (w-28): Previous / Next Question Arrows */}
            <div className="w-28 shrink-0 flex items-center justify-end space-x-1.5">
              <button
                type="button"
                onClick={() => stepQuestion(-1)}
                disabled={currentQuestionId <= 1}
                className="w-9 h-9 rounded-md bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 border border-neutral-700 flex items-center justify-center text-white cursor-pointer transition-colors"
                title="Previous Question"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => stepQuestion(1)}
                disabled={currentQuestionId >= totalQCount}
                className="w-9 h-9 rounded-md bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-40 border border-[#dc2626] flex items-center justify-center text-white cursor-pointer transition-colors"
                title="Next Question"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </footer>
        </div>
      )}

      {/* OFFICIAL INSPERA DISPLAY SETTINGS MODAL (FONT SIZE & CONTRAST THEME) */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white text-neutral-900 rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-neutral-300">
            <div className="px-5 py-3.5 bg-[#111111] text-white flex items-center justify-between border-b-2 border-[#dc2626]">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#dc2626]" />
                <h3 className="text-sm font-bold">Options — Text Size & Colour Scheme</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-neutral-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs">
              {/* 1. Text Size Selection */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-neutral-900 text-sm">
                    1. Text Size (Chỉnh cỡ chữ bài đọc & câu hỏi)
                  </label>
                  <span className="px-2 py-0.5 bg-[#dc2626] text-white font-mono-tabular font-bold rounded">
                    {fontSizePx}px
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-1.5">
                  {FONT_SIZE_PRESETS.map((preset) => {
                    const active = fontSizePx === preset.px;
                    return (
                      <button
                        key={preset.px}
                        type="button"
                        onClick={() => setFontSizePx(preset.px)}
                        className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#dc2626] text-white border-[#dc2626] font-bold'
                            : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-800 border-neutral-200 font-normal'
                        }`}
                      >
                        <span style={{ fontSize: `${Math.min(20, preset.px)}px` }}>
                          {preset.label} — {preset.viLabel}
                        </span>
                        <span className="font-mono-tabular text-xs opacity-80">{preset.px}px</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Slider for Fine-Tuning (12px - 28px) */}
                <div className="pt-2 bg-neutral-50 p-3 rounded-lg border border-neutral-200 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-neutral-600">
                    <span>Fine-tune slider (Tùy chỉnh từng cỡ 12px – 28px):</span>
                    <span className="font-mono-tabular font-bold text-neutral-900">{fontSizePx}px</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-neutral-500">A-</span>
                    <input
                      type="range"
                      min={12}
                      max={28}
                      step={1}
                      value={fontSizePx}
                      onChange={(e) => setFontSizePx(Number(e.target.value))}
                      className="flex-1 accent-[#dc2626] cursor-pointer"
                    />
                    <span className="text-base font-extrabold text-neutral-900">A+</span>
                  </div>
                </div>
              </div>

              {/* 2. Contrast / Colour Scheme */}
              <div className="space-y-2">
                <label className="block font-bold text-neutral-900 text-sm">
                  2. Colour Scheme (Màu nền tương phản chuẩn thi thật)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      id: 'default' as ContrastTheme,
                      label: 'Black on White',
                      preview: 'bg-white text-neutral-900 border-neutral-300',
                    },
                    {
                      id: 'dark' as ContrastTheme,
                      label: 'White on Black',
                      preview: 'bg-black text-white border-neutral-700',
                    },
                    {
                      id: 'yellow' as ContrastTheme,
                      label: 'Yellow on Black',
                      preview: 'bg-black text-[#ffff00] border-yellow-600',
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTheme(item.id)}
                      className={`p-3 rounded-lg border-2 text-center font-bold cursor-pointer transition-all ${
                        item.preview
                      } ${
                        theme === item.id ? 'ring-2 ring-[#dc2626] ring-offset-1' : 'opacity-80'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-neutral-100 border-t border-neutral-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-1.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs rounded cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL INSPERA HELP MODAL */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white text-neutral-900 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-neutral-300">
            <div className="px-5 py-3.5 bg-[#111111] text-white flex items-center justify-between border-b-2 border-[#dc2626]">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#dc2626]" />
                <h3 className="text-sm font-bold">IELTS on Computer — Reading Test Help</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="text-neutral-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs leading-relaxed text-neutral-700">
              <p>
                <b>1. Navigation & Parts:</b> Click on any question number (1–40) at the bottom of the screen or use the <b>← / →</b> arrows in the bottom-right corner to move between questions.
              </p>
              <p>
                <b>2. Highlighting & Notes:</b> Drag your mouse over any text in the left reading passage to highlight it in 5 colours or attach a sticky note. Click an existing highlight to edit or remove it.
              </p>
              <p>
                <b>3. Text Size & Contrast:</b> Use the <b>A- / A+</b> buttons on the top bar or open <b>Settings</b> to scale the text size (from 12px to 28px) and switch between Black on White, White on Black, and Yellow on Black.
              </p>
              <p>
                <b>4. CAPS LOCK & Spelling:</b> Just like the official IELTS test, you may type your gap-fill answers in <b>ALL CAPS (FULL CAPS LOCK)</b> or lowercase. Both British and American English spellings are accepted.
              </p>
            </div>
            <div className="px-5 py-3 bg-neutral-100 border-t border-neutral-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsHelpModalOpen(false)}
                className="px-4 py-1.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs rounded cursor-pointer"
              >
                Close Help
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL INSPERA "HIDE SCREEN" OVERLAY */}
      {isScreenHidden && (
        <div className="fixed inset-0 z-50 bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="bg-[#dc2626] text-white font-black text-lg tracking-tighter px-3 py-1 rounded-xs">
            IELTS
          </div>
          <h2 className="text-lg font-bold">Your test screen is currently hidden</h2>
          <p className="text-xs text-neutral-400 max-w-md">
            Please note that the exam clock continues to run while your screen is hidden. Click the button below to return to your test.
          </p>
          <button
            type="button"
            onClick={() => setIsScreenHidden(false)}
            className="px-5 py-2 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-sm rounded-lg cursor-pointer shadow-lg"
          >
            Resume Test
          </button>
        </div>
      )}

      {/* 5-COLOR SELECTION HIGHLIGHT / NOTE TOOLBAR */}
      {floatToolbarPos && (
        <div
          ref={floatToolbarRef}
          style={{ top: floatToolbarPos.y, left: floatToolbarPos.x }}
          className="fixed z-50 bg-[#111111] text-white rounded-lg shadow-xl px-2.5 py-1.5 flex items-center space-x-1.5 text-xs border border-neutral-700"
        >
          <button
            type="button"
            onClick={() => applyHighlight('hl-yellow')}
            className="w-4 h-4 rounded-full bg-yellow-300 border border-white/40 hover:scale-110 transition-transform cursor-pointer"
            title="Yellow"
          />
          <button
            type="button"
            onClick={() => applyHighlight('hl-green')}
            className="w-4 h-4 rounded-full bg-green-300 border border-white/40 hover:scale-110 transition-transform cursor-pointer"
            title="Green"
          />
          <button
            type="button"
            onClick={() => applyHighlight('hl-blue')}
            className="w-4 h-4 rounded-full bg-blue-300 border border-white/40 hover:scale-110 transition-transform cursor-pointer"
            title="Blue"
          />
          <button
            type="button"
            onClick={() => applyHighlight('hl-pink')}
            className="w-4 h-4 rounded-full bg-pink-300 border border-white/40 hover:scale-110 transition-transform cursor-pointer"
            title="Pink"
          />
          <button
            type="button"
            onClick={() => applyHighlight('hl-orange')}
            className="w-4 h-4 rounded-full bg-orange-300 border border-white/40 hover:scale-110 transition-transform cursor-pointer"
            title="Orange"
          />
          <span className="text-neutral-600 pl-1">|</span>
          <button
            type="button"
            onClick={() => applyHighlight('hl-yellow', true)}
            className="hover:text-[#dc2626] font-bold px-1 cursor-pointer whitespace-nowrap"
          >
            + Note
          </button>
        </div>
      )}

      {/* HIGHLIGHT / STICKY NOTE EDITOR POPOVER */}
      {notePopoverState && (
        <div
          ref={notePopoverRef}
          style={{ top: notePopoverState.y, left: notePopoverState.x }}
          className="fixed z-50 bg-white text-neutral-900 rounded-lg shadow-2xl border border-neutral-300 w-72 p-3 space-y-2.5 text-xs"
        >
          <div className="flex items-center justify-between border-b border-neutral-100 pb-1.5">
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => changeActiveHighlightColor('hl-yellow')}
                className="w-4 h-4 rounded-full bg-yellow-300 border border-neutral-400 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => changeActiveHighlightColor('hl-green')}
                className="w-4 h-4 rounded-full bg-green-300 border border-neutral-400 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => changeActiveHighlightColor('hl-blue')}
                className="w-4 h-4 rounded-full bg-blue-300 border border-neutral-400 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => changeActiveHighlightColor('hl-pink')}
                className="w-4 h-4 rounded-full bg-pink-300 border border-neutral-400 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => changeActiveHighlightColor('hl-orange')}
                className="w-4 h-4 rounded-full bg-orange-300 border border-neutral-400 cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={() => setNotePopoverState(null)}
              className="text-neutral-400 hover:text-neutral-900 font-bold text-sm cursor-pointer"
            >
              &times;
            </button>
          </div>
          <textarea
            rows={3}
            value={notePopoverState.noteText}
            onChange={(e) =>
              setNotePopoverState((prev) =>
                prev ? { ...prev, noteText: e.target.value } : null
              )
            }
            placeholder="Write a note for this highlight..."
            className="w-full p-2 border border-neutral-300 rounded text-xs focus:ring-2 focus:ring-[#dc2626] focus:outline-none text-neutral-900 bg-white"
          />
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={removeActiveHighlight}
              className="text-[#dc2626] hover:underline font-bold cursor-pointer"
            >
              Remove Highlight
            </button>
            <button
              type="button"
              onClick={saveActiveNote}
              className="px-3 py-1 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold rounded cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 3: DEDICATED FULL-PAGE TEST RESULTS (WHITE - BLACK - RED) */}
      {isResultModalOpen && examData && (
        <div className="flex flex-col h-screen bg-[#f5f5f5] text-neutral-900 overflow-hidden">
          {/* Official 3-Column Top Header Bar */}
          <header className="h-12 bg-[#111111] text-white px-4 flex items-center justify-between border-b-2 border-[#dc2626] shrink-0 z-20 gap-3">
            {/* Left Zone: IELTS Badge + Test Results Title */}
            <div className="flex-1 flex items-center justify-start gap-3 min-w-0">
              <div className="bg-[#dc2626] text-white font-black text-sm tracking-tighter px-2.5 py-0.5 rounded select-none shrink-0">
                IELTS
              </div>
              <div className="flex items-center gap-2 text-xs truncate">
                <span className="font-bold text-white uppercase tracking-wider">Test Results</span>
                <span className="text-neutral-600">·</span>
                <span className="text-neutral-300 truncate max-w-[260px]">{examData.title}</span>
              </div>
            </div>

            {/* Center Zone: Centered Signature */}
            <div className="flex items-center justify-center shrink-0">
              <span className="px-3 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-white text-xs font-bold tracking-widest font-mono-tabular">
                nguinnguyn
              </span>
            </div>

            {/* Right Zone: Navigation & Export Actions */}
            <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
              <button
                type="button"
                onClick={handleExportResultPdf}
                className="h-8 px-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-md text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                title="Export Test Results as PDF (.pdf)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setShowKeyEditor((v) => !v)}
                className="h-8 px-3 bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-700 rounded-md text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#dc2626]" />
                <span className="hidden md:inline">
                  {showKeyEditor ? 'Hide Key Importer' : 'Import / Edit Key'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsResultModalOpen(false);
                  setIsSetupOpen(true);
                }}
                className="h-8 px-3 bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-700 rounded-md text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <span className="hidden sm:inline">Tests / History</span>
              </button>
              <button
                type="button"
                onClick={() => setIsResultModalOpen(false)}
                className="h-8 px-3.5 bg-white hover:bg-neutral-200 text-[#111111] font-bold text-xs rounded-md inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Review in Test View</span>
              </button>
            </div>
          </header>

          {/* Full-Page Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-6xl mx-auto space-y-6 pb-10">
              {/* Top Title, Export Controls & Status Banner */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#dc2626] mb-1">
                    <span>Official Score Report</span>
                    {localStatusMsg && (
                      <span className="text-neutral-500 font-normal normal-case">
                        · {localStatusMsg}
                      </span>
                    )}
                  </div>
                  <h1 className="text-xl font-bold text-neutral-900">{examData.title}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Export File Buttons (.pdf, .csv, .txt) */}
                  <button
                    type="button"
                    onClick={handleExportResultPdf}
                    className="h-9 px-3.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Download Official Score Report as PDF (.pdf)"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export PDF (.pdf)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportResultCsv}
                    className="h-9 px-3.5 bg-white hover:bg-neutral-100 text-[#111111] border border-neutral-300 font-bold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Download Score Report as Excel / CSV (.csv)"
                  >
                    <Download className="w-3.5 h-3.5 text-[#dc2626]" />
                    <span>Excel / CSV (.csv)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportResultTxt}
                    className="h-9 px-3.5 bg-white hover:bg-neutral-100 text-[#111111] border border-neutral-300 font-bold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Download Score Report as Text (.txt)"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#111111]" />
                    <span>Text (.txt)</span>
                  </button>

                  <div className="h-5 w-px bg-neutral-200 mx-0.5 hidden sm:block" />

                  <button
                    type="button"
                    onClick={() => setIsResultModalOpen(false)}
                    className="h-9 px-3.5 bg-[#111111] hover:bg-neutral-800 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back to Passages</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsResultModalOpen(false);
                      setIsSetupOpen(true);
                    }}
                    className="h-9 px-3.5 bg-neutral-100 hover:bg-neutral-200 text-[#111111] border border-neutral-300 font-bold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>Other Tests</span>
                  </button>
                </div>
              </div>

              {/* 4 KPI Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-neutral-200 rounded-xl p-4 text-center shadow-xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Correct Answers
                  </div>
                  <div className="text-3xl font-extrabold text-neutral-900 mt-1.5 font-mono-tabular">
                    {hasAnswerKeys
                      ? `${totalCorrectCount} / ${totalQCount}`
                      : `${Object.keys(userAnswers).length} / ${totalQCount}`}
                  </div>
                </div>
                <div className="bg-[#111111] border-2 border-[#dc2626] rounded-xl p-4 text-center shadow-xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#dc2626]">
                    IELTS Band Score
                  </div>
                  <div className="text-3xl font-extrabold text-white mt-1.5 font-mono-tabular">
                    {hasAnswerKeys ? calculatedBand.toFixed(1) : 'N/A'}
                  </div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-4 text-center shadow-xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Accuracy
                  </div>
                  <div className="text-3xl font-extrabold text-neutral-900 mt-1.5 font-mono-tabular">
                    {hasAnswerKeys
                      ? `${Math.round((totalCorrectCount / Math.max(1, totalQCount)) * 100)}%`
                      : `${Math.round((Object.keys(userAnswers).length / Math.max(1, totalQCount)) * 100)}%`}
                  </div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-4 text-center shadow-xs">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Time Spent
                  </div>
                  <div className="text-3xl font-extrabold text-neutral-900 mt-1.5 font-mono-tabular">
                    {formatTime(lastTimeSpent)}
                  </div>
                </div>
              </div>

              {/* Collapsible Answer Key Importer / Editor */}
              {showKeyEditor && (
                <div className="p-4 bg-white border-2 border-[#111111] rounded-xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                      Paste Answer Key Text (supports 1–40 in any English, Vietnamese, or multi-column table format)
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowKeyEditor(false)}
                      className="text-xs font-bold text-neutral-500 hover:text-neutral-900 cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={rawKeyInputText}
                    onChange={(e) => setRawKeyInputText(e.target.value)}
                    placeholder="Paste answer keys here (e.g. 1. TRUE  2. FALSE  14. iv  19 & 20. B, D  or  Câu 1: TRUE)..."
                    className="w-full p-3 text-xs border border-neutral-300 rounded-lg bg-neutral-50 text-neutral-900 focus:ring-2 focus:ring-[#dc2626] focus:outline-none font-mono-tabular"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowKeyEditor(false)}
                      className="px-3 py-1.5 text-xs font-bold text-neutral-600 hover:text-neutral-900 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyPastedKeys}
                      className="px-4 py-1.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Apply & Re-Grade Now
                    </button>
                  </div>
                </div>
              )}

              {/* Answer Sheet & Key Comparison Grouped by Part 1, Part 2, Part 3 */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
                    Answer Sheet & Key Comparison (Click any question to review in passage)
                  </h2>
                  {!hasAnswerKeys && (
                    <span className="text-xs text-[#dc2626] bg-red-50 border border-red-200 px-2.5 py-1 rounded font-bold">
                      No Answer Key found in PDF — click &quot;Import / Edit Key&quot; above to grade
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {examData.parts.map((part) => {
                    const partQuestions = part.questions || [];
                    const partCorrect = partQuestions.filter((q) => {
                      const uAns = userAnswers[String(q.id)] || '';
                      const cAns = allAnswerKeys[String(q.id)] || '';
                      return hasAnswerKeys ? checkIsAnswerCorrect(uAns, cAns) : Boolean(uAns);
                    }).length;
                    const firstQ = partQuestions[0]?.id || 1;
                    const lastQ = partQuestions[partQuestions.length - 1]?.id || partQuestions.length;

                    return (
                      <div
                        key={part.id}
                        className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs flex flex-col"
                      >
                        <div className="px-4 py-3 bg-[#111111] text-white border-b-2 border-[#dc2626] flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wider">
                              Part {part.id}
                            </span>
                            <span className="text-xs text-neutral-400 ml-2 font-mono-tabular">
                              (Questions {firstQ}–{lastQ})
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-[#dc2626] text-white text-xs font-bold font-mono-tabular">
                            {partCorrect} / {partQuestions.length}
                          </span>
                        </div>

                        <div className="p-3 space-y-2 flex-1">
                          {partQuestions.map((q) => {
                            const id = q.id;
                            const uAns = userAnswers[String(id)] || '';
                            const cAns = allAnswerKeys[String(id)] || '';
                            const isOk = hasAnswerKeys
                              ? checkIsAnswerCorrect(uAns, cAns)
                              : Boolean(uAns);

                            return (
                              <div
                                key={id}
                                onClick={() => {
                                  setIsResultModalOpen(false);
                                  jumpToQuestion(id, part.id);
                                }}
                                className={`cursor-pointer flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                                  isOk
                                    ? 'bg-white border-neutral-200 text-neutral-900 hover:border-[#111111]'
                                    : 'bg-red-50/60 border-red-200 text-neutral-900 hover:border-[#dc2626]'
                                }`}
                              >
                                <div className="flex items-center min-w-0 pr-2">
                                  <span
                                    className={`inline-flex items-center justify-center w-6 h-6 rounded text-white font-bold mr-2.5 shrink-0 font-mono-tabular ${
                                      isOk ? 'bg-[#111111]' : 'bg-[#dc2626]'
                                    }`}
                                  >
                                    {id}
                                  </span>
                                  <div className="truncate font-normal">
                                    <span className="text-neutral-500">You: </span>
                                    <span className="font-bold text-neutral-900">
                                      {uAns || '(blank)'}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {hasAnswerKeys && (
                                    <div className="font-normal text-right">
                                      <span className="text-neutral-500">Key: </span>
                                      <span className="font-bold text-neutral-900">
                                        {cAns || 'N/A'}
                                      </span>
                                    </div>
                                  )}
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                                      isOk
                                        ? 'bg-[#111111] text-white'
                                        : 'bg-[#dc2626] text-white'
                                    }`}
                                  >
                                    {hasAnswerKeys ? (isOk ? '✓' : '✗') : 'SAVED'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
