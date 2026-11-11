export const getContestSubmitted = (contestId: string, userId: string): boolean => {
  try {
    return localStorage.getItem(`contest_submitted_${contestId}_${userId}`) === 'true';
  } catch {
    return false;
  }
};

export const setContestSubmitted = (contestId: string, userId: string): void => {
  try {
    localStorage.setItem(`contest_submitted_${contestId}_${userId}`, 'true');
  } catch {
    // Ignore storage failure (e.g. disabled storage or private browsing)
  }
};

export const clearContestSubmitted = (contestId: string, userId: string): void => {
  try {
    localStorage.removeItem(`contest_submitted_${contestId}_${userId}`);
  } catch {
    // Ignore storage failure
  }
};

export const getProblemAttempted = (contestId: string, userId: string, problemId: string): boolean => {
  try {
    return localStorage.getItem(`contest_run_${contestId}_${userId}_${problemId}`) === 'true';
  } catch {
    return false;
  }
};

export const setProblemAttempted = (contestId: string, userId: string, problemId: string): void => {
  try {
    localStorage.setItem(`contest_run_${contestId}_${userId}_${problemId}`, 'true');
  } catch {
    // Run still works when browser storage is unavailable.
  }
};

export const getContestRegistered = (contestId: string, userId: string): boolean => {
  try {
    return localStorage.getItem(`contest_registered_${contestId}_${userId}`) === 'true';
  } catch {
    return false;
  }
};

export const setContestRegistered = (contestId: string, userId: string): void => {
  try {
    localStorage.setItem(`contest_registered_${contestId}_${userId}`, 'true');
  } catch {
    // Ignore storage failure (e.g. disabled storage or private browsing)
  }
};

export const removeContestRegistered = (contestId: string, userId: string): void => {
  try {
    localStorage.removeItem(`contest_registered_${contestId}_${userId}`);
  } catch {
    // Ignore storage failure
  }
};

export const getContestTabSwitches = (contestId: string, userId: string): number => {
  try {
    const val = localStorage.getItem(`contest_tab_switches_${contestId}_${userId}`);
    if (!val) return 0;
    const parsed = parseInt(val, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

export const setContestTabSwitches = (contestId: string, userId: string, count: number): void => {
  try {
    localStorage.setItem(`contest_tab_switches_${contestId}_${userId}`, count.toString());
  } catch {
    // Ignore storage failure
  }
};

export const incrementContestTabSwitches = (contestId: string, userId: string): number => {
  try {
    const current = getContestTabSwitches(contestId, userId);
    const next = current + 1;
    setContestTabSwitches(contestId, userId, next);
    return next;
  } catch {
    return 1;
  }
};

export const clearContestTabSwitches = (contestId: string, userId: string): void => {
  try {
    localStorage.removeItem(`contest_tab_switches_${contestId}_${userId}`);
  } catch {
    // Ignore storage failure
  }
};

export const getContestTerminatedByTabSwitch = (contestId: string, userId: string): boolean => {
  try {
    return localStorage.getItem(`contest_tab_switches_terminated_${contestId}_${userId}`) === 'true';
  } catch {
    return false;
  }
};

export const setContestTerminatedByTabSwitch = (contestId: string, userId: string, terminated: boolean): void => {
  try {
    if (terminated) {
      localStorage.setItem(`contest_tab_switches_terminated_${contestId}_${userId}`, 'true');
    } else {
      localStorage.removeItem(`contest_tab_switches_terminated_${contestId}_${userId}`);
    }
  } catch {
    // Ignore storage failure
  }
};

export const clearContestTerminatedByTabSwitch = (contestId: string, userId: string): void => {
  try {
    localStorage.removeItem(`contest_tab_switches_terminated_${contestId}_${userId}`);
  } catch {
    // Ignore storage failure
  }
};

export const getContestPendingTabSwitchSync = (contestId: string, userId: string): number => {
  try {
    const val = localStorage.getItem(`contest_pending_tab_sync_${contestId}_${userId}`);
    if (!val) return 0;
    const parsed = parseInt(val, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
};

export const setContestPendingTabSwitchSync = (contestId: string, userId: string, count: number): void => {
  try {
    localStorage.setItem(`contest_pending_tab_sync_${contestId}_${userId}`, count.toString());
  } catch {
    // Ignore storage failure
  }
};

export const clearContestPendingTabSwitchSync = (contestId: string, userId: string): void => {
  try {
    localStorage.removeItem(`contest_pending_tab_sync_${contestId}_${userId}`);
  } catch {
    // Ignore storage failure
  }
};
