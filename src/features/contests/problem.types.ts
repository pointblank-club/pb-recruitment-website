export type ProblemType = 'Code' | 'MCQ';

export interface Problem {
  id: string;
  contest_id: string;
  name: string;
  score: number;
  type: ProblemType;
  answer?: number[];
  description?: string;
  constraints?: string[];
  input_format?: string;
  output_format?: string;
  examples?: ProblemExample[];
  time_limit?: number;
  memory_limit?: number;
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
  total_score: number;
  problems_solved: number;
  last_submission_time: number;
  problem_scores?: ProblemScore[];
}

export interface ProblemScore {
  problem_id: string;
  problem_name: string;
  score: number;
  max_score: number;
  attempts: number;
  solved_at?: number;
}


export interface Contest {
  id: string;
  name: string;
  start_time: number;
  end_time: number;
}
