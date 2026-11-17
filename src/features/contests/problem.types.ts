export type ProblemType = 'code' | 'mcq';
export type ProblemProgress = 'unsolved' | 'attempted' | 'judging' | 'failed' | 'solved' | 'unavailable';

export interface Problem {
  id: string;
  contest_id: string;
  name: string;
  score: number;
  type: ProblemType;
  time_limit?: number; // milliseconds, coding questions only
  memory_limit?: number; // MiB, coding questions only
  progress?: ProblemProgress;
  answer?: number[];
  description?: string;
  constraints?: string[];
  input_format?: string;
  output_format?: string;
  examples?: ProblemExample[];
  options?: string[];  // For MCQ questions
}

export interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface ProblemFilters {
  type: ProblemType | 'All';
  sortBy: 'score' | 'name';
  sortOrder: 'asc' | 'desc';
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  usn: string;
  total_score: number; // Supports decimal scores with up to 2 decimal places (e.g. 142.75)
  problems_solved: number; // Note: Only problems with 100% full solve count here
  last_submission_time?: number | null;
  problem_scores?: ProblemScore[];
}

export interface ProblemScore {
  problem_id: string;
  problem_name: string;
  type?: ProblemType;
  score: number; // Supports decimal scores with up to 2 decimal places (e.g. 37.5)
  max_score: number;
  attempts: number; // Total submissions, including judge errors; not the ranking penalty.
  solved_at?: number | null;
}

export interface SubmissionDetails {
  id: string;
  problem_id: string;
  type: ProblemType;
  status: 'accepted' | 'wrong_answer' | 'tle' | 'rte' | 'failed_to_process' | 'pending' | string;
  score?: number; // Supports decimal scores (e.g. 12.5 awarded for partial credit)
  max_score?: number;
  runtime?: number;
  memory?: number;
  test_case_results?: import('@/services/api/contestApi').TestCaseResult[];
  test_cases_passed?: number;
  total_test_cases?: number;
}

export interface Contest {
  id: string;
  name: string;
  start_time: number;
  end_time: number;
  is_registered?: boolean;
}
