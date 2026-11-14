import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Code2 } from 'lucide-react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { adminApi } from '@/services/api/adminApi';
import { useAuth } from '@/lib/AuthContext';

export const ContestLeaderboardPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const leaderboardState = useLeaderboard(contestId || '');
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (authLoading) return () => { cancelled = true; };
    setIsAdmin(false);
    if (!user) return () => { cancelled = true; };
    adminApi
      .checkAdminAccess()
      .then(() => {
        if (!cancelled) setIsAdmin(true);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.uid]);

  const {
    leaderboard,
    contest,
    currentUserRank,
    page,
    setPage,
    hasNextPage,
    isLoading,
    error,
    hasStarted,
    refresh,
  } = leaderboardState;

  if (!contestId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
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
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green mx-auto mb-4" />
          <p className="text-gray-400 font-['DM_Sans']">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
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
              <button
                type="button"
                onClick={() => navigate(`/contests/${contestId}/problems`)}
                className="px-4 py-2 bg-gray-800 text-gray-200 border border-gray-700 font-semibold rounded-md hover:bg-gray-700 transition-colors font-['DM_Sans'] text-sm"
              >
                Back to Problems
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="bg-[#111622] border border-[#1e2638] rounded-xl p-8 max-w-md text-center">
          <p className="text-yellow-400 font-semibold mb-2 font-['DM_Sans'] text-lg">Contest Not Started</p>
          <p className="text-gray-400 text-sm mb-6 font-['DM_Sans']">
            The leaderboard will be available once the contest begins.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/contests/${contestId}/problems`)}
            className="px-4 py-2 bg-green text-black font-semibold rounded-md hover:bg-green-600 transition-colors font-['DM_Sans'] text-sm"
          >
            Back to Problems
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 flex-1 min-h-0 overflow-y-auto">
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
              to={`/contests/${contestId}/problems`}
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
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 font-['DM_Sans']">LEADERBOARD</h1>
          <p className="text-gray-400 font-['DM_Sans']">Real-time rankings for {contest.name}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => navigate(`/admin/contest/${contestId}/submissions`)}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded text-sm font-semibold transition-colors font-['DM_Sans'] shadow self-start sm:self-auto"
          >
            <Code2 size={16} />
            View Contest Submissions
          </button>
        )}
      </div>

      {/* Leaderboard Table */}
      {leaderboard.length === 0 && page > 0 ? (
        <div className="bg-black border border-gray-800 p-12 text-center">
          <p className="text-gray-400 text-lg font-['DM_Sans']">No more participants on this page</p>
        </div>
      ) : (
        <LeaderboardTable
          entries={leaderboard}
          currentUserId={currentUserRank?.user_id}
          contestId={contestId}
          isAdmin={isAdmin}
        />
      )}

      {/* Pagination controls */}
      {(hasNextPage || page > 0) && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400 font-['DM_Sans']">
          <span>
            Page {page + 1}
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
              disabled={!hasNextPage}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 bg-gray-900 border border-gray-800 rounded disabled:opacity-40 hover:text-white transition"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
