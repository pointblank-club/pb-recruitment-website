import { useState, useCallback, useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Play, Send, Copy, Check, Clock, Cpu } from 'lucide-react';
import type { RunCodeResponse } from '@/services/api/contestApi';
import { formatVerdict, getVerdictClasses } from './SubmissionPanel';
import type { Problem } from '../problem.types';

interface CodeProblemViewProps {
  problem: Problem;
  onSubmit?: (code: string, language: string) => Promise<void>;
  onRun?: (code: string, language: string, stdin: string) => Promise<RunCodeResponse>;
  /** hideIDE: unauthenticated visitors – only show problem statement, hide the editor pane */
  hideIDE?: boolean;
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

export const CodeProblemView = ({
  problem,
  onSubmit,
  onRun,
  hideIDE = false,
}: CodeProblemViewProps) => {
  const [selectedLanguage, setSelectedLanguage] = useState('cpp');
  const [codeByLanguage, setCodeByLanguage] = useState<Record<string, string>>(
    () => ({ ...DEFAULT_CODE_TEMPLATES }),
  );
  const [customInput, setCustomInput] = useState(() => problem.examples?.[0]?.input || '');
  const [runResult, setRunResult] = useState<RunCodeResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('input');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editorHeightPct, setEditorHeightPct] = useState<number>(55);
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState<number>(50);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [resizeDirection, setResizeDirection] = useState<'vertical' | 'horizontal' | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRevisionRef = useRef(0);
  const code = codeByLanguage[selectedLanguage] || '';

  const invalidateRun = useCallback(() => {
    inputRevisionRef.current += 1;
    setRunResult(null);
    setRunError(null);
  }, []);

  const handleLanguageChange = useCallback((newLanguage: string) => {
    invalidateRun();
    setSelectedLanguage(newLanguage);
  }, [invalidateRun]);

  const handleCodeChange = useCallback((value: string | undefined) => {
    invalidateRun();
    setCodeByLanguage((current) => ({
      ...current,
      [selectedLanguage]: value || '',
    }));
  }, [invalidateRun, selectedLanguage]);

  const handleRunCode = useCallback(async () => {
    if (!onRun) return;
    if (!code.trim()) {
      setActiveTab('output');
      setRunError('Code cannot be empty');
      setRunResult(null);
      return;
    }

    setIsRunning(true);
    setActiveTab('output');
    setRunError(null);
    setRunResult(null);
    const inputRevision = inputRevisionRef.current;

    try {
      const result = await onRun(code, selectedLanguage, customInput);

      if (inputRevision !== inputRevisionRef.current) return;
      setRunResult(result);
    } catch (err: unknown) {
      if (inputRevision !== inputRevisionRef.current) return;
      console.error('Run code error:', err);
      setRunError(getRunErrorMessage(err));
    } finally {
      setIsRunning(false);
    }
  }, [code, selectedLanguage, customInput, onRun]);

  const handleSubmit = async () => {
    if (!onSubmit) return;

    try {
      setIsSubmitting(true);
      await onSubmit(code, selectedLanguage);
    } catch (error) {
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  }, []);

  useEffect(() => {
    if (!isResizing || resizeDirection !== 'vertical') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!rightPaneRef.current) return;
      const bounds = rightPaneRef.current.getBoundingClientRect();
      const relativeY = e.clientY - bounds.top;
      const pct = (relativeY / bounds.height) * 100;
      const clamped = Math.max(30, Math.min(80, pct));
      setEditorHeightPct(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeDirection]);

  useEffect(() => {
    if (!isResizing || resizeDirection !== 'horizontal') return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const bounds = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - bounds.left;
      const pct = (relativeX / bounds.width) * 100;
      const clamped = Math.max(25, Math.min(75, pct));
      setLeftPaneWidthPct(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDirection(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeDirection]);

  return (
    <div className="flex-1 flex flex-col h-full bg-black text-white overflow-hidden">
      <div ref={containerRef} className="flex-1 flex h-full overflow-hidden">
        <div className="overflow-y-auto h-full border-r border-gray-700" style={{ width: hideIDE ? '100%' : `${leftPaneWidthPct}%` }}>
          <div className="p-6 space-y-6">
            {problem.description && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-white font-['DM_Sans']">
                    Problem Statement
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="px-2 py-1  text-white rounded font-semibold">
                      {problem.score} points
                    </span>
                    {problem.time_limit && (
                      <span className="flex items-center text-white gap-1">
                        {problem.time_limit} ms
                      </span>
                    )}
                    {problem.memory_limit && (
                      <span className="flex items-center text-white gap-1">
                        {problem.memory_limit} MB
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-gray-300 leading-relaxed whitespace-pre-line font-['DM_Sans'] text-sm">
                  {problem.description}
                </p>
              </div>
            )}

            {problem.input_format && (
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-white font-['DM_Sans']">
                  Input Format
                </h2>
                <p className="text-gray-300 font-mono text-xs whitespace-pre-line leading-relaxed">
                  {problem.input_format}
                </p>
              </div>
            )}

            {problem.output_format && (
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-white font-['DM_Sans']">
                  Output Format
                </h2>
                <p className="text-gray-300 font-mono text-xs whitespace-pre-line leading-relaxed">
                  {problem.output_format}
                </p>
              </div>
            )}

            {problem.constraints && problem.constraints.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-base font-semibold text-white font-['DM_Sans']">
                  Constraints
                </h2>
                <ul className="space-y-1 text-gray-300 text-xs">
                  {problem.constraints.map((constraint, index) => (
                    <li key={index} className="font-mono flex items-start gap-2">
                      <span className="text-green-400 mt-0.5">•</span>
                      <span>{constraint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {problem.examples && problem.examples.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-white font-['DM_Sans']">
                  Sample:
                </h3>

                <div className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900/30">
                  <div className="grid grid-cols-2 bg-gray-800/50 border-b border-gray-700">
                    <div className="flex items-center justify-between px-3 py-2 border-r border-gray-700">
                      <span className="text-xs font-medium text-gray-300 font-['DM_Sans']">
                        Input
                      </span>
                      <button
                        onClick={() => handleCopy(problem.examples?.map(e => e.input).join('\n\n') || '', 'all-inputs')}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Copy all inputs"
                      >
                        {copiedText === 'all-inputs' ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs font-medium text-gray-300 font-['DM_Sans']">
                        Output
                      </span>
                      <button
                        onClick={() => handleCopy(problem.examples?.map(e => e.output).join('\n\n') || '', 'all-outputs')}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Copy all outputs"
                      >
                        {copiedText === 'all-outputs' ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2">
                    <div className="border-r border-gray-700 px-3 py-3">
                      <pre className="text-xs font-mono text-gray-200 whitespace-pre-wrap break-words">
                        {problem.examples.map((example, index) => (
                          <span key={`input-${index}`}>
                            {index > 0 && '\n\n'}
                            {example.input}
                          </span>
                        ))}
                      </pre>
                    </div>

                    <div className="px-3 py-3">
                      <pre className="text-xs font-mono text-gray-200 whitespace-pre-wrap break-words">
                        {problem.examples.map((example, index) => (
                          <span key={`output-${index}`}>
                            {index > 0 && '\n\n'}
                            {example.output}
                          </span>
                        ))}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-white font-['DM_Sans']">
                    Explanation:
                  </h3>
                  {problem.examples.map((example, index) => (
                    example.explanation && (
                      <div key={`explanation-${index}`} className="space-y-2">
                        <h4 className="text-xs font-semibold text-gray-300 font-['DM_Sans']">
                          Test case {index + 1}:
                        </h4>
                        <div className="text-xs text-gray-400 leading-relaxed space-y-1 pl-2">
                          {example.explanation.split('\n').map((line, lineIndex) => (
                            <p key={lineIndex} className="flex items-start gap-2">
                              {line.trim().startsWith('•') || line.trim().startsWith('-') ? (
                                <>
                                  <span className="text-gray-500 mt-0.5">•</span>
                                  <span>{line.replace(/^[•-]\s*/, '')}</span>
                                </>
                              ) : line.trim() ? (
                                <span>{line}</span>
                              ) : null}
                            </p>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {!hideIDE && (
          <div
            onMouseDown={() => {
              setIsResizing(true);
              setResizeDirection('horizontal');
            }}
            className="w-1 cursor-ew-resize hover:bg-gray-700 bg-gray-800 flex-shrink-0"
            aria-label="Resize panes"
          />
        )}

        {!hideIDE && (
          <div ref={rightPaneRef} className="flex flex-col overflow-hidden flex-shrink-0" style={{ width: `${100 - leftPaneWidthPct}%` }}>
          <div className="border-b border-gray-700 px-4 py-2 bg-gray-900/50 flex items-center justify-between">
            <select
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-gray-800 border border-gray-600 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-green-400 font-['DM_Sans']"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              {onRun && (
                <Button
                  onClick={handleRunCode}
                  disabled={isRunning || !code.trim()}
                  size="sm"
                  variant="outline"
                  className="text-xs flex items-center gap-1 text-black hover:text-black"
                >
                  {isRunning ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" />
                      Run
                    </>
                  )}
                </Button>
              )}
              {onSubmit && (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  size="sm"
                  className="text-xs flex items-center gap-1 bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      Submit
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="border-b border-gray-700" style={{ height: `${editorHeightPct}%` }}>
            <Editor
              height="100%"
              language={
                SUPPORTED_LANGUAGES.find((l) => l.value === selectedLanguage)
                  ?.monacoValue || 'cpp'
              }
              theme="vs-dark"
              value={code}
              onChange={handleCodeChange}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                wordWrap: 'on',
                padding: { top: 10, bottom: 10 },
              }}
            />
          </div>

          <div className="flex flex-col overflow-hidden" style={{ height: `${100 - editorHeightPct}%` }}>
            <div
              onMouseDown={() => {
                setIsResizing(true);
                setResizeDirection('vertical');
              }}
              className="h-1.5 bg-gray-700 hover:bg-gray-500 cursor-ns-resize"
              aria-label="Resize editor"
            />
            <div className="flex border-b border-gray-700 bg-gray-900/30">
              <button
                onClick={() => setActiveTab('input')}
                className={`px-4 py-2 text-xs font-semibold font-['DM_Sans'] ${
                  activeTab === 'input'
                    ? 'text-green-400 border-b-2 border-green-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Input
              </button>
              <button
                onClick={() => setActiveTab('output')}
                className={`px-4 py-2 text-xs font-semibold font-['DM_Sans'] ${
                  activeTab === 'output'
                    ? 'text-green-400 border-b-2 border-green-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Output
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              {activeTab === 'input' ? (
                <div className="h-full p-3 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400 font-['DM_Sans']">
                      Input (Custom or Sample):
                    </label>
                    {problem.examples && problem.examples.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-500 font-['DM_Sans']">Sample:</span>
                        {problem.examples.map((ex, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              invalidateRun();
                              setCustomInput(ex.input);
                            }}
                            className="px-1.5 py-0.5 text-[10px] rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 font-mono transition-colors"
                            title={`Load sample ${idx + 1}`}
                          >
                            #{idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={customInput}
                    onChange={(e) => {
                      invalidateRun();
                      setCustomInput(e.target.value);
                    }}
                    placeholder="Enter your custom input here..."
                    className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-xs font-mono text-white focus:outline-none focus:border-green-400 resize-none"
                  />
                </div>
              ) : (
                <div className="h-full p-3 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400 font-['DM_Sans']">
                      Output:
                    </label>
                    {runResult && (
                      <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Clock className="w-3 h-3 text-gray-400" />
                          {runResult.runtime} ms
                        </span>
                        <span className="flex items-center gap-1 text-[11px]">
                          <Cpu className="w-3 h-3 text-gray-400" />
                          {runResult.memory} KiB
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getVerdictClasses(runResult.status)}`}>
                          {formatVerdict(runResult.status)}
                        </span>
                      </div>
                    )}
                  </div>
                  {isRunning ? (
                    <div className="flex-1 bg-black border border-gray-700 rounded p-4 flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-green-400 border-t-transparent" />
                      <p className="text-xs text-gray-400 font-['DM_Sans']">
                        Running code against judge...
                      </p>
                    </div>
                  ) : runError ? (
                    <div className="flex-1 bg-black border border-red-900/60 rounded p-3 overflow-auto">
                      <div className="text-xs font-semibold text-red-400 mb-1 font-['DM_Sans']">
                        Execution Error
                      </div>
                      <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap leading-relaxed">
                        {runError}
                      </pre>
                    </div>
                  ) : runResult ? (
                    <div className="flex-1 bg-black border border-gray-700 rounded p-3 overflow-auto space-y-3">
                      {runResult.compile_output && (
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold text-red-400 font-['DM_Sans'] uppercase tracking-wider">
                            Compiler Output
                          </div>
                          <pre className="bg-red-950/20 border border-red-900/40 rounded p-2 text-xs font-mono text-red-300 whitespace-pre-wrap">
                            {runResult.compile_output}
                          </pre>
                        </div>
                      )}
                      {runResult.stderr && (
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold text-yellow-400 font-['DM_Sans'] uppercase tracking-wider">
                            Standard Error
                          </div>
                          <pre className="bg-yellow-950/20 border border-yellow-900/40 rounded p-2 text-xs font-mono text-yellow-300 whitespace-pre-wrap">
                            {runResult.stderr}
                          </pre>
                        </div>
                      )}
                      {runResult.stdout ? (
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold text-gray-400 font-['DM_Sans'] uppercase tracking-wider">
                            Standard Output
                          </div>
                          <pre className="bg-gray-950 border border-gray-800 rounded p-2 text-xs font-mono text-green-300 whitespace-pre-wrap">
                            {runResult.stdout}
                          </pre>
                        </div>
                      ) : !runResult.compile_output && !runResult.stderr ? (
                        <div className="h-full flex items-center justify-center text-xs text-gray-500 font-mono italic">
                          (No output)
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex-1 bg-gray-900 border border-gray-700 rounded p-4 flex items-center justify-center">
                      <p className="text-xs text-gray-500 font-['DM_Sans']">
                        Click "Run" to see the output
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
