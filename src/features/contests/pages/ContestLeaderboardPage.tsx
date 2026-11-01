import { useParams, Link } from 'react-router-dom';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { LeaderboardTable } from '../components/LeaderboardTable';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const ContestLeaderboardPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const {
    leaderboard,
    contest,
    isLoading,
    error,
    page,
    setPage,
    totalPages,
    totalParticipants,
    currentUserRank,
  } = useLeaderboard(contestId || '');

  if (!contestId) {
    return (
      <div className="w-full py-12 flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <div className="text-red-400 font-['DM_Sans']">Invalid contest ID</div>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/contests">Back to Contests</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full py-12 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-green-400 animate-spin mx-auto" />
          <div className="text-gray-400 font-['DM_Sans']">Loading leaderboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full py-12 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <div className="text-red-400 font-['DM_Sans'] text-lg">{error}</div>
          <p className="text-gray-400 text-sm font-['DM_Sans']">
            Failed to load leaderboard data. Please check your connection and try again.
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="bg-green-600 hover:bg-green-700 mt-4"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="w-full py-12 flex items-center justify-center">
        <div className="text-gray-400 font-['DM_Sans']">Contest not found</div>
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
