import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { prepareQuestionMarkdown } from '../../markdownText';

interface MathTextProps {
  children: string;
  className?: string;
}

export const MathText: React.FC<MathTextProps> = ({ children, className }) => {
  const markdown = prepareQuestionMarkdown(children);

  return markdown.shouldRender ? (
    <div className={`question-markdown ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {markdown.text}
      </ReactMarkdown>
    </div>
  ) : (
    <div className={className}>{children}</div>
  );
};
