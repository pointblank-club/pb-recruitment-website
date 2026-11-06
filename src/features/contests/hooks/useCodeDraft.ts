import { useState, useEffect, useRef, useCallback } from 'react';

interface CodeDraft {
  selectedLanguage: string;
  codeByLanguage: Record<string, string>;
  customInput?: string;
}

interface UseCodeDraftOptions {
  contestId: string;
  problemId: string;
  userId?: string;
  defaultTemplates: Record<string, string>;
  defaultLanguage?: string;
  defaultInput?: string;
  enabled?: boolean;
}

interface UseCodeDraftResult {
  selectedLanguage: string;
  setSelectedLanguage: React.Dispatch<React.SetStateAction<string>>;
  codeByLanguage: Record<string, string>;
  setCodeByLanguage: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  customInput: string;
  setCustomInput: React.Dispatch<React.SetStateAction<string>>;
}

export const useCodeDraft = ({
  contestId,
  problemId,
  userId = 'anonymous',
  defaultTemplates,
  defaultLanguage = 'cpp',
  defaultInput = '',
  enabled = true,
}: UseCodeDraftOptions): UseCodeDraftResult => {
  const storageKey = `contest_code_draft_${userId}_${contestId}_${problemId}`;

  // Helper to load draft safely from localStorage
  const loadSavedDraft = useCallback((): CodeDraft | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as CodeDraft;
    } catch {
      return null;
    }
  }, [storageKey]);

  // 1. Initialize states using saved draft if available, otherwise defaults
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    if (!enabled) return defaultLanguage;
    const draft = loadSavedDraft();
    return draft?.selectedLanguage && defaultTemplates[draft.selectedLanguage] !== undefined
      ? draft.selectedLanguage
      : defaultLanguage;
  });

  const [codeByLanguage, setCodeByLanguage] = useState<Record<string, string>>(() => {
    if (!enabled) return { ...defaultTemplates };
    const draft = loadSavedDraft();
    return {
      ...defaultTemplates,
      ...(draft?.codeByLanguage || {}),
    };
  });

  const [customInput, setCustomInput] = useState<string>(() => {
    if (!enabled) return defaultInput;
    const draft = loadSavedDraft();
    return typeof draft?.customInput === 'string' ? draft.customInput : defaultInput;
  });

  // Track the most recent values in a ref for synchronous flushing
  const latestDraftRef = useRef<CodeDraft>({
    selectedLanguage,
    codeByLanguage,
    customInput,
  });

  useEffect(() => {
    latestDraftRef.current = { selectedLanguage, codeByLanguage, customInput };
  }, [selectedLanguage, codeByLanguage, customInput]);

  // Sync state when storageKey changes (e.g. Firebase Auth finishes resolving userId)
  useEffect(() => {
    if (!enabled) return;
    const draft = loadSavedDraft();
    if (draft) {
      const lang =
        draft.selectedLanguage && defaultTemplates[draft.selectedLanguage] !== undefined
          ? draft.selectedLanguage
          : defaultLanguage;
      const codes = {
        ...defaultTemplates,
        ...(draft.codeByLanguage || {}),
      };
      const input = typeof draft.customInput === 'string' ? draft.customInput : defaultInput;

      latestDraftRef.current = {
        selectedLanguage: lang,
        codeByLanguage: codes,
        customInput: input,
      };

      setSelectedLanguage(lang);
      setCodeByLanguage(codes);
      setCustomInput(input);
    } else {
      latestDraftRef.current = {
        selectedLanguage: defaultLanguage,
        codeByLanguage: { ...defaultTemplates },
        customInput: defaultInput,
      };
      setSelectedLanguage(defaultLanguage);
      setCodeByLanguage({ ...defaultTemplates });
      setCustomInput(defaultInput);
    }
  }, [storageKey, enabled, defaultLanguage, defaultTemplates, defaultInput, loadSavedDraft]);

  // Synchronous flush helper
  const flushDraftToStorage = useCallback(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(latestDraftRef.current));
    } catch {
      // Gracefully handle storage quota or privacy mode errors
    }
  }, [storageKey, enabled]);

  // Debounced auto-save during active typing (400ms delay)
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      flushDraftToStorage();
    }, 400);

    return () => clearTimeout(timer);
  }, [enabled, selectedLanguage, codeByLanguage, customInput, flushDraftToStorage]);

  // Flush on beforeunload and mobile visibilitychange (tab switch, minimize, lock)
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushDraftToStorage();
      }
    };

    window.addEventListener('beforeunload', flushDraftToStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      flushDraftToStorage();
      window.removeEventListener('beforeunload', flushDraftToStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, flushDraftToStorage]);

  return {
    selectedLanguage,
    setSelectedLanguage,
    codeByLanguage,
    setCodeByLanguage,
    customInput,
    setCustomInput,
  };
};
