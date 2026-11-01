import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import { ChevronRight } from "lucide-react";
import type { Contest } from "@/models/contest";
import { contestApi } from "@/services/api/contestApi";
import { Popup } from "@/components/ui/popup";
import { useAuth } from "@/lib/AuthContext";
import { getContestSubmitted } from "@/lib/contestStorage";

interface ContestTimelineProps {
  contest: Contest;
}

const ContestTimeline: React.FC<ContestTimelineProps> = ({ contest }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isRegistered, setIsRegistered] = React.useState<boolean>(
    contest.is_registered ?? false
  );
  const [popup, setPopup] = useState<{
      isOpen: boolean;
      type: "success" | "error";
      message: string;
    }>({
      isOpen: false,
      type: "error",
      message: "",
    });

  // Re-render every second so time-based state (start, end, registration window) stays current.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const contestStarted = now >= contest.start_time;
  const contestEnded = now >= contest.end_time;
  const msToStart = contest.start_time - now;
  const days = Math.floor(msToStart / 86_400_000);
  const pad = (value: number) => value.toString().padStart(2, "0");
  const countdown = isRegistered && !contestStarted
    ? `${days > 0 ? `${days}d ` : ""}${pad(Math.floor(msToStart / 3_600_000) % 24)}:${pad(Math.floor(msToStart / 60_000) % 60)}:${pad(Math.floor(msToStart / 1000) % 60)}`
    : "";
  const slideUp = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  useEffect(() => {
    setIsRegistered(contest.is_registered ?? false);
  }, [contest.id, contest.is_registered]);

  const eligibleYearsText = contest.formatEligibleYears();

  const handleRegister = async () => {
    if (!user) {
      navigate("/login");
      return;
    }

    try {
      await contestApi.registerForContest(contest.id);
      setIsRegistered(true);
      setPopup({
        isOpen: true,
        type: "success",
        message: "Successfully registered for the contest!",
      });
    } catch (err: unknown) {
      console.error("Registration failed:", err);

      let message = "Failed to register. Please try again.";

      if (axios.isAxiosError<{ error?: string }>(err) && err.response) {
        const serverError = err.response?.data?.error;

        switch (err.response?.status) {
          case 403: {
            const errText = (serverError || "").toLowerCase();
            if (
              errText.includes("year") ||
              errText.includes("eligible")
            ) {
              message = `You are not eligible for this contest based on your academic year. This contest is only open to students in ${eligibleYearsText}.`;
            } else {
              message = serverError || "Registration is closed or you are not eligible.";
            }
            break;
          }

          case 404:
            message = serverError || "Contest or user not found.";
            break;

          case 409:
            message = "You are already registered.";
            setIsRegistered(true);
            break;

          case 500:
            message = "Server error. Please try again later.";
            break;

          default:
            message = "Unexpected error occurred.";
        }
      }

      setPopup({
        isOpen: true,
        type: "error",
        message,
      });
    }
  };

  const canStart = contestStarted && isRegistered;
  const canRegister = !isRegistered && contest.isRegistrationOpen();
  const isSubmittedEarly = Boolean(
    user?.uid && getContestSubmitted(contest.id, user.uid)
  );

  const handleStartContest = () => {
    // Request fullscreen 
    document.documentElement.requestFullscreen().catch(() => {});

    // Redirect to problems page
    navigate(`/contests/${contest.id}/problems`);
  };
  const closePopup = () => {
    setPopup(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <section className="w-full px-4 md:px-8 py-12 border-b border-gray-700">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial="hidden"
          animate="show"
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
        >
          {/* Contest Timeline */}
          <motion.div variants={slideUp}>
            <h2 className="text-2xl font-anton text-beige mb-6">Contest Timeline</h2>
            <div className="space-y-4 relative">
              {/* Background vertical line */}
              <div className="absolute left-1.5 top-0 bottom-0 w-1 bg-gray-600" style={{ height: "100%" }} /> 
              {/* Dynamic, sorted timeline */}
                {(() => {
                // Timeline events array
                const timelineEvents = [
                    { label: "Starts at", time: new Date(contest.start_time).toLocaleString('en-IN'), color: "bg-green-400" },
                    { label: "Registration closes at", time: new Date(contest.registration_end_time).toLocaleString('en-IN'), color: "bg-yellow-400" },
                    { label: "Ends at", time: new Date(contest.end_time).toLocaleString('en-IN'), color: "bg-red-400" },
                ];

                // Sort by actual time
                timelineEvents.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

                // Render
                return (
                    <div className="space-y-4 relative">
                    {/* Background vertical line */}
                    <div className="absolute left-1.5 top-0 bottom-0 w-1 bg-gray-600" style={{ height: "100%" }} />
                    {timelineEvents.map((event, index) => (
                        <div key={index} className="flex gap-4 items-start relative z-10">
                        <div className="flex flex-col items-center flex-shrink-0">
                            <div className={`w-4 h-4 rounded-full border-4 border-gray-900 ${event.color}`} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">{event.label}</p>
                            <p className="text-white font-semibold text-lg">{event.time}</p>
                        </div>
                        </div>
                    ))}
                    </div>
                );
                })()}
            </div>
          </motion.div>

          {/* Registration / Action Card */}
          <motion.div
            variants={slideUp}
            className="bg-gradient-to-br from-green-950/40 to-green-900/20 border border-green-500/40 rounded-xl p-8"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-2xl font-anton text-beige">
                {contestEnded
                  ? "Contest Completed"
                  : contestStarted
                  ? "Contest is Live!"
                  : "Ready to compete?"}
              </h2>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-semibold uppercase tracking-wider">
                <span>Eligible:</span>
                <span className="text-white normal-case font-bold">{eligibleYearsText}</span>
              </span>
            </div>
            <p className="text-gray-300 mb-6">
              {isSubmittedEarly
                ? "You have already completed and submitted your test for this contest."
                : contestEnded
                ? "This contest has ended. You can view the problems and check out the final leaderboard."
                : contestStarted
                ? isRegistered
                  ? "The contest is currently in progress. Enter the contest to view and solve problems."
                  : contest.isRegistrationOpen()
                  ? "This contest is currently running. Register now to join."
                  : "This contest is currently running. Registration is now closed."
                : contest.isRegistrationOpen()
                ? "Register now and secure your spot in this exciting contest!"
                : "Registration for this contest has closed."}
            </p>
            {contestEnded ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(`/contests/${contest.id}/problems`)}
                  className="flex-1 py-3 px-6 rounded-lg font-bold text-lg bg-green text-black hover:bg-green-600 transition-all flex items-center justify-center gap-2"
                >
                  View Problems
                  <ChevronRight size={20} />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(`/contests/${contest.id}/leaderboard`)}
                  className="py-3 px-6 rounded-lg font-bold text-lg bg-gray-900 border border-gray-700 text-gray-200 hover:text-white hover:border-gray-500 transition-all flex items-center justify-center gap-2"
                >
                  Leaderboard
                </motion.button>
              </div>
            ) : isSubmittedEarly ? (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/contests/${contest.id}/leaderboard`)}
                className="w-full py-3 px-6 rounded-lg font-bold text-lg bg-gray-800 text-green-400 border border-green-500/30 hover:bg-gray-750 transition-all flex items-center justify-center gap-2"
              >
                View Leaderboard
                <ChevronRight size={20} />
              </motion.button>
            ) : (
              <motion.button
                whileHover={canStart || canRegister ? { scale: 1.05 } : {}}
                whileTap={canStart || canRegister ? { scale: 0.95 } : {}}
                onClick={canStart ? handleStartContest : handleRegister}
                disabled={!canStart && !canRegister}
                className={`w-full py-3 px-6 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2
                  ${
                    !canStart && !canRegister
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                      : "bg-green text-black hover:bg-green-600"
                  }
                `}
              >
                {canStart
                  ? "Start Contest"
                  : isRegistered
                  ? "Already Registered"
                  : canRegister
                  ? "Register"
                  : "Registration Closed"
                }
                {(canStart || canRegister) && <ChevronRight size={20} />}
              </motion.button>
            )}
            {!contestEnded && !isSubmittedEarly && contest.isRegistrationOpen() && !isRegistered && (
              <p className="text-xs text-gray-400 mt-4 text-center">
                Free to register
              </p>
            )}
            {isRegistered && !contestStarted && !contestEnded && countdown && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-400 mb-1">Starts in</p>
                <p className="text-2xl font-bold text-green-400 font-mono tracking-wider">
                  {countdown}
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      </div>
      <Popup
        isOpen={popup.isOpen}
        onClose={closePopup}
        type={popup.type}
        message={popup.message}
        autoCloseDelay={popup.type === "success" ? 2000 : 5000}
      />
    </section>
  );
};

export default ContestTimeline;
