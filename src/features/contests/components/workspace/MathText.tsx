import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  children: string;
  className?: string;
}

const toMarkdownMath = (text: string) => {
  const content = text.startsWith(':::markdown\n') ? text.slice(':::markdown\n'.length) : text;
  return content
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    .replace(/\\\[/g, () => '$$')
    .replace(/\\\]/g, () => '$$');
};

export const MathText: React.FC<MathTextProps> = ({ children, className }) => (
  <div className={`question-markdown ${className ?? ''}`}>
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {toMarkdownMath(children)}
    </ReactMarkdown>
  </div>
);
