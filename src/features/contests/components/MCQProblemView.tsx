import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Save, ListChecks, CheckCircle2 } from 'lucide-react';
import type { Problem } from '../problem.types';

interface MCQProblemViewProps {
  problem: Problem;
  onSubmit?: (selectedOption: number) => Promise<void>;
  isContestEnded?: boolean;
  /** hideIDE: unauthenticated or unregistered visitors – hide submission controls entirely */
  hideIDE?: boolean;
  /** submittedOption: option chosen by registered user before contest ended */
  submittedOption?: number | null;
}

export const MCQProblemView = ({
  problem,
  onSubmit,
  isContestEnded = false,
  hideIDE = false,
  submittedOption = null,
}: MCQProblemViewProps) => {
  const [selectedAnswer, setSelectedAnswer] = useState<string>(
    submittedOption !== null && submittedOption !== undefined ? submittedOption.toString() : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (submittedOption !== null && submittedOption !== undefined) {
      setSelectedAnswer(submittedOption.toString());
    }
  }, [submittedOption]);

  const handleClearResponse = useCallback(() => {
    setSelectedAnswer('');
  }, []);

  const handleSubmit = async () => {
    if (!selectedAnswer) {
      alert('Please select an answer before submitting.');
      return;
    }

    if (!onSubmit) {
      console.log('Submitting MCQ:', { selectedOption: parseInt(selectedAnswer) });
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(parseInt(selectedAnswer));
    } catch (error) {
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const options = problem.options ?? [];

  return (
    <div className="flex-1 flex flex-col bg-black text-white">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold font-['DM_Sans']">{problem.name}</h1>
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
              <p className="text-gray-300 leading-relaxed whitespace-pre-line font-['DM_Sans'] text-lg">
                {problem.description}
              </p>
            </div>
          )}

          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-green-400 font-['DM_Sans']">
                {isContestEnded ? 'Answer Options' : 'Select Your Answer'}
              </h2>
              {isContestEnded && submittedOption !== null && submittedOption !== undefined && (
                <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-950/60 border border-green-800/80 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Your submitted answer is highlighted
                </span>
              )}
            </div>

            {options.length === 0 ? (
              <p role="alert" className="rounded-lg border border-red-800 bg-red-950/50 p-4 text-red-300">
                This question has no answer options. Please contact the contest administrator.
              </p>
            ) : (
              <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer}>
                <div className="space-y-2">
                  {options.map((option, index) => {
                    const optionValue = index.toString();
                    const optionLabel = String.fromCharCode(65 + index);
                    const isUserChoice = selectedAnswer === optionValue;

                    let borderBgClass = 'bg-gray-900/30 border-gray-700 hover:bg-gray-900/50';
                    if (isUserChoice) {
                      borderBgClass = isContestEnded
                        ? 'bg-green-950/40 border-green-500/80 ring-1 ring-green-500/50'
                        : 'bg-green-900/20 border-green-500';
                    }

                    return (
                      <div
                        key={optionValue}
                        className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${borderBgClass} ${isContestEnded ? 'cursor-default' : 'cursor-pointer'}`}
                        onClick={() => {
                          if (!isContestEnded) {
                            setSelectedAnswer(optionValue);
                          }
                        }}
                      >
                        <RadioGroupItem
                          value={optionValue}
                          id={`option-${optionValue}`}
                          disabled={isContestEnded}
                          className="border-2"
                        />
                        <Label
                          htmlFor={`option-${optionValue}`}
                          className="flex-1 cursor-pointer font-['DM_Sans'] text-base flex items-center justify-between"
                        >
                          <div>
                            <span className="font-semibold text-green-400 mr-2">
                              {optionLabel}.
                            </span>
                            <span className="text-white">{option}</span>
                          </div>
                          {isContestEnded && isUserChoice && (
                            <span className="text-xs text-green-400 font-semibold uppercase tracking-wider bg-green-900/60 px-2 py-0.5 rounded border border-green-700">
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

      {!isContestEnded && !hideIDE && (
        <div className="border-t border-gray-700 bg-black">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={handleClearResponse}
                variant="outline"
                disabled={!selectedAnswer}
                className="flex items-center gap-2 text-black"
              >
                Clear Response
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !selectedAnswer || options.length === 0}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-700 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Submit Answer
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
