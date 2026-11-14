import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Save, ListChecks, CheckCircle2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import type { Problem } from '../problem.types';
import { preventClipboardAction, preventContextMenu, preventClipboardShortcut } from '../clipboardGuards';
import { useRequestCooldown } from '../hooks/useRequestCooldown';
import { QuestionDescription } from './workspace/QuestionDescription';

interface MCQProblemViewProps {
  problem: Problem;
  onSubmit?: (selectedOption: number) => Promise<void>;
  submissionError?: string | null;
  onRetryPolling?: () => void;
  isContestEnded?: boolean;
  isRestrictionsActive?: boolean;
  /** submittedOption: option chosen by registered user before contest ended */
  submittedOption?: number | null;
  contestId?: string;
  prevProblemId?: string | null;
  nextProblemId?: string | null;
  mcqIndex?: number;
  totalMcqs?: number;
  onNavigate?: (targetProblemId: string) => void;
  isAdmin?: boolean;
}

export const MCQProblemView = ({
  problem,
  onSubmit,
  submissionError = null,
  onRetryPolling,
  isContestEnded = false,
  isRestrictionsActive = false,
  submittedOption = null,
  contestId,
  prevProblemId,
  nextProblemId,
  mcqIndex,
  totalMcqs,
  onNavigate,
  isAdmin = false,
}: MCQProblemViewProps) => {
  const [userSelectedAnswer, setUserSelectedAnswer] = useState<string>('');
  const [justSubmitted, setJustSubmitted] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { isCoolingDown, coolDown } = useRequestCooldown();
  const requestScopeRef = useRef(0);

  useEffect(() => {
    const scope = ++requestScopeRef.current;
    return () => {
      if (requestScopeRef.current === scope) requestScopeRef.current += 1;
    };
  }, [problem.id]);

  const hasSubmitted =
    (submittedOption !== null && submittedOption !== undefined) ||
    justSubmitted !== null;

  const selectedAnswer =
    submittedOption !== null && submittedOption !== undefined
      ? submittedOption.toString()
      : justSubmitted !== null
      ? justSubmitted
      : userSelectedAnswer;

  const handleClearResponse = useCallback(() => {
    if (!hasSubmitted) {
      setUserSelectedAnswer('');
      setLocalError(null);
    }
  }, [hasSubmitted]);

  const handleSubmit = async () => {
    if (hasSubmitted || isSubmitting || isCoolingDown) return;

    if (!selectedAnswer) {
      setLocalError('Please select an answer before submitting.');
      return;
    }

    if (!onSubmit) {
      console.log('Submitting MCQ:', { selectedOption: parseInt(selectedAnswer) });
      return;
    }

    const requestScope = requestScopeRef.current;
    const isRequestCurrent = () => requestScopeRef.current === requestScope;

    try {
      setIsSubmitting(true);
      setLocalError(null);
      await onSubmit(parseInt(selectedAnswer));
      if (!isRequestCurrent()) return;
      setJustSubmitted(selectedAnswer);
      if (nextProblemId) onNavigate?.(nextProblemId);
    } catch (error) {
      coolDown(error);
      if (!isRequestCurrent()) return;
      console.error('Submission error:', error);
      if (error instanceof Error && error.message) {
        setLocalError(error.message);
      }
    } finally {
      if (isRequestCurrent()) setIsSubmitting(false);
    }
  };

  const displayError = submissionError || localError;

  const options = problem.options ?? [];

  return (
    <div
      className={`flex-1 flex flex-col bg-black text-white ${isRestrictionsActive ? 'select-none' : ''}`}
      onCopyCapture={isContestEnded ? undefined : preventClipboardAction}
      onCutCapture={isContestEnded ? undefined : preventClipboardAction}
      onPasteCapture={isContestEnded ? undefined : preventClipboardAction}
      onKeyDownCapture={isContestEnded ? undefined : preventClipboardShortcut}
      onContextMenu={isContestEnded ? undefined : preventContextMenu}
    >
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {contestId && (
                  <Link
                    to={`/contests/${contestId}/problems?tab=mcq`}
                    className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-gray-800 transition-colors flex items-center justify-center"
                    title="Back to Problems"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Link>
                )}
                <h1 className="text-2xl font-bold font-['DM_Sans']">{problem.name}</h1>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-400">Score: {problem.score} points</span>
                <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs font-semibold">
                  MCQ
                </span>
              </div>
            </div>
            <div className="h-px bg-gray-700" />
          </div>

          {problem.description && (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-green-400 font-['DM_Sans'] flex items-center gap-2">
                <ListChecks className="w-5 h-5" />
                Question
              </h2>
              <QuestionDescription isAdmin={isAdmin} className="whitespace-pre-line text-gray-300 leading-relaxed font-['DM_Sans'] text-lg">
                {problem.description}
              </QuestionDescription>
            </div>
          )}

          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-green-400 font-['DM_Sans']">
                {isContestEnded || hasSubmitted ? 'Answer Options' : 'Select Your Answer'}
              </h2>
            </div>

            {options.length === 0 ? (
              <p role="alert" className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-red-300">
                This question has no answer options. Please contact the contest administrator.
              </p>
            ) : (
              <RadioGroup
                value={selectedAnswer}
                onValueChange={(val) => {
                  if (!hasSubmitted) {
                    setUserSelectedAnswer(val);
                    setLocalError(null);
                  }
                }}
                disabled={hasSubmitted || !onSubmit}
              >
                <div className="space-y-2">
                  {options.map((option, index) => {
                    const optionValue = index.toString();
                    const optionLabel = String.fromCharCode(65 + index);
                    const isUserChoice = selectedAnswer === optionValue;

                    let borderBgClass = 'bg-gray-900/30 border-gray-700 hover:bg-gray-900/50';
                    if (isUserChoice) {
                      borderBgClass = hasSubmitted
                        ? 'bg-green-950/40 border-green-500/80 ring-1 ring-green-500/50'
                        : 'bg-green-900/20 border-green-500';
                    }

                    return (
                      <div
                        key={optionValue}
                        className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${borderBgClass} ${!hasSubmitted && onSubmit ? 'cursor-pointer' : 'cursor-default'}`}
                        onClick={() => {
                          if (!hasSubmitted && onSubmit) {
                            setUserSelectedAnswer(optionValue);
                            setLocalError(null);
                          }
                        }}
                      >
                        <RadioGroupItem
                          value={optionValue}
                          id={`option-${optionValue}`}
                          className="border-2"
                          disabled={hasSubmitted || !onSubmit}
                        />
                        <Label
                          htmlFor={`option-${optionValue}`}
                          className={`flex-1 font-['DM_Sans'] text-base flex items-center justify-between ${!hasSubmitted && onSubmit ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                          <span>
                            <span className="font-semibold text-green-400 mr-2">
                              {optionLabel}.
                            </span>
                            <span className="text-white">{option}</span>
                          </span>
                          {hasSubmitted && isUserChoice && (
                            <span className="text-xs text-green-400 font-semibold uppercase tracking-wider bg-green-900/60 px-2 py-0.5 rounded border border-green-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Your Choice
                            </span>
                          )}
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </RadioGroup>
            )}
          </div>

          {problem.constraints && problem.constraints.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-gray-700">
              <h2 className="text-lg font-semibold text-green-400 font-['DM_Sans']">
                Note
              </h2>
              <ul className="list-disc list-inside space-y-1 text-gray-300 text-sm">
                {problem.constraints.map((constraint, index) => (
                  <li key={index} className="font-['DM_Sans']">
                    {constraint}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {(onSubmit || hasSubmitted || Boolean(displayError) || prevProblemId !== undefined || nextProblemId !== undefined) && (
        <div className="border-t border-gray-700 bg-black">
          <div className="max-w-4xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
            {/* MCQ Navigation buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!prevProblemId}
                onClick={() => prevProblemId && onNavigate?.(prevProblemId)}
                className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors bg-[#141b29] text-slate-200 border border-[#243047] hover:bg-[#1e293b] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#141b29] disabled:hover:text-slate-200"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={!nextProblemId}
                onClick={() => nextProblemId && onNavigate?.(nextProblemId)}
                className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors bg-[#141b29] text-slate-200 border border-[#243047] hover:bg-[#1e293b] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#141b29] disabled:hover:text-slate-200"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              {totalMcqs !== undefined && totalMcqs > 1 && mcqIndex !== undefined && (
                <span className="text-xs text-gray-400 font-mono ml-2">
                  Question {mcqIndex} of {totalMcqs}
                </span>
              )}
            </div>

            {/* Answer submission actions */}
            <div className="flex items-center gap-3 flex-wrap">
              {displayError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="flex items-center gap-2 text-xs text-red-400 bg-red-950/50 border border-red-800/60 px-3 py-1.5 rounded-md max-w-md"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{displayError}</span>
                  {hasSubmitted && onRetryPolling && (
                    <button
                      type="button"
                      onClick={onRetryPolling}
                      className="text-xs text-red-300 underline hover:text-white ml-1 font-medium whitespace-nowrap"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

              {hasSubmitted ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-950/40 border border-green-800/60 text-green-300 text-xs font-medium">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span>Answer Submitted</span>
                </div>
              ) : onSubmit ? (
                <>
                  <Button
                    onClick={handleClearResponse}
                    variant="outline"
                    size="sm"
                    disabled={!selectedAnswer || isSubmitting}
                    className="flex items-center gap-2 text-xs text-black"
                  >
                    Clear Response
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    size="sm"
                    disabled={isSubmitting || isCoolingDown || !selectedAnswer || options.length === 0}
                    className="flex items-center gap-2 text-xs bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-700 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        {isCoolingDown ? 'Please wait…' : 'Submit Answer'}
                      </>
                    )}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
