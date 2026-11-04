import React from 'react';
import { Terminal, ChevronUp, ChevronDown } from 'lucide-react';
import type { ActiveSubmission } from '../../hooks/useProblemSubmissions';
import { formatVerdict, getVerdictClasses } from '../../submissionUtils';
import { ProblemVerdictTab } from './ProblemVerdictTab';

export interface ConsoleRunResult {
  status?: string;
  runtime?: number;
  memory?: number;
  stdout?: string;
  stderr?: string;
  compile_output?: string;
  errorText?: string;
}

interface WorkspaceConsoleDrawerProps {
  consoleTab: 'input' | 'output' | 'latest_result';
  setConsoleTab: (tab: 'input' | 'output' | 'latest_result') => void;
  isConsoleCollapsed: boolean;
  setIsConsoleCollapsed: (collapsed: boolean) => void;
  consoleHeight: number;
  cursorPos: { lineNumber: number; column: number };
  customInput: string;
  setCustomInput: (val: string) => void;
  isLocked: boolean;
  sampleInput?: string;
  isRunning: boolean;
  runResult: ConsoleRunResult | null;
  activeSubmission: ActiveSubmission;
  onRetryPolling?: () => void;
  onInvalidateRun: () => void;
}

export const WorkspaceConsoleDrawer: React.FC<WorkspaceConsoleDrawerProps> = ({
  consoleTab,
  setConsoleTab,
  isConsoleCollapsed,
  setIsConsoleCollapsed,
  consoleHeight,
  cursorPos,
  customInput,
  setCustomInput,
  isLocked,
  sampleInput,
  isRunning,
  runResult,
  activeSubmission,
  onRetryPolling,
  onInvalidateRun,
}) => {
  return (
    <div
      className="flex flex-col bg-[#090d14] border-t border-[#1e2636] overflow-hidden flex-shrink-0 transition-[height] duration-150 ease-out font-['DM_Sans']"
      style={{ height: isConsoleCollapsed ? '36px' : `${consoleHeight}px` }}
    >
      {/* Console Header Bar (36px) */}
      <div className="h-9 bg-[#0b0f17] border-b border-[#1e2636] px-3 flex items-center justify-between flex-shrink-0">
        {/* Left side: Console Tabs */}
        <div className="flex items-center gap-1 h-full">
          <button
            type="button"
            onClick={() => {
              setConsoleTab('input');
              if (isConsoleCollapsed) setIsConsoleCollapsed(false);
            }}
            className={`relative px-3 h-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              consoleTab === 'input' && !isConsoleCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Input</span>
            {consoleTab === 'input' && !isConsoleCollapsed && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#10b981]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setConsoleTab('output');
              if (isConsoleCollapsed) setIsConsoleCollapsed(false);
            }}
            className={`relative px-3 h-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              consoleTab === 'output' && !isConsoleCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>Output</span>
            {runResult && (
              <span
                className={`w-2 h-2 rounded-full ${runResult.status === 'accepted' ? 'bg-[#10b981]' : 'bg-rose-500'}`}
              />
            )}
            {consoleTab === 'output' && !isConsoleCollapsed && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#10b981]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setConsoleTab('latest_result');
              if (isConsoleCollapsed) setIsConsoleCollapsed(false);
            }}
            className={`relative px-3 h-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              consoleTab === 'latest_result' && !isConsoleCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span>Latest Result</span>
            {activeSubmission.status && (
              <span
                className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${getVerdictClasses(activeSubmission.status)}`}
              >
                {formatVerdict(activeSubmission.status)}
              </span>
            )}
            {consoleTab === 'latest_result' && !isConsoleCollapsed && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#10b981]" />
            )}
          </button>
        </div>

        {/* Right side: Cursor & Collapse Controls */}
        <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
          <span className="hidden sm:inline text-[11px] text-gray-500">
            Ln {cursorPos.lineNumber}, Col {cursorPos.column}
          </span>

          <button
            type="button"
            onClick={() => setIsConsoleCollapsed(!isConsoleCollapsed)}
            className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
          >
            <span>{isConsoleCollapsed ? 'Show Console' : 'Hide Console'}</span>
            {isConsoleCollapsed ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Console Body */}
      {!isConsoleCollapsed && (
        <div className="flex-1 min-h-0 overflow-hidden p-3 bg-[#090d14]">
          {consoleTab === 'input' && (
            <div className="h-full flex flex-col space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <label className="font-semibold text-slate-300">Custom Input:</label>
                {sampleInput && (
                  <button
                    type="button"
                    onClick={() => {
                      onInvalidateRun();
                      setCustomInput(sampleInput);
                    }}
                    className="text-[#10b981] hover:underline text-[11px]"
                  >
                    Use Sample Input
                  </button>
                )}
              </div>
              <textarea
                value={customInput}
                onChange={(e) => {
                  if (isLocked) return;
                  onInvalidateRun();
                  setCustomInput(e.target.value);
                }}
                placeholder={isLocked ? 'Editor is locked (contest ended)' : 'Enter your custom input here...'}
                disabled={isLocked}
                className="flex-1 bg-[#141b29] border border-[#243047] rounded p-2.5 text-xs font-mono text-white focus:outline-none focus:border-[#10b981] resize-none leading-relaxed disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {consoleTab === 'output' && (
            <div className="h-full flex flex-col overflow-auto font-mono text-xs space-y-2">
              {isRunning ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-slate-400">
                  <div className="w-4 h-4 border-2 border-[#10b981] border-t-transparent rounded-full animate-spin" />
                  <span>Running code against custom input…</span>
                </div>
              ) : runResult ? (
                <div className="space-y-2.5">
                  {/* Stats header */}
                  <div className="flex flex-wrap items-center gap-3 pb-2 border-b border-[#1e2636]">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        runResult.status === 'accepted'
                          ? 'border-[#10b981]/50 bg-[#10b981]/15 text-[#10b981]'
                          : 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {runResult.status
                        ? formatVerdict(runResult.status)
                        : runResult.errorText
                        ? 'Error'
                        : 'Finished'}
                    </span>
                    {runResult.runtime !== undefined && (
                      <span className="text-slate-400">
                        Runtime: <strong className="text-white">{runResult.runtime} ms</strong>
                      </span>
                    )}
                    {runResult.memory !== undefined && (
                      <span className="text-slate-400">
                        Memory: <strong className="text-white">{runResult.memory} KiB</strong>
                      </span>
                    )}
                  </div>

                  {/* Compile error */}
                  {runResult.compile_output?.trim() && (
                    <div className="space-y-1">
                      <span className="text-rose-400 text-[11px] uppercase font-semibold">Compiler Output:</span>
                      <pre className="p-2 rounded bg-black/60 border border-rose-900/40 text-rose-300 overflow-x-auto whitespace-pre">
                        {runResult.compile_output}
                      </pre>
                    </div>
                  )}

                  {/* Stderr */}
                  {runResult.stderr?.trim() && (
                    <div className="space-y-1">
                      <span className="text-rose-400 text-[11px] uppercase font-semibold">Standard Error:</span>
                      <pre className="p-2 rounded bg-black/60 border border-rose-900/40 text-rose-300 overflow-x-auto whitespace-pre">
                        {runResult.stderr}
                      </pre>
                    </div>
                  )}

                  {/* Error text */}
                  {runResult.errorText && (
                    <pre className="p-2 rounded bg-black/60 border border-rose-900/40 text-rose-300 overflow-x-auto whitespace-pre">
                      {runResult.errorText}
                    </pre>
                  )}

                  {/* Standard Output */}
                  {runResult.stdout !== undefined && (
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[11px] uppercase font-semibold">Standard Output:</span>
                      <pre className="p-2.5 rounded bg-black/60 border border-[#1e2636] text-[#10b981] overflow-x-auto whitespace-pre">
                        {runResult.stdout || '(Program completed without output)'}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
                  Click "Run" to test your code against custom input.
                </div>
              )}
            </div>
          )}

          {consoleTab === 'latest_result' && (
            <div className="h-full overflow-y-auto">
              <ProblemVerdictTab
                activeSubmission={activeSubmission}
                onRetryPolling={onRetryPolling}
                compact={true}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
