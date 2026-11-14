import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ArrowUpRight, Copy, Check } from 'lucide-react';
import type { Problem } from '../../problem.types';
import { MathText } from './MathText';
import { QuestionDescription } from './QuestionDescription';

interface ProblemStatementTabProps {
  problem: Problem;
  hideIDE?: boolean;
  isRestrictionsActive?: boolean;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onLoadSample: (input: string) => void;
  isAdmin?: boolean;
}

export const ProblemStatementTab: React.FC<ProblemStatementTabProps> = ({
  problem,
  hideIDE = false,
  isRestrictionsActive = false,
  copiedId,
  onCopy,
  onLoadSample,
  isAdmin = false,
}) => {
  const { contestId } = useParams<{ contestId: string }>();

  return (
    <div className={`space-y-4 max-w-4xl mx-auto font-['DM_Sans'] ${isRestrictionsActive ? 'select-none' : ''}`}>
      {/* Header Row: Title & Metadata Badges (Sticky) */}
      <div className="sticky -top-5 z-20 bg-[#090d14] -mt-5 pt-5 pb-3 border-b border-[#192130] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {contestId && (
            <Link
              to={`/contests/${contestId}/problems?tab=code`}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#141b29] border border-transparent hover:border-[#1e2636] transition-all flex items-center justify-center"
              title="Back to Problems"
              aria-label="Back to Problems"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}
          <h1 className="text-xl font-bold text-white tracking-tight">{problem.name}</h1>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded bg-[#10b981]/15 text-[#10b981] font-semibold border border-[#10b981]/30">
            {problem.score} points
          </span>
        </div>
      </div>

      {/* Unified Continuous Statement Container */}
      <div className="p-5 rounded-lg bg-[#0b1018] border border-[#192233] text-sm text-slate-200 leading-relaxed space-y-5">
        {/* Problem Description */}
        {problem.description && (
          <div className="space-y-2">
            <QuestionDescription isAdmin={isAdmin} className="whitespace-pre-line leading-relaxed text-slate-200">
              {problem.description}
            </QuestionDescription>
          </div>
        )}

        {/* Input Format */}
        {problem.input_format && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">Input Format</h3>
            <MathText className="whitespace-pre-line font-mono text-xs text-slate-300 leading-relaxed">{problem.input_format}</MathText>
          </div>
        )}

        {/* Output Format */}
        {problem.output_format && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">Output Format</h3>
            <MathText className="whitespace-pre-line font-mono text-xs text-slate-300 leading-relaxed">{problem.output_format}</MathText>
          </div>
        )}

        {/* Constraints / Note */}
        {problem.constraints && problem.constraints.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-white">Note</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              {problem.constraints.map((constraint, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-[#10b981] mt-0.5">•</span>
                  <MathText className="font-mono">{constraint}</MathText>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Sample test cases */}
        {problem.examples && problem.examples.length > 0 && (
          <div className="space-y-4 pt-2">
            {problem.examples.map((example, index) => {
              const sampleNum = index + 1;
              return (
                <div key={index} className="border-t border-[#192233] pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#10b981]">
                      Sample {sampleNum}
                    </span>
                    {!hideIDE && (
                      <button
                        type="button"
                        onClick={() => onLoadSample(example.input)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#10b981] transition-colors"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Load into Custom Input</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: `sample-${sampleNum}-input`, label: 'Input', text: example.input },
                      { key: `sample-${sampleNum}-output`, label: 'Output', text: example.output },
                    ].map((pane) => (
                      <div key={pane.label} className="rounded border border-[#192233] bg-[#06080d] overflow-hidden">
                        <div className="h-8 px-3 bg-[#0c121c] border-b border-[#192233] flex items-center justify-between">
                          <span className="text-[11px] font-mono text-slate-400 font-semibold">{pane.label}</span>
                          {!isRestrictionsActive && (
                            <button
                              type="button"
                              onClick={() => onCopy(pane.text, pane.key)}
                              className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#141b29] transition-colors"
                              title={`Copy sample ${pane.label.toLowerCase()}`}
                              aria-label={`Copy sample ${pane.label.toLowerCase()}`}
                            >
                              {copiedId === pane.key ? (
                                <Check className="w-3 h-3 text-[#10b981]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </div>
                        <pre className="p-3 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre">
                          {pane.text}
                        </pre>
                      </div>
                    ))}
                  </div>

                  {example.explanation && (
                    <div className="p-3 rounded bg-[#06080d] border border-[#192233] text-xs text-slate-300">
                      <span className="font-semibold text-slate-200">Explanation: </span>
                      <MathText>{example.explanation}</MathText>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
