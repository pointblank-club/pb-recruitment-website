import { Link, useLocation } from 'react-router-dom';

interface ContestHeaderProps {
  timeRemaining: number;
  progress: number;
  contestName?: string;
  contestId?: string;
}

export const ContestHeader = ({ 
  timeRemaining,
  progress,
  contestName = 'Point Blank Recruitment Test 2025',
  contestId,
}: ContestHeaderProps) => {
  const location = useLocation();

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  };

  const getTimeColor = () => {
    if (timeRemaining <= 300) return 'text-red-400'; //5 minutes
    if (timeRemaining <= 900) return 'text-yellow-400'; // 15 minutes
    return 'text-green-400';
  };

  return (
    <div className="w-full bg-black border-b border-gray-700 sticky top-0 z-50">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-white font-['DM_Sans'] flex items-center h-full">{contestName}</h1>
            {contestId && (
              <nav className="flex items-center gap-2">
                <Link
                  to={`/contests/${contestId}/problems`}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    location.pathname.includes('/problems')
                      ? 'bg-gray-800 text-green-400 font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Problems
                </Link>
                <Link
                  to={`/contests/${contestId}/leaderboard`}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    location.pathname.includes('/leaderboard')
                      ? 'bg-gray-800 text-green-400 font-semibold'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Leaderboard
                </Link>
              </nav>
            )}
          </div>
          <div className="text-right flex flex-col justify-center">
            <div className="text-s text-gray-400 font-['DM_Sans']">Time remaining</div>
            <div className={`text-xl font-['DM_Sans'] font-mono ${getTimeColor()}`}>
              {timeRemaining > 0 ? formatTime(timeRemaining) : 'Time Up!'}
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-full bg-green h-1">
        <div 
          className="bg-white h-1 transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
