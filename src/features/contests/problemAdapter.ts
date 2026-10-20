import type { Problem, ProblemType } from './problem.types';

export interface ProblemOverviewResponse {
  id: string;
  name: string;
  score: number;
  type: string;
}

interface ProblemTestCaseResponse {
  index: number;
  input: string;
  expected_output?: string;
  is_sample?: boolean;
}

export interface ProblemDetailsResponse extends Omit<ProblemOverviewResponse, 'id'> {
  problem_id: string;
  contest_id: string;
  description?: string;
  options?: string[];
  time_limit?: number;
  memory_limit?: number;
  testcases?: ProblemTestCaseResponse[];
}

const problemType = (value: string): ProblemType => {
  switch (value.toLowerCase()) {
    case 'code': return 'code';
    case 'mcq': return 'mcq';
    default: throw new Error(`Unsupported problem type: ${value}`);
  }
};

export const toProblemOverview = (response: ProblemOverviewResponse, contestId: string): Problem => ({
  ...response,
  contest_id: contestId,
  type: problemType(response.type),
});

export const toProblemDetails = (response: ProblemDetailsResponse): Problem => ({
  ...response,
  id: response.problem_id,
  type: problemType(response.type),
  description: response.description ?? '',
  time_limit: response.time_limit,
  memory_limit: response.memory_limit,
  examples: (response.testcases ?? [])
    .filter((testcase) => testcase.is_sample !== false && typeof testcase.expected_output === 'string')
    .sort((left, right) => left.index - right.index)
    .map((testcase) => ({
      input: testcase.input,
      output: testcase.expected_output ?? '',
      explanation: '',
    })),
});
