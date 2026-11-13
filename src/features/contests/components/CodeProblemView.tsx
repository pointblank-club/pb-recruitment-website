import React, { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { setProblemAttempted } from '@/lib/contestStorage';
import { useCodeDraft } from '../hooks/useCodeDraft';
import { useRequestCooldown } from '../hooks/useRequestCooldown';
import { preventClipboardAction, preventContextMenu, preventClipboardShortcut } from '../clipboardGuards';
import {
  Play,
  Send,
  Copy,
  Check,
  Lock,
  RotateCcw,
  PanelRightOpen,
  PanelRightClose,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Activity,
} from 'lucide-react';
import type { Problem } from '../problem.types';
import type {
  RunCodeResponse,
  SubmissionDetailsResponse,
} from '@/services/api/contestApi';
import type { ActiveSubmission } from '../hooks/useProblemSubmissions';
import { formatVerdict, getVerdictClasses } from '../submissionUtils';
import { ProblemStatementTab } from './workspace/ProblemStatementTab';
import { ProblemSubmissionsTab } from './workspace/ProblemSubmissionsTab';
import { ProblemVerdictTab } from './workspace/ProblemVerdictTab';
import { WorkspaceConsoleDrawer, type ConsoleRunResult } from './workspace/WorkspaceConsoleDrawer';

interface CodeProblemViewProps {
  problem: Problem;
  contestId?: string;
  onSubmit?: (code: string, language: string) => Promise<void>;
  onRun?: (code: string, language: string, stdin: string) => Promise<RunCodeResponse>;
  isContestEnded?: boolean;
  hideIDE?: boolean;
  isLocked?: boolean;
  lockReason?: 'ended' | 'tab_switch';
  isRestrictionsActive?: boolean;
  activeSubmission?: ActiveSubmission;
  history?: SubmissionDetailsResponse[];
  historyError?: string | null;
  isHistoryLoading?: boolean;
  hasMoreHistory?: boolean;
  onRetryPolling?: () => void;
  onRefreshHistory?: () => void;
  onLoadMoreHistory?: () => void;
  prevProblemId?: string | null;
  nextProblemId?: string | null;
  codeIndex?: number;
  totalCodes?: number;
  onNavigate?: (targetProblemId: string) => void;
  isAdmin?: boolean;
}

const SUPPORTED_LANGUAGES = [
  { value: 'cpp', label: 'C++ 17', monacoValue: 'cpp' },
  { value: 'python', label: 'Python 3', monacoValue: 'python' },
  { value: 'java', label: 'Java 11', monacoValue: 'java' },
  { value: 'javascript', label: 'JavaScript', monacoValue: 'javascript' },
  { value: 'c', label: 'C', monacoValue: 'c' },
] as const;

const DEFAULT_CODE_TEMPLATES: Record<string, string> = {
  cpp: `#include <iostream>
using namespace std;

int main() {
    // Your code here
    return 0;
}`,
  python: `# Your code here
def main():
    pass

if __name__ == "__main__":
    main()`,
  java: `public class Main {
    public static void main(String[] args) {
        // Your code here
    }
}`,
  javascript: `// Your code here
function main() {
    
}

main();`,
  c: `#include <stdio.h>

int main() {
    // Your code here
    return 0;
}`,
};

const getRunErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) return 'Code execution service is currently disabled on the server.';
    if (error.response?.status === 401) return 'You must be logged in to execute code.';
    const responseData: unknown = error.response?.data;
    if (typeof responseData === 'object' && responseData !== null) {
      const data = responseData as Record<string, unknown>;
      if (typeof data.error === 'string') return data.error;
      if (typeof data.message === 'string') return data.message;
    }
    if (error.message) return error.message;
  }
  return error instanceof Error ? error.message : 'Code execution failed. Please try again.';
};

export const CodeProblemView: React.FC<CodeProblemViewProps> = ({
  problem,
  contestId,
  onSubmit,
  onRun,
  hideIDE = false,
  isLocked = false,
  lockReason = 'ended',
  isContestEnded = false,
  isRestrictionsActive = false,
  activeSubmission = { phase: 'idle' },
  history = [],
  historyError = null,
  isHistoryLoading = false,
  hasMoreHistory = false,
  onRetryPolling,
  onRefreshHistory,
  onLoadMoreHistory,
  prevProblemId,
  nextProblemId,
  codeIndex,
  totalCodes,
  onNavigate,
  isAdmin = false,
}) => {
  const { user } = useAuth();
  const {
    selectedLanguage,
    setSelectedLanguage,
    codeByLanguage,
    setCodeByLanguage,
    customInput,
    setCustomInput,
  } = useCodeDraft({
    contestId: contestId || problem.contest_id || 'general',
    problemId: problem.id,
    userId: user?.uid || 'guest',
    defaultTemplates: DEFAULT_CODE_TEMPLATES,
    defaultLanguage: 'cpp',
    defaultInput: problem.examples?.[0]?.input || '',
    enabled: !hideIDE,
  });
  const code = codeByLanguage[selectedLanguage] || '';

  // Left Pane State (Statement | Submissions | Latest Result)
  const [leftTab, setLeftTab] = useState<'statement' | 'submissions' | 'latest_result'>('statement');
  const [isLeftMaximized, setIsLeftMaximized] = useState(false);

  // Right Pane Console Drawer State (Input | Output | Latest Result)
  const [consoleTab, setConsoleTab] = useState<'input' | 'output' | 'latest_result'>('input');
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(230);

  // Custom Input & Run state
  const [runResult, setRunResult] = useState<ConsoleRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isCoolingDown: runCooldown, coolDown: coolDownRun } = useRequestCooldown();
  const { isCoolingDown: submitCooldown, coolDown: coolDownSubmit } = useRequestCooldown();

  // Clipboard feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Pane resizing
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState<number>(46);
  const [isResizingH, setIsResizingH] = useState(false);
  const [isResizingV, setIsResizingV] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const inputRevisionRef = useRef(0);

  const invalidateRun = useCallback(() => {
    inputRevisionRef.current += 1;
    setRunResult(null);
  }, []);

  const handleLanguageChange = useCallback((newLanguage: string) => {
    invalidateRun();
    setSelectedLanguage(newLanguage);
  }, [invalidateRun, setSelectedLanguage]);

  const handleCodeChange = useCallback((value: string | undefined) => {
    invalidateRun();
    setCodeByLanguage((current) => ({
      ...current,
      [selectedLanguage]: value || '',
    }));
  }, [invalidateRun, selectedLanguage, setCodeByLanguage]);

  const handleResetCode = useCallback(() => {
    if (isLocked) return;
    const defaultTemplate = DEFAULT_CODE_TEMPLATES[selectedLanguage] || '';
    handleCodeChange(defaultTemplate);
  }, [handleCodeChange, isLocked, selectedLanguage]);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleLoadSampleIntoCustomInput = useCallback((input: string) => {
    invalidateRun();
    setCustomInput(input);
    setRunResult(null);
    setConsoleTab('input');
    setIsConsoleCollapsed(false);
  }, [invalidateRun, setCustomInput]);

  // Run Code logic
  const handleRunCode = useCallback(async () => {
    if (isRunning || runCooldown) return;
    if (!code.trim()) {
      setRunResult({ errorText: 'Code is empty.' });
      setConsoleTab('output');
      setIsConsoleCollapsed(false);
      return;
    }
    if (!onRun) {
      setRunResult({ errorText: 'Code execution is unavailable right now.' });
      setConsoleTab('output');
      setIsConsoleCollapsed(false);
      return;
    }

    setIsRunning(true);
    setConsoleTab('output');
    setIsConsoleCollapsed(false);
    setRunResult(null);
    const inputRevision = inputRevisionRef.current;
    if (user) setProblemAttempted(problem.contest_id, user.uid, problem.id);

    try {
      const result = await onRun(code, selectedLanguage, customInput);
      if (inputRevision !== inputRevisionRef.current) return;
      setRunResult({
        status: result.status,
        runtime: result.runtime,
        memory: result.memory,
        stdout: result.stdout,
        stderr: result.stderr,
        compile_output: result.compile_output,
      });
    } catch (error) {
      coolDownRun(error);
      if (inputRevision !== inputRevisionRef.current) return;
      setRunResult({ errorText: getRunErrorMessage(error) });
    } finally {
      setIsRunning(false);
    }
  }, [code, customInput, onRun, selectedLanguage, problem.contest_id, problem.id, user, isRunning, runCooldown, coolDownRun]);

  // Submit Code logic
  const handleSubmit = async () => {
    if (isSubmitting || submitCooldown) return;
    if (!onSubmit) {
      console.log('Submitting code:', { code, language: selectedLanguage });
      return;
    }

    try {
      setIsSubmitting(true);
      setIsConsoleCollapsed(false);
      setConsoleTab('latest_result');
      await onSubmit(code, selectedLanguage);
    } catch (error) {
      coolDownSubmit(error);
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Horizontal Pane Split Drag (Left vs Right)
  useEffect(() => {
    if (!isResizingH) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const bounds = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - bounds.left;
      const minLeftPx = 280;
      const minRightPx = 320;
      const minPct = Math.max(25, (minLeftPx / bounds.width) * 100);
      const maxPct = Math.min(68, ((bounds.width - minRightPx) / bounds.width) * 100);
      const pct = (relativeX / bounds.width) * 100;
      const clamped = Math.max(minPct, Math.min(Math.max(minPct, maxPct), pct));
      setLeftPaneWidthPct(clamped);
      setIsLeftMaximized(false);
    };

    const handleMouseUp = () => {
      setIsResizingH(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingH]);

  // Vertical Console Drawer Drag (Editor vs Drawer)
  useEffect(() => {
    if (!isResizingV) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!rightPaneRef.current) return;
      const bounds = rightPaneRef.current.getBoundingClientRect();
      const relativeY = bounds.bottom - e.clientY;
      const clamped = Math.max(80, Math.min(bounds.height - 120, relativeY));
      setConsoleHeight(clamped);
      if (isConsoleCollapsed) setIsConsoleCollapsed(false);
    };

    const handleMouseUp = () => {
      setIsResizingV(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isConsoleCollapsed, isResizingV]);

  const toggleMaximizeLeft = () => {
    if (isLeftMaximized) {
      setLeftPaneWidthPct(46);
      setIsLeftMaximized(false);
    } else {
      let maxPct = 62;
      if (containerRef.current) {
        const width = containerRef.current.getBoundingClientRect().width;
        if (width > 0) {
          const calculated = ((width - 340) / width) * 100;
          maxPct = Math.max(50, Math.min(62, Math.floor(calculated)));
        }
      }
      setLeftPaneWidthPct(maxPct);
      setIsLeftMaximized(true);
    }
  };

  const sample1 = problem.examples && problem.examples.length > 0 ? problem.examples[0] : null;

  return (
    <div
      className="flex-1 min-h-0 flex flex-col bg-[#05070a] text-slate-200 overflow-hidden font-['DM_Sans'] select-text"
      onCopyCapture={isContestEnded ? undefined : preventClipboardAction}
      onCutCapture={isContestEnded ? undefined : preventClipboardAction}
      onPasteCapture={isContestEnded ? undefined : preventClipboardAction}
      onKeyDownCapture={isContestEnded ? undefined : preventClipboardShortcut}
      onContextMenu={isContestEnded ? undefined : preventContextMenu}
    >
      {/* Main Split Workspace Container */}
      <div
        ref={containerRef}
        id="workspaceContainer"
        className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden"
      >
        {/* ========================================================= */}
        {/* LEFT PANE: Tabbed Problem Context                         */}
        {/* ========================================================= */}
        <div
          className={`w-full md:w-[var(--left-pane-width)] flex flex-col min-h-[300px] md:min-h-0 ${
            hideIDE ? 'h-full' : 'h-1/2 md:h-full'
          } overflow-hidden bg-[#090d14] ${
            hideIDE ? '' : 'border-b md:border-b-0'
          } md:border-r border-[#1e2636] shrink-0 md:shrink`}
          style={{ '--left-pane-width': hideIDE ? '100%' : `${leftPaneWidthPct}%` } as React.CSSProperties}
        >
          {/* Left Pane Top Tab Bar */}
          <div className="h-10 bg-[#0b0f17] border-b border-[#1e2636] flex items-center justify-between px-2 flex-shrink-0 gap-2">
            <div className="flex items-center gap-1 h-full min-w-0 overflow-x-auto flex-1 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {/* Tab 1: Statement */}
              <button
                type="button"
                onClick={() => setLeftTab('statement')}
                className={`relative px-3.5 h-full text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                  leftTab === 'statement' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Statement</span>
                {leftTab === 'statement' && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#10b981]" />
                )}
              </button>

              {/* Tab 2: Submissions */}
              {!hideIDE && (
                <button
                  type="button"
                  onClick={() => setLeftTab('submissions')}
                  className={`relative px-3.5 h-full text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                    leftTab === 'submissions' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Submissions</span>
                  {history.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-[#141b29] text-[#10b981] border border-[#1e2636]">
                      {history.length}
                    </span>
                  )}
                  {leftTab === 'submissions' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#10b981]" />
                  )}
                </button>
              )}

              {/* Tab 3: Latest Result */}
              {!hideIDE && (
                <button
                  type="button"
                  onClick={() => setLeftTab('latest_result')}
                  className={`relative px-3.5 h-full text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                    leftTab === 'latest_result' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Latest Result</span>
                  {activeSubmission.status && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${getVerdictClasses(
                        activeSubmission.status,
                      )}`}
                    >
                      {formatVerdict(activeSubmission.status)}
                    </span>
                  )}
                  {leftTab === 'latest_result' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#10b981]" />
                  )}
                </button>
              )}
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Maximize / Restore width toggle */}
              {!hideIDE && (
                <button
                  type="button"
                  onClick={toggleMaximizeLeft}
                  title={isLeftMaximized ? 'Restore Split View' : 'Maximize Statement Width'}
                  className="p-1.5 rounded hover:bg-[#141b29] text-gray-400 hover:text-white transition-colors shrink-0"
                >
                  {isLeftMaximized ? (
                    <PanelRightOpen className="w-4 h-4 text-[#10b981]" />
                  ) : (
                    <PanelRightClose className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Left Pane Content Area */}
          <div className="code-viewer-scrollbar flex-1 overflow-y-auto p-5">
            {leftTab === 'statement' && (
              <ProblemStatementTab
                problem={problem}
                isAdmin={isAdmin}
                hideIDE={hideIDE}
                isRestrictionsActive={isRestrictionsActive}
                copiedId={copiedId}
                onCopy={handleCopy}
                onLoadSample={handleLoadSampleIntoCustomInput}
              />
            )}

            {leftTab === 'submissions' && (
              <ProblemSubmissionsTab
                history={history}
                historyError={historyError}
                isHistoryLoading={isHistoryLoading}
                hasMoreHistory={hasMoreHistory}
                onRefreshHistory={onRefreshHistory}
                onLoadMoreHistory={onLoadMoreHistory}
              />
            )}

            {leftTab === 'latest_result' && (
              <ProblemVerdictTab
                activeSubmission={activeSubmission}
                onRetryPolling={onRetryPolling}
                compact={false}
              />
            )}
          </div>

          {/* Bottom Fixed Navigation Bar - Outside the description box and below it */}
          {totalCodes !== undefined && totalCodes > 1 && (
            <div className="h-12 bg-[#0b0f17] border-t border-[#1e2636] px-2.5 flex items-center justify-between flex-shrink-0 gap-2">
              <button
                type="button"
                disabled={!prevProblemId}
                onClick={() => prevProblemId && onNavigate?.(prevProblemId)}
                title="Previous Question"
                className="h-8 px-2.5 rounded-[4px] text-xs font-medium flex items-center gap-1 transition-colors bg-[#141b29] text-slate-200 border border-[#243047] hover:bg-[#1e293b] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#141b29] disabled:hover:text-slate-200 shrink-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              {codeIndex !== undefined && (
                <span className="text-xs text-gray-400 font-mono truncate text-center">
                  {codeIndex} / {totalCodes}
                </span>
              )}

              <button
                type="button"
                disabled={!nextProblemId}
                onClick={() => nextProblemId && onNavigate?.(nextProblemId)}
                title="Next Question"
                className="h-8 px-2.5 rounded-[4px] text-xs font-medium flex items-center gap-1 transition-colors bg-[#141b29] text-slate-200 border border-[#243047] hover:bg-[#1e293b] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#141b29] disabled:hover:text-slate-200 shrink-0"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* VERTICAL DRAG RESIZER (Left vs Right)                     */}
        {/* ========================================================= */}
        {!hideIDE && (
          <div
            onMouseDown={() => setIsResizingH(true)}
            className="hidden md:flex w-[5px] cursor-col-resize hover:bg-[#10b981] active:bg-[#10b981] bg-[#1e2636] transition-colors flex-shrink-0 z-10"
            title="Drag to resize split"
          />
        )}

        {/* ========================================================= */}
        {/* RIGHT PANE: CodeChef-Style IDE & Collapsible Drawer       */}
        {/* ========================================================= */}
        {!hideIDE && (
          <div
            ref={rightPaneRef}
            className="w-full md:w-auto flex-1 flex flex-col min-h-[400px] md:min-h-0 min-w-0 md:min-w-[320px] overflow-hidden bg-[#090d14]"
          >
            {/* Top Toolbar */}
            <div className="min-h-12 h-auto py-2 bg-[#0b0f17] border-b border-[#1e2636] px-3 md:px-4 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
              {/* Left side: Language selector & helpers */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  disabled={isLocked}
                  className="bg-[#141b29] border border-[#28354d] text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-[#10b981] font-mono cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>
                      {lang.label}
                    </option>
                  ))}
                </select>

                {!isLocked && (
                  <button
                    type="button"
                    onClick={handleResetCode}
                    title="Reset to default template"
                    className="p-1.5 rounded hover:bg-[#141b29] text-gray-400 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}

                {!isRestrictionsActive && (
                  <button
                    type="button"
                    onClick={() => handleCopy(code, 'editor-code')}
                    title="Copy code"
                    className="p-1.5 rounded hover:bg-[#141b29] text-gray-400 hover:text-white transition-colors"
                  >
                    {copiedId === 'editor-code' ? (
                      <Check className="w-3.5 h-3.5 text-[#10b981]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>

              {/* Right side: Action buttons */}
              {isLocked ? (
                <div className="flex items-center gap-1.5 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-3 py-1 rounded shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{lockReason === 'tab_switch' ? 'Session Locked · Read Only' : 'Contest Ended · Read Only'}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 shrink-0">
                  <Button
                    onClick={handleRunCode}
                    disabled={isRunning || runCooldown || !code.trim()}
                    size="sm"
                    className="h-8 px-3.5 text-xs font-semibold bg-[#ffffff] hover:bg-slate-200 text-[#090d14] flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    {isRunning ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-[#090d14] border-t-transparent" />
                        <span>Running…</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-[#090d14]" />
                        <span>{runCooldown ? 'Run · Wait' : 'Run'}</span>
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || submitCooldown}
                    size="sm"
                    className="h-8 px-4 text-xs font-semibold bg-[#16a34a] hover:bg-[#15803d] text-white flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                        <span>Submitting…</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{submitCooldown ? 'Submit · Wait' : 'Submit'}</span>
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Monaco Code Editor */}
            <div className="code-viewer-scrollbar flex-1 min-h-0 relative bg-[#06080d]">
              <Editor
                height="100%"
                language={
                  SUPPORTED_LANGUAGES.find((l) => l.value === selectedLanguage)?.monacoValue || 'cpp'
                }
                value={code}
                onChange={handleCodeChange}
                theme="vs-dark"
                options={{
                  readOnly: isLocked,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 4,
                  wordWrap: 'on',
                  cursorBlinking: 'smooth',
                  smoothScrolling: true,
                  padding: { top: 12, bottom: 12 },
                  contextmenu: false,
                  folding: true,
                }}
              />
            </div>

            {/* Horizontal Drag Resizer (Editor vs Console Drawer) */}
            <div
              onMouseDown={() => setIsResizingV(true)}
              className="h-[5px] cursor-row-resize bg-[#1e2636] hover:bg-[#10b981] active:bg-[#10b981] transition-colors flex-shrink-0 z-10"
              title="Drag to resize console drawer"
            />

            {/* Collapsible Bottom Console Drawer */}
            <WorkspaceConsoleDrawer
              consoleTab={consoleTab}
              setConsoleTab={setConsoleTab}
              isConsoleCollapsed={isConsoleCollapsed}
              setIsConsoleCollapsed={setIsConsoleCollapsed}
              consoleHeight={consoleHeight}
              customInput={customInput}
              setCustomInput={setCustomInput}
              isLocked={isLocked}
              lockReason={lockReason}
              sampleInput={sample1?.input}
              isRunning={isRunning}
              runResult={runResult}
              activeSubmission={activeSubmission}
              onRetryPolling={onRetryPolling}
              onInvalidateRun={invalidateRun}
              isResizing={isResizingV}
            />
          </div>
        )}
      </div>
    </div>
  );
};
