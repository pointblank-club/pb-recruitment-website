import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import { ChevronRight, AlertTriangle } from "lucide-react";
import type { Contest } from "@/models/contest";
import { contestApi } from "@/services/api/contestApi";
import { Popup } from "@/components/ui/popup";
import { useAuth } from "@/lib/AuthContext";
import {
  MAX_TAB_SWITCHES,
  getContestSubmitted,
  getContestRegistered,
  setContestRegistered,
  removeContestRegistered,
  getTabSwitchStateKey,
  readLocalTabSwitchState,
} from "@/lib/contestStorage";
import {
  isEffectivelyTerminated,
  reconcileContestSessionStatus,
} from "@/features/contests/tabSwitchSync";

interface ContestTimelineProps {
  contest: Contest;
  onRegistered?: (contestId: string) => void;
}

const ContestTimeline: React.FC<ContestTimelineProps> = ({ contest, onRegistered }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const [isRegistered, setIsRegistered] = React.useState<boolean>(() => {
    if (contest.is_registered !== undefined) {
      return contest.is_registered;
    }
    return Boolean(user?.uid && getContestRegistered(contest.id, user.uid));
  });
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
    if (contest.is_registered !== undefined) {
      setIsRegistered(contest.is_registered);
      if (user?.uid) {
        if (contest.is_registered) {
          setContestRegistered(contest.id, user.uid);
        } else {
          removeContestRegistered(contest.id, user.uid);
        }
      }
    } else {
      setIsRegistered(Boolean(user?.uid && getContestRegistered(contest.id, user.uid)));
    }
  }, [contest.id, contest.is_registered, user?.uid]);

  const eligibleYearsText = contest.formatEligibleYears();

  const handleRegister = async () => {
    if (!user) {
      navigate("/login");
      return;
    }

    const targetContestId = contest.id;
    const targetUserId = user.uid;

    try {
      await contestApi.registerForContest(targetContestId);
      if (!isMountedRef.current || contest.id !== targetContestId || user?.uid !== targetUserId) {
        return;
      }
      setIsRegistered(true);
      setContestRegistered(targetContestId, targetUserId);
      onRegistered?.(targetContestId);
      setPopup({
        isOpen: true,
        type: "success",
        message: "Successfully registered for the contest!",
      });
    } catch (err: unknown) {
      console.error("Registration failed:", err);

      if (!isMountedRef.current || contest.id !== targetContestId || user?.uid !== targetUserId) {
        return;
      }

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
            setContestRegistered(targetContestId, targetUserId);
            onRegistered?.(targetContestId);
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

  const [isTerminatedByTabSwitch, setIsTerminatedByTabSwitch] = useState<boolean>(() => {
    if (!user?.uid) return false;
    const local = readLocalTabSwitchState(contest.id, user.uid);
    return isEffectivelyTerminated(local, local.hasServerSnapshot ? 'supported' : 'idle', MAX_TAB_SWITCHES);
  });
  const [isSubmittedEarly, setIsSubmittedEarly] = useState<boolean>(() =>
    Boolean(user?.uid && getContestSubmitted(contest.id, user.uid))
  );

  useEffect(() => {
    const uid = user?.uid;
    setIsSubmittedEarly(Boolean(uid && getContestSubmitted(contest.id, uid)));
    if (!uid) {
      setIsTerminatedByTabSwitch(false);
      return;
    }

    const initialLocal = readLocalTabSwitchState(contest.id, uid);
    setIsTerminatedByTabSwitch(
      isEffectivelyTerminated(initialLocal, initialLocal.hasServerSnapshot ? 'supported' : 'idle', MAX_TAB_SWITCHES)
    );

    const controller = new AbortController();
    const runReconcile = () => {
      void reconcileContestSessionStatus({
        contestId: contest.id,
        userId: uid,
        maxSwitches: MAX_TAB_SWITCHES,
        signal: controller.signal,
      }).then((outcome) => {
        if (controller.signal.aborted || outcome.aborted) return;
        setIsTerminatedByTabSwitch(
          isEffectivelyTerminated(outcome.state, outcome.apiStatus, MAX_TAB_SWITCHES)
        );
        if (outcome.isSessionEnded) {
          setIsSubmittedEarly(true);
        }
      }).catch(() => {});
    };

    runReconcile();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') runReconcile();
    };
    const handleFocusOrOnline = () => {
      runReconcile();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== getTabSwitchStateKey(contest.id, uid)) return;
      const latest = readLocalTabSwitchState(contest.id, uid);
      setIsTerminatedByTabSwitch(
        isEffectivelyTerminated(latest, latest.hasServerSnapshot ? 'supported' : 'idle', MAX_TAB_SWITCHES)
      );
      setIsSubmittedEarly(Boolean(getContestSubmitted(contest.id, uid)));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocusOrOnline);
    window.addEventListener('online', handleFocusOrOnline);
    window.addEventListener('storage', handleStorage);

    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        runReconcile();
      }
    }, 15_000);

    return () => {
      controller.abort();
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocusOrOnline);
      window.removeEventListener('online', handleFocusOrOnline);
      window.removeEventListener('storage', handleStorage);
    };
  }, [contest.id, user?.uid]);

  const canStart = contestStarted && isRegistered && !isTerminatedByTabSwitch && !isSubmittedEarly;
  const canRegister = !isRegistered && contest.isRegistrationOpen();

  const handleStartContest = () => {
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
            {isTerminatedByTabSwitch && !contestEnded && (
              <div className="bg-red-950/40 border border-red-700/60 rounded-xl p-4 mb-6 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-red-300 font-semibold text-sm">Contest Session Locked (Tab Switches Exceeded)</h4>
                  <p className="text-gray-400 text-xs mt-1">
                    Your session was locked because {MAX_TAB_SWITCHES} tab switches were detected. Your existing submissions and local code drafts are preserved.
                    If an administrator resets your violations, you will be able to resume immediately.
                  </p>
                </div>
              </div>
            )}
            <p className="text-gray-300 mb-6">
              {isSubmittedEarly
                ? "You have already completed and submitted your test for this contest."
                : isTerminatedByTabSwitch
                ? `Your contest session was locked due to exceeding the maximum allowed tab switches (${MAX_TAB_SWITCHES}/${MAX_TAB_SWITCHES}).`
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
            ) : isTerminatedByTabSwitch ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  disabled
                  className="flex-1 py-3 px-6 rounded-lg font-bold text-lg bg-red-950/60 border border-red-800 text-red-400 cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={20} />
                  Session Locked ({MAX_TAB_SWITCHES} Tab Switches)
                </button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(`/contests/${contest.id}/leaderboard`)}
                  className="py-3 px-6 rounded-lg font-bold text-lg bg-gray-900 border border-gray-700 text-gray-200 hover:text-white hover:border-gray-500 transition-all flex items-center justify-center gap-2"
                >
                  Leaderboard
                </motion.button>
              </div>
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
