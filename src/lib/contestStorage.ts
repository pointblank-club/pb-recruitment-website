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

