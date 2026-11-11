import { useParams, useOutletContext } from 'react-router-dom';
import { useContestProblems } from '../hooks/useContestProblems';
import { ProblemList } from '../components/ProblemList';
import type { ContestOutletContext } from '../layouts/ContestLayout';

export const ContestProblemsPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const { openEndContestModal } = useOutletContext<ContestOutletContext>() || {};

  const {
    problems,
    isLoading,
    error,
    refresh,
  } = useContestProblems(contestId || '');

  if (!contestId) {
    return (
      <div className="px-6 py-6">
        <div className="text-red-400">Invalid contest ID</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-6 py-6">
        <div className="text-center py-8 text-gray-400 font-['DM_Sans']">Loading...</div>
      </div>
    );
  }

  if (error && problems.length === 0) {
    return (
      <div className="px-6 py-6">
        <div className="text-red-400 font-['DM_Sans']">Error: {error}</div>
        <button type="button" onClick={refresh}>Retry</button>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 flex-1 min-h-0 overflow-y-auto">
      {/* Header & Subtitle */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 font-['DM_Sans']">Questions</h1>
        <p className="text-sm text-[#8B949E] font-['DM_Sans']">
          Select a question to view details and submit your solution
        </p>
      </div>

      {error && <div role="status">Updates stopped: {error} <button type="button" onClick={refresh}>Retry</button></div>}
      <ProblemList problems={problems} contestId={contestId} />

      {openEndContestModal && problems.length > 0 && (
        <div className="mt-10 border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-white font-['DM_Sans']">
              Ready to end your contest session?
            </p>
            <p className="text-xs text-gray-400 font-['DM_Sans'] mt-0.5">
              Only solutions you have submitted will count towards your score.
            </p>
          </div>
          <button
            type="button"
            onClick={openEndContestModal}
            className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-all shadow-lg shadow-red-600/20 font-['DM_Sans'] flex items-center justify-center gap-2"
          >
            End Contest
          </button>
        </div>
      )}
    </div>
  );
};
