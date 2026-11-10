import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  children: string;
  className?: string;
}

export const MathText: React.FC<MathTextProps> = ({ children, className }) => (
  children.startsWith(':::markdown\n') ? (
    <div className={`question-markdown ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children.slice(':::markdown\n'.length)}
      </ReactMarkdown>
    </div>
  ) : (
    <div className={className}>{children}</div>
  )
);
