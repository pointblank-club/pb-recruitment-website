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

  // Helper to load draft safely from localStorage and validate runtime shape
  const loadSavedDraft = useCallback((): CodeDraft | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return null;

      const { selectedLanguage, codeByLanguage, customInput } = parsed as Record<string, unknown>;
      const codes: Record<string, string> = {};
      if (typeof codeByLanguage === 'object' && codeByLanguage !== null && !Array.isArray(codeByLanguage)) {
        for (const [lang, value] of Object.entries(codeByLanguage)) {
          if (typeof value === 'string' && Object.hasOwn(defaultTemplates, lang)) {
            codes[lang] = value;
          }
        }
      }

      return {
        selectedLanguage:
          typeof selectedLanguage === 'string' && Object.hasOwn(defaultTemplates, selectedLanguage)
            ? selectedLanguage
            : '',
        codeByLanguage: codes,
        customInput: typeof customInput === 'string' ? customInput : undefined,
      };
    } catch {
      return null;
    }
  }, [storageKey, defaultTemplates]);

  // 1. Initialize states using saved draft if available, otherwise defaults
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    if (!enabled) return defaultLanguage;
    const draft = loadSavedDraft();
    return draft?.selectedLanguage && Object.hasOwn(defaultTemplates, draft.selectedLanguage)
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
        draft.selectedLanguage && Object.hasOwn(defaultTemplates, draft.selectedLanguage)
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

  // Synchronous flush helper - only persists entries that differ from defaults
  const flushDraftToStorage = useCallback(() => {
    if (!enabled) return;
    try {
      const { selectedLanguage, codeByLanguage, customInput } = latestDraftRef.current;
      const changedCode = Object.fromEntries(
        Object.entries(codeByLanguage).filter(
          ([lang, code]) => Object.hasOwn(defaultTemplates, lang) && code !== defaultTemplates[lang],
        ),
      );
      const hasChangedCode = Object.keys(changedCode).length > 0;
      const hasChangedInput = customInput !== defaultInput;
      const hasChangedLang = selectedLanguage !== defaultLanguage;

      // If nothing has changed from defaults, remove redundant key from localStorage
      if (!hasChangedCode && !hasChangedInput && !hasChangedLang) {
        localStorage.removeItem(storageKey);
        return;
      }

      const draft: CodeDraft = {
        selectedLanguage,
        codeByLanguage: changedCode,
        customInput: hasChangedInput ? customInput : undefined,
      };
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      // Gracefully handle storage quota or privacy mode errors
    }
  }, [storageKey, enabled, defaultTemplates, defaultInput, defaultLanguage]);

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
