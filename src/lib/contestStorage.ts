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
