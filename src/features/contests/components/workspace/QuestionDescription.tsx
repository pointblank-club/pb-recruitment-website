import { useState } from 'react';
import { MathText } from './MathText';

interface QuestionDescriptionProps {
  children: string;
  isAdmin?: boolean;
  className?: string;
}

const getRawDescription = (text: string) =>
  text.startsWith(':::markdown\n') ? text.slice(':::markdown\n'.length) : text;

export const QuestionDescription = ({ children, isAdmin = false, className }: QuestionDescriptionProps) => {
  const [mode, setMode] = useState<'rendered' | 'raw'>('rendered');
  const rawDescription = getRawDescription(children);

  return (
    <div className="space-y-2">
      {isAdmin && (
        <div className="flex justify-end">
          <div className="inline-flex rounded-md border border-gray-600 bg-gray-950 p-1" role="group" aria-label="Question description view">
            <button
              type="button"
              aria-pressed={mode === 'rendered'}
              onClick={() => setMode('rendered')}
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${mode === 'rendered' ? 'bg-green-500 text-gray-950' : 'text-gray-300 hover:bg-gray-800'}`}
            >
              Rendered
            </button>
            <button
              type="button"
              aria-pressed={mode === 'raw'}
              onClick={() => setMode('raw')}
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${mode === 'raw' ? 'bg-green-500 text-gray-950' : 'text-gray-300 hover:bg-gray-800'}`}
            >
              RAW
            </button>
          </div>
        </div>
      )}
      {mode === 'raw' && isAdmin ? (
        <div className={`whitespace-pre-wrap break-words ${className ?? ''}`}>{rawDescription}</div>
      ) : (
        <MathText className={className}>{children}</MathText>
      )}
    </div>
  );
};
