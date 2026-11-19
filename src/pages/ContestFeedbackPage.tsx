import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, Sparkles, AlertCircle, Send, LogIn } from "lucide-react";
import Navbar from "./components/Navbar";
import Footer from "./components/footer";
import { contestApi, type SubmitFeedbackPayload } from "@/services/api/contestApi";
import { Contest } from "@/models/contest";
import { useAuth } from "@/lib/AuthContext";
import { getContestSubmitted, clearPendingFeedback } from "@/lib/contestStorage";
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

const RatingButtons: React.FC<{ value: number | null; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-5 gap-3 sm:gap-5">
    {[1, 2, 3, 4, 5].map((val) => (
      <button
        key={val}
        type="button"
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
    if (isFeedbackDoneLocally(id)) {
      setHasSubmitted(true);
    }

    let isMounted = true;

    const loadData = async () => {
      try {
        setIsLoading(true);
        const contestData = await contestApi.getContestById(id);
        if (isMounted) {
          setContest(contestData);
        }

        if (user) {
          const status = await contestApi.getFeedbackStatus(id);
          if (isMounted) {
            const done = status.has_submitted || isFeedbackDoneLocally(id);
            setHasSubmitted(done);
            setCanSubmit(status.can_submit);
            if (done && user?.uid) {
              clearPendingFeedback(user.uid);
            }
          }
        }
      } catch (err) {
        console.warn("Error loading contest or feedback status:", err);
      } finally {
        if (isMounted) {
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

  useEffect(() => {
    if (hasSubmitted || isSuccess) return;
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
  }, [hasSubmitted, isSuccess]);

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

    const fail = (msg: string) => {
      setErrorMessage(msg);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    };

    // Validate ALL questions as compulsory
    if (!platformSmoothness || platformSmoothness < 1 || platformSmoothness > 5)
      return fail("Question 1 is required: Please rate how smooth the platform was (1 to 5).");
    if (!atmosphereRating)
      return fail("Question 2 is required: Please rate the overall atmosphere of the recruitment test.");
    if (!difficultyRating)
      return fail("Question 3 is required: Please rate the overall test difficulty.");
    if (!responsivenessRating)
      return fail("Question 4 is required: Please rate the platform responsiveness.");
    if (!timeRating)
      return fail("Question 5 is required: Please rate whether the test time was enough.");
    if (thoughtsDuringEvent.length === 0 && (!isThoughtsOtherSelected || !thoughtsOther.trim()))
      return fail("Question 6 is required: Please select what your thoughts were during the event.");
    if (isThoughtsOtherSelected && !thoughtsOther.trim())
      return fail("Question 6 is required: Please specify your thoughts in the other text field.");
    if (!logisticsClarity || !logisticsPunctuality || !logisticsVenue)
      return fail("Question 7 is required: Please answer all three logistics questions.");
    if (!bestThing.trim())
      return fail("Question 8 is required: Please tell us what Pointblank absolutely got right.");
    if (!recommendLikelihood)
      return fail("Question 9 is required: Please select how likely you are to recommend joining Pointblank.");
    if (convincedReasons.length === 0 && (!isConvincedOtherSelected || !convincedOther.trim()))
      return fail("Question 10 is required: Please select what convinced you the most to consider joining.");
    if (isConvincedOtherSelected && !convincedOther.trim())
      return fail("Question 10 is required: Please specify what convinced you in the other text field.");
    if (!suggestions.trim())
      return fail("Question 11 is required: Please provide suggestions for how we can make the next test better.");
    if (!finalFeedback.trim())
      return fail("Question 12 is required: Please share any final feedback about the test.");

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
      await contestApi.submitFeedback(id, payload);
      setFeedbackDone(id);
      if (user?.uid) clearPendingFeedback(user.uid);
      setIsSuccess(true);
      setHasSubmitted(true);
      toast.success("Thank you! Your feedback has been recorded.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      let msg = "Failed to submit feedback. Please try again.";
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string; message?: string } | undefined;
        msg = data?.error || data?.message || err.message || msg;
        if (err.response?.status === 409) {
          setFeedbackDone(id);
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
      setIsSubmitting(false);
    }
  };

  const isSessionEndedLocally = Boolean(id && user?.uid && getContestSubmitted(id, user.uid));
  const isContestPastDeadline = Boolean(contest && contest.end_time <= Date.now());
  const isEligibleToSubmit = canSubmit || isSessionEndedLocally || isContestPastDeadline;

  return (
    <div className="bg-black text-white min-h-screen flex flex-col font-['DM_Sans']">
      {hasSubmitted || isSuccess ? (
        <Navbar />
      ) : (
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
      )}

      <main className="flex-1 max-w-5xl lg:max-w-6xl w-full mx-auto px-4 sm:px-8 py-12">
        {isLoading || authLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-green" />
            <p className="text-gray-300 text-base">Loading contest feedback...</p>
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
              onClick={() => navigate(`/login?redirect=/contest/${id}/feedback`)}
              className="w-full sm:w-auto px-9 py-3.5 rounded-xl bg-green text-black font-bold text-base hover:bg-green-600 transition-colors shadow-lg shadow-green/20"
            >
              Sign In to Continue
            </button>
          </div>
        ) : !isEligibleToSubmit && contest ? (
          <div className="bg-gradient-to-b from-white/[0.04] to-black border border-white/10 rounded-2xl p-8 sm:p-14 text-center max-w-2xl mx-auto shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-6">
              <AlertCircle size={46} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-anton text-white mb-4 tracking-wide">
              Contest Still In Progress
            </h1>
            <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8">
              Feedback can only be submitted after your contest session has ended. Please finish your test before filling out this feedback form.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/contests/${id}/problems`)}
              className="w-full sm:w-auto px-9 py-3.5 rounded-xl bg-green text-black font-bold text-base hover:bg-green-600 transition-colors shadow-lg shadow-green/20"
            >
              Return to Contest
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
                <span className="text-xs sm:text-sm uppercase tracking-wider font-semibold px-3 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5 font-mono">
                  <AlertCircle size={14} /> All Questions Compulsory
                </span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold font-anton text-beige tracking-wide">
                Pointblank Recruitment: 1st year Feedback!
              </h1>
              <p className="text-gray-300 text-base sm:text-lg mt-3 max-w-3xl leading-relaxed">
                Spill the tea! Tell us about your Pointblank recruitment experience. Your honest (and maybe weird) feedback helps us level up!
              </p>
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
                  <RatingButtons value={platformSmoothness} onChange={setPlatformSmoothness} />
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
                  <RatingButtons value={atmosphereRating} onChange={setAtmosphereRating} />
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
                  <RatingButtons value={difficultyRating} onChange={setDifficultyRating} />
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
                  <RatingButtons value={responsivenessRating} onChange={setResponsivenessRating} />
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
                  <RatingButtons value={timeRating} onChange={setTimeRating} />
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

                <div className="pt-2 space-y-3">
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
                    { key: "clarity", title: "a. Clarity of Communication (Instructions):", val: logisticsClarity, set: setLogisticsClarity },
                    { key: "punctuality", title: "b. Punctuality of the Event:", val: logisticsPunctuality, set: setLogisticsPunctuality },
                    { key: "venue", title: "c. Comfort/Suitability of the Venue:", val: logisticsVenue, set: setLogisticsVenue },
                  ].map((row) => (
                    <div key={row.key} className="space-y-3 pt-2">
                      <p className="text-sm sm:text-base font-semibold text-gray-200">
                        {row.title}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {["Needs Major Work", "Could Be Better", "Just Right", "Excellent"].map((opt) => (
                          <button
                            key={opt}
                            type="button"
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
                  <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                    <span>8. What's the one thing Pointblank absolutely got right during the recruitment?</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                </div>
                <div className="pt-2">
                  <textarea
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
                  <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                    <span>9. How likely are you to recommend joining Pointblank to your first-year buddies?</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                </div>
                <div className="pt-2 space-y-3">
                  {[
                    "Not at all likely (I want the secrets for myself!)",
                    "Maybe (If they promise to bring snacks)",
                    "Likely (It was a good experience)",
                    "Extremely Likely (They'd be crazy to miss out!)",
                  ].map((opt) => (
                    <button
                      key={opt}
                      type="button"
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
                <div className="pt-2 space-y-3">
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
                  <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                    <span>11. Any suggestions for how we can make the next recruitment test even better?</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                </div>
                <div className="pt-2">
                  <textarea
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
                  <label className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5">
                    <span>12. Any final feedback about the test?</span>
                    <span className="text-red-500 font-bold">*</span>
                  </label>
                </div>
                <div className="pt-2">
                  <textarea
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
                  All 12 sections must be answered before submitting.
                </p>
              </div>
            </form>
          </div>
        )}
      </main>

      {(hasSubmitted || isSuccess) && <Footer />}
    </div>
  );
};

export default ContestFeedbackPage;