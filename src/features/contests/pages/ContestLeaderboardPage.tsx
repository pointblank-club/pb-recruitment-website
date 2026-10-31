import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { LeaderboardTable } from '../components/LeaderboardTable';

export const ContestLeaderboardPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const leaderboardState = useLeaderboard(contestId || '');
  const hasRedirectedRef = useRef(false);

  const {
    leaderboard,
    contest,
    currentUserRank,
    page,
    setPage,
    totalPages,
    totalParticipants,
    isLoading,
    error,
    hasStarted,
    refresh,
  } = leaderboardState;

  useEffect(() => {
    if (
      !isLoading &&
      contestId &&
      !hasStarted &&
      !hasRedirectedRef.current
    ) {
      hasRedirectedRef.current = true;
      toast.info('The contest has not started yet. Leaderboard will be available once the contest begins.');
      navigate(`/contest/${contestId}`, { replace: true });
    }
  }, [isLoading, hasStarted, contest, contestId, navigate]);

  if (!contestId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 font-medium font-['DM_Sans']">Invalid contest ID</p>
          <Link to="/contests" className="text-green hover:underline mt-2 inline-block font-['DM_Sans']">
            Go back to contests
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green mx-auto mb-4" />
          <p className="text-gray-400 font-['DM_Sans']">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green mx-auto mb-4" />
          <p className="text-gray-400 font-['DM_Sans']">Contest has not started yet. Redirecting to contest details...</p>
        </div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-6 text-center">
            <p className="text-red-400 font-medium mb-2 font-['DM_Sans']">Error loading leaderboard</p>
            <p className="text-red-300 text-sm mb-4 font-['DM_Sans']">{error || 'Contest not found'}</p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={refresh}
                className="px-4 py-2 bg-green text-black font-semibold rounded-md hover:bg-green-600 transition-colors font-['DM_Sans'] text-sm"
              >
                Retry
              </button>
              <Link
                to="/contests"
                className="inline-block px-4 py-2 bg-gray-800 text-gray-200 border border-gray-700 font-semibold rounded-md hover:bg-gray-700 transition-colors font-['DM_Sans'] text-sm"
              >
                Back to Contests
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <ol className="flex items-center space-x-2 text-sm font-['DM_Sans']">
          <li>
            <Link to="/contests" className="text-green-400 hover:text-green-300">
              CONTESTS
            </Link>
          </li>
          <li className="text-gray-600">/</li>
          <li>
            <Link
              to={`/contest/${contestId}`}
              className="text-green-400 hover:text-green-300"
            >
              {contest.name}
            </Link>
          </li>
          <li className="text-gray-600">/</li>
          <li className="text-gray-400">LEADERBOARD</li>
        </ol>
      </nav>

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2 font-['DM_Sans']">LEADERBOARD</h1>
        <p className="text-gray-400 font-['DM_Sans']">Real-time rankings for {contest.name}</p>
      </div>

      {/* Leaderboard Table */}
      <LeaderboardTable
        entries={leaderboard}
        currentUserId={currentUserRank?.user_id}
      />

      {/* Pagination controls */}
      {(totalPages > 1 || page > 0) && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400 font-['DM_Sans']">
          <span>
            Page {page + 1} of {Math.max(1, totalPages)} ({totalParticipants} total participants)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage(Math.max(0, page - 1))}
              className="px-3 py-1 bg-gray-900 border border-gray-800 rounded disabled:opacity-40 hover:text-white transition"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 bg-gray-900 border border-gray-800 rounded disabled:opacity-40 hover:text-white transition"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Empty State for Filtered Results */}
      {leaderboard.length === 0 && totalParticipants > 0 && (
        <div className="bg-black border border-gray-800 p-12 text-center mt-4">
          <p className="text-gray-400 text-lg mb-2 font-['DM_Sans']">NO RESULTS FOUND</p>
          <p className="text-gray-600 text-sm font-['DM_Sans']">No results found</p>
        </div>
      )}
    </div>
  );
};
