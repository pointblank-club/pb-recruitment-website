import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Problem, ProblemProgress } from '../problem.types';
import { ProblemCard } from './ProblemCard';

interface ProblemTabsProps {
  problems: Problem[];
  contestId: string;
  progress: Record<string, ProblemProgress>;
}

const safeGetSession = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetSession = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage denial
  }
};

const resolveTab = (
  tabParam: string | null,
  savedTab: string | null,
  hasMcq: boolean,
  hasCode: boolean,
): 'mcq' | 'code' => {
  if (hasCode && !hasMcq) return 'code';
  if (hasMcq && !hasCode) return 'mcq';
  if (tabParam === 'mcq' || tabParam === 'code') return tabParam;
  if (savedTab === 'mcq' || savedTab === 'code') return savedTab;
  return hasMcq ? 'mcq' : 'code';
};

export const ProblemTabs = ({ problems, contestId, progress }: ProblemTabsProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const codeProblems = problems.filter((problem) => problem.type === 'code');
  const mcqProblems = problems.filter((problem) => problem.type === 'mcq');
  const hasMcq = mcqProblems.length > 0;
  const hasCode = codeProblems.length > 0;

  const [activeTab, setActiveTab] = useState<'mcq' | 'code'>(() => {
    const tabParam = searchParams.get('tab');
    const saved = safeGetSession(`contest_tab_${contestId}`);
    const resolved = resolveTab(tabParam, saved, hasMcq, hasCode);
    safeSetSession(`contest_tab_${contestId}`, resolved);
    return resolved;
  });

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const resolved = resolveTab(tabParam, activeTab, hasMcq, hasCode);
    if (resolved !== activeTab) {
      setActiveTab(resolved);
    }
    safeSetSession(`contest_tab_${contestId}`, resolved);

    if (tabParam && tabParam !== resolved) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', resolved);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, contestId, hasMcq, hasCode, activeTab, setSearchParams]);

  const handleTabChange = (tab: 'mcq' | 'code') => {
    setActiveTab(tab);
    safeSetSession(`contest_tab_${contestId}`, tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      },
      { replace: true },
    );
  };

  const activeProblems = activeTab === 'mcq' ? mcqProblems : codeProblems;

  const isProblemAttempted = (p: Problem) => {
    const s = progress[p.id];
    return s === 'attempted' || s === 'solved' || s === 'judging' || s === 'failed';
  };
  const attemptedCount = activeProblems.filter(isProblemAttempted).length;
  const unattemptedCount = activeProblems.filter((p) => progress[p.id] === 'unsolved').length;

  if (problems.length === 0) {
    return (
      <div className="text-center py-12 text-[#8B949E] font-['DM_Sans']">
        No problems found in this contest.
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Controls Row: Tabs on Left, Legends on Right */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        {/* Segmented Button Group */}
        <div className="inline-flex p-1 bg-[#11161F] border border-[#262C36] rounded-[6px] gap-1">
          <button
            type="button"
            aria-pressed={activeTab === 'mcq'}
            onClick={() => handleTabChange('mcq')}
            className={`px-3.5 py-1.5 rounded-[4px] text-xs sm:text-sm font-medium transition-all select-none cursor-pointer ${
              activeTab === 'mcq'
                ? 'bg-[#262F3D] border border-[#3B4657] text-[#F0F6FC] shadow-sm'
                : 'bg-transparent border border-transparent text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#161B22]/50'
            }`}
          >
            MCQ Questions ({mcqProblems.length})
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'code'}
            onClick={() => handleTabChange('code')}
            className={`px-3.5 py-1.5 rounded-[4px] text-xs sm:text-sm font-medium transition-all select-none cursor-pointer ${
              activeTab === 'code'
                ? 'bg-[#262F3D] border border-[#3B4657] text-[#F0F6FC] shadow-sm'
                : 'bg-transparent border border-transparent text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#161B22]/50'
            }`}
          >
            Code Questions ({codeProblems.length})
          </button>
        </div>

        {/* Status Legends */}
        <div className="flex items-center gap-4 text-xs font-medium font-['DM_Sans'] select-none">
          <div className="flex items-center gap-1.5 text-[#8B949E]">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-amber-500 inline-block shrink-0" />
            <span>Attempted ({attemptedCount})</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#8B949E]">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-[#30363D] border border-gray-600 inline-block shrink-0" />
            <span>Unattempted ({unattemptedCount})</span>
          </div>
        </div>
      </div>

      {/* Scrollable Question List (10px - 12px gap) */}
      <div className="flex flex-col gap-2.5 sm:gap-3 w-full">
        {activeProblems.length === 0 ? (
          <div className="text-center py-8 text-sm text-[#8B949E] font-['DM_Sans'] bg-[#161B22] border border-[#262C36]">
            No {activeTab === 'mcq' ? 'MCQ' : 'coding'} questions available.
          </div>
        ) : (
          activeProblems.map((problem, idx) => (
            <ProblemCard
              key={problem.id}
              problem={problem}
              contestId={contestId}
              progress={progress[problem.id]}
              index={idx + 1}
            />
          ))
        )}
      </div>
    </div>
  );
};

