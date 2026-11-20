import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, Sparkles, AlertCircle, Send, LogIn } from "lucide-react";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import { contestApi, type SubmitFeedbackPayload } from "@/services/api/contestApi";
import { Contest } from "@/models/contest";
import { useAuth } from "@/lib/AuthContext";
import { clearPendingFeedback } from "@/lib/contestStorage";
import { toast } from "react-toastify";
import axios from "axios";

const setFeedbackDone = (contestId: string) => {
  try {
    localStorage.setItem(`pb_contest_feedback_${contestId}`, "true");
  } catch {}
};

const isFeedbackDoneLocally = (contestId: string): boolean => {
  try {
    return localStorage.getItem(`pb_contest_feedback_${contestId}`) === "true";
  } catch {
    return false;
  }
};

const RatingButtons: React.FC<{
  id?: string;
  name: string;
  value: number | null;
  onChange: (v: number) => void;
}> = ({ id, name, value, onChange }) => (
  <div
    id={id}
    tabIndex={-1}
    role="radiogroup"
    aria-label={name}
    className="grid grid-cols-5 gap-3 sm:gap-5 focus:outline-none"
  >
    {[1, 2, 3, 4, 5].map((val) => (
      <button
        key={val}
        type="button"
        role="radio"
        aria-checked={value === val}
        aria-label={`${name}: ${val} of 5`}
        onClick={() => onChange(val)}
        className={`py-3.5 sm:py-4 rounded-xl border text-base sm:text-xl font-bold transition-all ${
          value === val
            ? "bg-green text-black border-green font-extrabold shadow-lg shadow-green/20 scale-105"
            : "border-gray-800 bg-gray-900/60 text-gray-200 hover:border-gray-600 hover:bg-gray-800"
        }`}
      >
        {val}
      </button>
    ))}
  </div>
);

const ContestFeedbackPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [contest, setContest] = useState<Contest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Status checks
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [canSubmit, setCanSubmit] = useState<boolean>(false);

  // Form State - all compulsory
  const [platformSmoothness, setPlatformSmoothness] = useState<number | null>(null);
  const [atmosphereRating, setAtmosphereRating] = useState<number | null>(null);
  const [difficultyRating, setDifficultyRating] = useState<number | null>(null);
  const [responsivenessRating, setResponsivenessRating] = useState<number | null>(null);
  const [timeRating, setTimeRating] = useState<number | null>(null);

  const [thoughtsDuringEvent, setThoughtsDuringEvent] = useState<string[]>([]);
  const [thoughtsOther, setThoughtsOther] = useState<string>("");
  const [isThoughtsOtherSelected, setIsThoughtsOtherSelected] = useState(false);

  const [finalFeedback, setFinalFeedback] = useState<string>("");

  const [logisticsClarity, setLogisticsClarity] = useState<string>("");
  const [logisticsPunctuality, setLogisticsPunctuality] = useState<string>("");
  const [logisticsVenue, setLogisticsVenue] = useState<string>("");

  const [bestThing, setBestThing] = useState<string>("");
  const [recommendLikelihood, setRecommendLikelihood] = useState<string>("");

  const [convincedReasons, setConvincedReasons] = useState<string[]>([]);
  const [convincedOther, setConvincedOther] = useState<string>("");
  const [isConvincedOtherSelected, setIsConvincedOtherSelected] = useState(false);

  const [suggestions, setSuggestions] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    const currentUserId = user?.uid;
    const currentContestId = id;

    if (isFeedbackDoneLocally(currentContestId)) {
      setHasSubmitted(true);
    }

    let isMounted = true;
    const isCurrent = () => isMounted && id === currentContestId && user?.uid === currentUserId;

    const loadData = async () => {
      try {
        setIsLoading(true);
        setFetchError(null);
        const contestData = await contestApi.getContestById(currentContestId);
        if (!isCurrent()) return;
        setContest(contestData);

        if (user) {
          const status = await contestApi.getFeedbackStatus(currentContestId);
          if (!isCurrent()) return;
          const done = Boolean(status.has_submitted) || isFeedbackDoneLocally(currentContestId);
          setHasSubmitted(done);
          setCanSubmit(Boolean(status.can_submit));
          if (done && user?.uid) {
            clearPendingFeedback(user.uid);
          }
        }
      } catch (err: unknown) {
        if (!isCurrent()) return;
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 404) {
            setFetchError("Contest not found. It may have been removed.");
          } else if (err.response?.status === 403) {
            setFetchError("You do not have permission to view feedback for this contest.");
          } else {
            setFetchError("Failed to load contest feedback status. Please retry.");
          }
        } else {
          setFetchError("Failed to load contest feedback status. Please retry.");
        }
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
        }
      }
    };

    if (!authLoading) {
      void loadData();
    }

    return () => {
      isMounted = false;
    };
  }, [id, user, authLoading]);

  const isDirty = Boolean(
    platformSmoothness || atmosphereRating || difficultyRating || responsivenessRating ||
    timeRating || thoughtsDuringEvent.length > 0 || thoughtsOther || finalFeedback ||
    logisticsClarity || logisticsPunctuality || logisticsVenue || bestThing ||
    recommendLikelihood || convincedReasons.length > 0 || convincedOther || suggestions
  );

  useEffect(() => {
    if (hasSubmitted || isSuccess || !canSubmit) return;
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      toast.warning("Please submit your feedback before leaving.");
    };
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasSubmitted, isSuccess, canSubmit]);

  const toggleThought = (thought: string) => {
    setThoughtsDuringEvent((prev) =>
      prev.includes(thought) ? prev.filter((t) => t !== thought) : [...prev, thought]
    );
  };

  const toggleConvincedReason = (reason: string) => {
    setConvincedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    const fail = (msg: string, elementId?: string) => {
      setErrorMessage(msg);
      if (elementId) {
        const el = document.getElementById(elementId);
        if (el) {
          el.focus();
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          return false;
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    };

    // Validate ALL questions as compulsory
    if (!platformSmoothness || platformSmoothness < 1 || platformSmoothness > 5)
      return fail("Question 1 is required: Please rate how smooth the platform was (1 to 5).", "q1-platform-smoothness");
    if (!atmosphereRating)
      return fail("Question 2 is required: Please rate the overall atmosphere of the recruitment test.", "q2-atmosphere");
    if (!difficultyRating)
      return fail("Question 3 is required: Please rate the overall test difficulty.", "q3-difficulty");
    if (!responsivenessRating)
      return fail("Question 4 is required: Please rate the platform responsiveness.", "q4-responsiveness");
    if (!timeRating)
      return fail("Question 5 is required: Please rate whether the test time was enough.", "q5-time");
    if (thoughtsDuringEvent.length === 0 && (!isThoughtsOtherSelected || !thoughtsOther.trim()))
      return fail("Question 6 is required: Please select what your thoughts were during the event.", "q6-thoughts");
    if (isThoughtsOtherSelected && !thoughtsOther.trim())
      return fail("Question 6 is required: Please specify your thoughts in the other text field.", "q6-thoughts-other");
    if (!logisticsClarity)
      return fail("Question 7 is required: Please rate the clarity of recruitment instructions.", "q7-logistics-clarity");
    if (!logisticsPunctuality)
      return fail("Question 7 is required: Please rate the punctuality of rounds.", "q7-logistics-punctuality");
    if (!logisticsVenue)
      return fail("Question 7 is required: Please rate venue comfort and setup.", "q7-logistics-venue");
    if (!recommendLikelihood)
      return fail("Question 9 is required: Please select how likely you are to recommend joining Pointblank.", "q9-recommend");
    if (convincedReasons.length === 0 && (!isConvincedOtherSelected || !convincedOther.trim()))
      return fail("Question 10 is required: Please select what convinced you the most to consider joining.", "q10-convinced");
    if (isConvincedOtherSelected && !convincedOther.trim())
      return fail("Question 10 is required: Please specify what convinced you in the other text field.", "q10-convinced-other");

    if (!user) return;
    const targetContestId = id;
    const targetUserId = user.uid;

    setIsSubmitting(true);
    setErrorMessage(null);

    const thoughtsList = isThoughtsOtherSelected
      ? [...thoughtsDuringEvent, "Other"]
      : thoughtsDuringEvent;

    const reasonsList = isConvincedOtherSelected
      ? [...convincedReasons, "Other"]
      : convincedReasons;

    const payload: SubmitFeedbackPayload = {
      platform_smoothness: platformSmoothness,
      atmosphere_rating: atmosphereRating,
      difficulty_rating: difficultyRating,
      responsiveness_rating: responsivenessRating,
      time_rating: timeRating,
      thoughts_during_event: thoughtsList.length > 0 ? thoughtsList.join(", ") : undefined,
      thoughts_other: isThoughtsOtherSelected ? thoughtsOther.trim() : undefined,
      final_feedback: finalFeedback.trim(),
      logistics_clarity: logisticsClarity,
      logistics_punctuality: logisticsPunctuality,
      logistics_venue: logisticsVenue,
      best_thing: bestThing.trim(),
      recommend_likelihood: recommendLikelihood,
      convinced_reasons: reasonsList,
      convinced_other: isConvincedOtherSelected ? convincedOther.trim() : undefined,
      suggestions: suggestions.trim(),
    };

    try {
      await contestApi.submitFeedback(targetContestId, payload);
      if (id !== targetContestId || user?.uid !== targetUserId) return;
      setFeedbackDone(targetContestId);
      if (user?.uid) clearPendingFeedback(user.uid);
      setIsSuccess(true);
      setHasSubmitted(true);
      toast.success("Thank you! Your feedback has been recorded.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      if (id !== targetContestId || user?.uid !== targetUserId) return;
      let msg = "Failed to submit feedback. Please try again.";
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string; message?: string } | undefined;
        msg = data?.error || data?.message || err.message || msg;
        if (err.response?.status === 409) {
          setFeedbackDone(targetContestId);
          if (user?.uid) clearPendingFeedback(user.uid);
          setIsSuccess(true);
          setHasSubmitted(true);
          toast.info("You have already submitted feedback for this contest.");
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      if (id === targetContestId && user?.uid === targetUserId) {
        setIsSubmitting(false);
      }
    }
  };

  const isEligibleToSubmit = canSubmit && !hasSubmitted;
  const isFormActive = Boolean(user && isEligibleToSubmit && !hasSubmitted && !isSuccess && !fetchError && !isLoading && !authLoading);

  return (
    <div className="bg-black text-white min-h-screen flex flex-col font-['DM_Sans']">
      {isFormActive ? (
        <header className="border-b border-gray-800 bg-black/95 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <span className="font-anton text-xl tracking-wider text-green">POINT BLANK</span>
            {contest?.name && (
              <span className="text-sm text-gray-400 font-['DM_Sans'] hidden sm:inline">
                · {contest.name}
              </span>
            )}
          </div>
          <span className="text-xs font-mono font-medium uppercase bg-red-950/80 border border-red-700/60 text-red-300 px-3 py-1 rounded-full">
            Feedback Required
          </span>
        </header>
      ) : (
        <Navbar />
      )}

      <main className="flex-1 max-w-5xl lg:max-w-6xl w-full mx-auto px-4 sm:px-8 py-12">
        {isLoading || authLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-green" />
            <p className="text-gray-300 text-base">Loading contest feedback...</p>
          </div>
        ) : fetchError ? (
          <div className="bg-gradient-to-b from-white/[0.04] to-black border border-red-500/30 rounded-2xl p-8 sm:p-14 text-center max-w-2xl mx-auto shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto mb-6">
              <AlertCircle size={46} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-anton text-white mb-4 tracking-wide">
              Unable to Load Feedback
            </h1>
            <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8">
              {fetchError}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => navigate(0)}
                className="w-full sm:w-auto px-7 py-3 rounded-xl bg-green text-black font-bold text-sm hover:bg-green-600 transition-colors shadow-lg shadow-green/20"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => navigate("/contests")}
                className="w-full sm:w-auto px-7 py-3 rounded-xl border border-gray-700 bg-gray-800 text-white font-semibold text-sm hover:bg-gray-700 transition-colors"
              >
                View Contests
              </button>
            </div>
          </div>
        ) : isSuccess || hasSubmitted ? (
          <div className="bg-gradient-to-b from-white/[0.04] to-black border border-white/10 rounded-2xl p-8 sm:p-14 text-center max-w-2xl mx-auto shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-green/10 border border-green/30 flex items-center justify-center text-green mx-auto mb-6">
              <CheckCircle2 size={46} />
            </div>
            <h1 className="text-3xl sm:text-4xl font-anton text-beige mb-4 tracking-wide">
              Feedback Recorded!
            </h1>
            <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8">
              Thank you for sharing your thoughts with Pointblank. Your feedback directly helps us improve the recruitment round experience for future batches!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-green text-black font-bold text-base hover:bg-green-600 transition-colors shadow-lg shadow-green/20"
              >
                Return to Home
              </button>
              <button
                type="button"
                onClick={() => navigate(`/contest/${id}`)}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl border border-gray-700 bg-gray-800 text-white font-semibold text-base hover:bg-gray-700 transition-colors"
              >
                Contest Overview
              </button>
            </div>
          </div>
        ) : !user ? (
          <div className="bg-gradient-to-b from-white/[0.04] to-black border border-white/10 rounded-2xl p-8 sm:p-14 text-center max-w-2xl mx-auto shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto mb-6">
              <LogIn size={46} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-anton text-white mb-4 tracking-wide">
              Sign In Required
            </h1>
            <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8">
              Please sign in with your registered account to submit contest feedback.
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { state: { from: `/contest/${id}/feedback` } })}
              className="w-full sm:w-auto px-9 py-3.5 rounded-xl bg-green text-black font-bold text-base hover:bg-green-600 transition-colors shadow-lg shadow-green/20"
            >
              Sign In to Continue
            </button>
          </div>
        ) : !isEligibleToSubmit ? (
          <div className="bg-gradient-to-b from-white/[0.04] to-black border border-white/10 rounded-2xl p-8 sm:p-14 text-center max-w-2xl mx-auto shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-6">
              <AlertCircle size={46} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-anton text-white mb-4 tracking-wide">
              Feedback Not Available
            </h1>
            <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8">
              Feedback can only be submitted after your contest session has ended.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/contest/${id}`)}
              className="w-full sm:w-auto px-9 py-3.5 rounded-xl bg-green text-black font-bold text-base hover:bg-green-600 transition-colors shadow-lg shadow-green/20"
            >
              Contest Overview
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Page Header */}
            <div className="bg-gradient-to-r from-green-950/40 via-gray-900/60 to-black border border-white/10 rounded-2xl p-6 sm:p-10 backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-2.5 mb-3">
                <span className="text-xs sm:text-sm uppercase tracking-wider font-semibold px-3 py-1 rounded bg-green-500/20 text-green border border-green-500/30 flex items-center gap-1.5 font-mono">
                  <Sparkles size={14} /> Participant Feedback
                </span>
                <span className="text-xs sm:text-sm uppercase tracking-wider font-semibold px-3 py-1 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1.5 font-mono">
                  <ShieldCheck size={14} /> 100% Anonymous
                </span>
                <span className="text-xs sm:text-sm uppercase tracking-wider font-semibold px-3 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 font-mono">
                  <AlertCircle size={14} /> Questions with * are required
                </span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold font-anton text-beige tracking-wide">
                Pointblank Recruitment: 1st year Feedback!
              </h1>
              <p className="text-gray-300 text-base sm:text-lg mt-3 max-w-3xl leading-relaxed">
                Spill the tea! Tell us about your Pointblank recruitment experience. This feedback form is <strong>completely anonymous</strong>—your responses will not be linked to your test performance or candidate scoring. Your honest (and maybe weird) feedback helps us level up!
              </p>
              <div className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-blue-950/40 border border-blue-800/50 text-blue-300 text-sm">
                <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" />
                <span>
                  <strong>Anonymous Submission:</strong> Your name and identity are kept confidential and will not affect your recruitment outcome. Please feel free to be completely honest!
                </span>
              </div>
            </div>

            {errorMessage && (
              <div className="p-4 sm:p-5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-base flex items-start gap-3">
                <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Question 1: Platform Smoothness (Required, No stars) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                      <span>1. How smooth was the recruitment platform?</span>
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    {platformSmoothness && (
                      <span className="text-sm sm:text-base text-gray-300 font-mono shrink-0">
                        Rating: {platformSmoothness}/5
                      </span>
                    )}
                  </div>
                  <p className="text-sm sm:text-base text-gray-300">
                    Did everything run seamlessly without lag, errors, or unexpected glitches?
                  </p>
                </div>

                <div className="pt-2 space-y-3">
                  <RatingButtons id="q1-platform-smoothness" name="Platform smoothness" value={platformSmoothness} onChange={setPlatformSmoothness} />
                  <div className="flex justify-between text-sm font-medium text-gray-400 px-1 pt-1">
                    <span>1 — Very Laggy</span>
                    <span>5 — Extremely Smooth</span>
                  </div>
                </div>
              </div>

              {/* Question 2: Atmosphere (Google Form Item 1) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                      <span>2. How would you rate the overall atmosphere of the recruitment test?</span>
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    {atmosphereRating && (
                      <span className="text-sm sm:text-base text-gray-300 font-mono shrink-0">
                        Rating: {atmosphereRating}/5
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <RatingButtons id="q2-atmosphere" name="Atmosphere rating" value={atmosphereRating} onChange={setAtmosphereRating} />
                  <div className="flex flex-col sm:flex-row justify-between text-sm sm:text-base font-medium text-gray-300 px-1 pt-1 gap-1">
                    <span>1 — Nap-Inducing (Needed coffee ASAP)</span>
                    <span className="sm:text-right">5 — Total Vibe (Felt like a party)</span>
                  </div>
                </div>
              </div>

              {/* Question 3: Difficulty (Google Form Item 2 Row 1) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                      <span>3. Overall test difficulty?</span>
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    {difficultyRating && (
                      <span className="text-sm sm:text-base text-gray-300 font-mono shrink-0">
                        Rating: {difficultyRating}/5
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <RatingButtons id="q3-difficulty" name="Difficulty rating" value={difficultyRating} onChange={setDifficultyRating} />
                </div>
              </div>

              {/* Question 4: Responsiveness (Google Form Item 2 Row 2) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                      <span>4. Platform responsiveness rating?</span>
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    {responsivenessRating && (
                      <span className="text-sm sm:text-base text-gray-300 font-mono shrink-0">
                        Rating: {responsivenessRating}/5
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <RatingButtons id="q4-responsiveness" name="Platform responsiveness" value={responsivenessRating} onChange={setResponsivenessRating} />
                </div>
              </div>

              {/* Question 5: Time (Google Form Item 2 Row 3) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                      <span>5. Was the test time enough?</span>
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    {timeRating && (
                      <span className="text-sm sm:text-base text-gray-300 font-mono shrink-0">
                        Rating: {timeRating}/5
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <RatingButtons id="q5-time" name="Time rating" value={timeRating} onChange={setTimeRating} />
                </div>
              </div>

              {/* Question 6: Thoughts During Event (Google Form Item 3) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                    <span>6. Thoughts during the event ?</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <p className="text-sm sm:text-base text-gray-300">
                    Select all that apply:
                  </p>
                </div>

                <div id="q6-thoughts" tabIndex={-1} className="pt-2 space-y-3 focus:outline-none">
                  {[
                    "Cry but don't disturb others",
                    "Can I peep and find answers?",
                    "Bribe the invigilators for brownie points",
                    'Singing "Main aisa kyu huun?"',
                  ].map((option) => (
                    <label
                      key={option}
                      className={`flex items-center gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                        thoughtsDuringEvent.includes(option)
                          ? "bg-green/10 border-green/60 text-white shadow-md shadow-green/10"
                          : "border-gray-800 bg-gray-900/40 text-gray-200 hover:border-gray-700 hover:bg-gray-900/70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={thoughtsDuringEvent.includes(option)}
                        onChange={() => toggleThought(option)}
                        className="rounded text-green focus:ring-green h-5 w-5 bg-black border-gray-700"
                      />
                      <span className="text-base sm:text-lg">{option}</span>
                    </label>
                  ))}

                  <label
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                      isThoughtsOtherSelected
                        ? "bg-green/10 border-green/60 text-white shadow-md shadow-green/10"
                        : "border-gray-800 bg-gray-900/40 text-gray-200 hover:border-gray-700 hover:bg-gray-900/70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isThoughtsOtherSelected}
                      onChange={(e) => setIsThoughtsOtherSelected(e.target.checked)}
                      className="rounded text-green focus:ring-green h-5 w-5 bg-black border-gray-700 mt-1"
                    />
                    <div className="flex-1">
                      <span className="text-base sm:text-lg font-medium">Other</span>
                      {isThoughtsOtherSelected && (
                        <input
                          id="q6-thoughts-other"
                          type="text"
                          placeholder="Your answer..."
                          value={thoughtsOther}
                          onChange={(e) => setThoughtsOther(e.target.value)}
                          className="mt-3 w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-base text-white focus:outline-none focus:border-green transition-colors"
                          autoFocus
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Question 7: Logistics (Google Form Item 5) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                    <span>7. Thinking about the logistics (location, timing, clarity of instructions), how did Pointblank fare?</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                </div>

                <div className="pt-2 space-y-6">
                  {[
                    { key: "q7-logistics-clarity", title: "a. Clarity of Communication (Instructions):", val: logisticsClarity, set: setLogisticsClarity },
                    { key: "q7-logistics-punctuality", title: "b. Punctuality of the Event:", val: logisticsPunctuality, set: setLogisticsPunctuality },
                    { key: "q7-logistics-venue", title: "c. Comfort/Suitability of the Venue:", val: logisticsVenue, set: setLogisticsVenue },
                  ].map((row) => (
                    <div key={row.key} className="space-y-3 pt-2">
                      <p className="text-sm sm:text-base font-semibold text-gray-200">
                        {row.title}
                      </p>
                      <div id={row.key} tabIndex={-1} role="radiogroup" aria-label={row.title} className="grid grid-cols-2 sm:grid-cols-4 gap-3 focus:outline-none">
                        {["Needs Major Work", "Could Be Better", "Just Right", "Excellent"].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            role="radio"
                            aria-checked={row.val === opt}
                            aria-label={`${row.title}: ${opt}`}
                            onClick={() => row.set(opt)}
                            className={`py-3 px-3 rounded-xl border text-sm sm:text-base font-semibold transition-all text-center ${
                              row.val === opt
                                ? "bg-green text-black border-green font-bold shadow-md shadow-green/20"
                                : "border-gray-800 bg-gray-900/60 text-gray-300 hover:border-gray-700 hover:bg-gray-800"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Question 8: One thing Pointblank got right (Google Form Item 6) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <label htmlFor="q8-best-thing" className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5 cursor-pointer">
                    <span>8. What's the one thing Pointblank absolutely got right during the recruitment?</span>
                  </label>
                </div>
                <div className="pt-2">
                  <textarea
                    id="q8-best-thing"
                    rows={4}
                    value={bestThing}
                    onChange={(e) => setBestThing(e.target.value)}
                    placeholder="Your answer..."
                    className="w-full px-5 py-4 bg-gray-900/50 border border-gray-800 rounded-xl text-base text-white placeholder:text-gray-500 focus:outline-none focus:border-green transition-colors leading-relaxed"
                  />
                </div>
              </div>

              {/* Question 9: Recommend Likelihood (Google Form Item 7) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <label id="q9-recommend-label" className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                    <span>9. How likely are you to recommend joining Pointblank to your first-year buddies?</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                </div>
                <div id="q9-recommend" tabIndex={-1} role="radiogroup" aria-labelledby="q9-recommend-label" className="pt-2 space-y-3 focus:outline-none">
                  {[
                    "Not at all likely (I want the secrets for myself!)",
                    "Maybe (If they promise to bring snacks)",
                    "Likely (It was a good experience)",
                    "Extremely Likely (They'd be crazy to miss out!)",
                  ].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={recommendLikelihood === opt}
                      aria-label={opt}
                      onClick={() => setRecommendLikelihood(opt)}
                      className={`w-full p-4 rounded-xl border text-left text-base sm:text-lg font-medium transition-all ${
                        recommendLikelihood === opt
                          ? "bg-green text-black border-green font-bold shadow-md shadow-green/20"
                          : "border-gray-800 bg-gray-900/60 text-gray-200 hover:border-gray-700 hover:bg-gray-800"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question 10: Convinced Reasons (Google Form Item 8) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                    <span>10. What convinced you the most to consider joining Pointblank?</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                  <p className="text-sm sm:text-base text-gray-300">
                    Select all that apply:
                  </p>
                </div>
                <div id="q10-convinced" tabIndex={-1} className="pt-2 space-y-3 focus:outline-none">
                  {[
                    "I heard it's where all the cool kids hang out",
                    "The enthusiasm of the team members",
                    "The promise of free pizza (Jokes! Maybe.)",
                  ].map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                        convincedReasons.includes(reason)
                          ? "bg-green/10 border-green/60 text-white shadow-md shadow-green/10"
                          : "border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:bg-gray-900/70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={convincedReasons.includes(reason)}
                        onChange={() => toggleConvincedReason(reason)}
                        className="rounded text-green focus:ring-green h-5 w-5 bg-black border-gray-700"
                      />
                      <span className="text-base sm:text-lg">{reason}</span>
                    </label>
                  ))}

                  <label
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                      isConvincedOtherSelected
                        ? "bg-green/10 border-green/60 text-white shadow-md shadow-green/10"
                        : "border-gray-800 bg-gray-900/40 text-gray-300 hover:border-gray-700 hover:bg-gray-900/70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isConvincedOtherSelected}
                      onChange={(e) => setIsConvincedOtherSelected(e.target.checked)}
                      className="rounded text-green focus:ring-green h-5 w-5 bg-black border-gray-700 mt-1"
                    />
                    <div className="flex-1">
                      <span className="text-base sm:text-lg font-medium">Other</span>
                      {isConvincedOtherSelected && (
                        <input
                          id="q10-convinced-other"
                          type="text"
                          placeholder="Your answer..."
                          value={convincedOther}
                          onChange={(e) => setConvincedOther(e.target.value)}
                          className="mt-3 w-full px-4 py-3 bg-black border border-gray-700 rounded-xl text-base text-white focus:outline-none focus:border-green transition-colors"
                          autoFocus
                        />
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Question 11: Suggestions (Google Form Item 9) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <label htmlFor="q11-suggestions" className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5 cursor-pointer">
                    <span>11. Any suggestions for how we can make the next recruitment test even better?</span>
                  </label>
                </div>
                <div className="pt-2">
                  <textarea
                    id="q11-suggestions"
                    rows={4}
                    value={suggestions}
                    onChange={(e) => setSuggestions(e.target.value)}
                    placeholder="Your answer..."
                    className="w-full px-5 py-4 bg-gray-900/50 border border-gray-800 rounded-xl text-base text-white placeholder:text-gray-500 focus:outline-none focus:border-green transition-colors leading-relaxed"
                  />
                </div>
              </div>

              {/* Question 12: Final Feedback (Google Form Item 4) */}
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-green/30 space-y-6 shadow-lg">
                <div className="space-y-2">
                  <label htmlFor="q12-final-feedback" className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5 cursor-pointer">
                    <span>12. Any final feedback about the test?</span>
                  </label>
                </div>
                <div className="pt-2">
                  <textarea
                    id="q12-final-feedback"
                    rows={4}
                    value={finalFeedback}
                    onChange={(e) => setFinalFeedback(e.target.value)}
                    placeholder="Your answer..."
                    className="w-full px-5 py-4 bg-gray-900/50 border border-gray-800 rounded-xl text-base text-white placeholder:text-gray-500 focus:outline-none focus:border-green transition-colors leading-relaxed"
                  />
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-6 pb-16 flex flex-col items-center">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto min-w-[320px] px-10 py-4 rounded-xl bg-green hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-extrabold transition-all text-lg shadow-xl shadow-green/20 flex items-center justify-center gap-2.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>Submitting Feedback...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Submit Feedback</span>
                    </>
                  )}
                </button>
                <p className="text-sm text-gray-400 mt-3 text-center">
                  All required questions (*) must be answered before submitting. Text questions are optional.
                </p>
                <p className="text-xs text-blue-400/80 mt-1.5 text-center flex items-center justify-center gap-1.5">
                  <ShieldCheck size={14} className="text-blue-400" />
                  Your responses are anonymous and collected solely to improve future tests.
                </p>
              </div>
            </form>
          </div>
        )}
      </main>

      {!isFormActive && <Footer />}
    </div>
  );
};

export default ContestFeedbackPage;