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
}: UseCodeDraftOptions): UseCodeDraftResult => {
  const storageKey = `contest_code_draft_${userId}_${contestId}_${problemId}`;

  // Helper to load draft safely from localStorage
  const loadSavedDraft = (): CodeDraft | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      return JSON.parse(raw) as CodeDraft;
    } catch {
      return null;
    }
  };

  // 1. Initialize states using saved draft if available, otherwise defaults
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    const draft = loadSavedDraft();
    return draft?.selectedLanguage && defaultTemplates[draft.selectedLanguage] !== undefined
      ? draft.selectedLanguage
      : defaultLanguage;
  });

  const [codeByLanguage, setCodeByLanguage] = useState<Record<string, string>>(() => {
    const draft = loadSavedDraft();
    return {
      ...defaultTemplates,
      ...(draft?.codeByLanguage || {}),
    };
  });

  const [customInput, setCustomInput] = useState<string>(() => {
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

  // Synchronous flush helper
  const flushDraftToStorage = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(latestDraftRef.current));
    } catch {
      // Gracefully handle storage quota or privacy mode errors
    }
  }, [storageKey]);

  // Debounced auto-save during active typing (400ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      flushDraftToStorage();
    }, 400);

    return () => clearTimeout(timer);
  }, [selectedLanguage, codeByLanguage, customInput, flushDraftToStorage]);

  // Ensure state is flushed immediately if the user refreshes, closes tab, or component unmounts
  useEffect(() => {
    window.addEventListener('beforeunload', flushDraftToStorage);
    return () => {
      flushDraftToStorage();
      window.removeEventListener('beforeunload', flushDraftToStorage);
    };
  }, [flushDraftToStorage]);

  return {
    selectedLanguage,
    setSelectedLanguage,
    codeByLanguage,
    setCodeByLanguage,
    customInput,
    setCustomInput,
  };
};

