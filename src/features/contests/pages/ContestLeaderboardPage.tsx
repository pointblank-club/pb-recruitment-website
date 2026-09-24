import { useParams, Link } from 'react-router-dom';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { LeaderboardTable } from '../components/LeaderboardTable';

export const ContestLeaderboardPage = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const leaderboardState = useLeaderboard(contestId || '');

  if (!contestId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 font-medium">Invalid contest ID</p>
          <Link to="/contests" className="text-blue-600 hover:underline mt-2 inline-block">
            Go back to contests
          </Link>
        </div>
      </div>
    );
  }

  const {
    leaderboard,
    contest,
    currentUserRank,
    isLoading,
    error,
    totalParticipants,
  } = leaderboardState;


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-medium mb-2">Error loading leaderboard</p>
            <p className="text-red-600 text-sm mb-4">{error || 'Contest not found'}</p>
            <Link
              to="/contests"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Back to Contests
            </Link>
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2 font-['DM_Sans']">LEADERBOARD</h1>
          <p className="text-gray-400 font-['DM_Sans']">Real-time rankings for {contest.name}</p>
        </div>



        {/* Leaderboard Table */}
        <LeaderboardTable
          entries={leaderboard}
          currentUserId={currentUserRank?.user_id}
        />

        {/* Empty State for Filtered Results */}
        {leaderboard.length === 0 && totalParticipants > 0 && (
          <div className="bg-black border border-gray-800 p-12 text-center">
            <p className="text-gray-400 text-lg mb-2 font-['DM_Sans']">NO RESULTS FOUND</p>
            <p className="text-gray-600 text-sm font-['DM_Sans']">No results found</p>
          </div>
        )}
      </div>
  );
};
