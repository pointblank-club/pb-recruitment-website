import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  children: string;
  className?: string;
}

const MARKDOWN_PREFIX = /^:::markdown(?:\r?\n|$)/;
type CodeFence = { character: '`' | '~'; length: number };

export const getQuestionTextBody = (text: string) => text.replace(MARKDOWN_PREFIX, '');

const findMathClose = (text: string, start: number, close: ')' | ']') => {
  for (let index = start; index < text.length;) {
    if (text[index] === '`') {
      const ticks = text.slice(index).match(/^`+/)?.[0] ?? '`';
      const closingTicks = text.indexOf(ticks, index + ticks.length);
      if (closingTicks >= 0) {
        index = closingTicks + ticks.length;
        continue;
      }
    }

    if (text[index] === '\\') {
      let end = index + 1;
      while (text[end] === '\\') end += 1;
      if (end === index + 1 && text[end] === close) return { start: index, end: end + 1 };
      index = end;
      continue;
    }
    index += 1;
  }
  return null;
};

const convertDisplayMathBlocks = (markdown: string) => {
  const lines = markdown.split(/(?<=\n)/);
  const output: string[] = [];
  let fence: CodeFence | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const content = line.replace(/\r?\n$/, '');
    const fenceMatch = content.match(/^ {0,3}(`{3,}|~{3,})/);

    if (fence) {
      const isClosing = fenceMatch
        && fenceMatch[1][0] === fence.character
        && fenceMatch[1].length >= fence.length
        && new RegExp(`^ {0,3}${fence.character === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(content);
      if (isClosing) fence = null;
      output.push(line);
      continue;
    }

    if (fenceMatch) {
      fence = { character: fenceMatch[1][0] as '`' | '~', length: fenceMatch[1].length };
      output.push(line);
      continue;
    }

    if (/^(?: {4,}|\t)/.test(content)) {
      output.push(line);
      continue;
    }

    if (content.trim() === '\\[') {
      let closeIndex = index + 1;
      let innerFence: CodeFence | null = null;
      for (; closeIndex < lines.length; closeIndex += 1) {
        const candidate = lines[closeIndex].replace(/\r?\n$/, '');
        const candidateFence = candidate.match(/^ {0,3}(`{3,}|~{3,})/);
        if (innerFence) {
          const closesInnerFence = candidateFence
            && candidateFence[1][0] === innerFence.character
            && candidateFence[1].length >= innerFence.length
            && new RegExp(`^ {0,3}${innerFence.character === '`' ? '`' : '~'}{${innerFence.length},}\\s*$`).test(candidate);
          if (closesInnerFence) innerFence = null;
          continue;
        }
        if (candidateFence) {
          innerFence = { character: candidateFence[1][0] as '`' | '~', length: candidateFence[1].length };
          continue;
        }
        if (candidate.trim() === '\\]') break;
      }

      if (closeIndex < lines.length) {
        const ending = line.match(/\r?\n$/)?.[0] ?? '\n';
        const closingLine = lines[closeIndex];
        const closingEnding = closingLine.match(/\r?\n$/)?.[0] ?? '';
        output.push(`$$${ending}`);
        output.push(...lines.slice(index + 1, closeIndex));
        output.push(`$$${closingEnding}`);
        index = closeIndex;
        continue;
      }
    }

    output.push(line);
  }

  return output.join('');
};

const convertTexDelimiters = (markdown: string) => {
  markdown = convertDisplayMathBlocks(markdown);
  let fence: CodeFence | null = null;
  return markdown.split(/(?<=\n)/).map((line) => {
    const lineContent = line.replace(/\r?\n$/, '');
    const fenceMatch = lineContent.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      const isClosingFence = fenceMatch
        && fenceMatch[1][0] === fence.character
        && fenceMatch[1].length >= fence.length
        && new RegExp(`^ {0,3}${fence.character === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(lineContent);
      if (isClosingFence) {
        fence = null;
      }
      return line;
    }
    if (fenceMatch) {
      fence = { character: fenceMatch[1][0] as '`' | '~', length: fenceMatch[1].length };
      return line;
    }
    if (/^(?: {4,}|\t)/.test(lineContent)) return line;

    const lineEnding = line.slice(lineContent.length);
    let output = '';
    for (let index = 0; index < lineContent.length;) {
      if (lineContent[index] === '`') {
        const ticks = lineContent.slice(index).match(/^`+/)?.[0] ?? '`';
        const closingTicks = lineContent.indexOf(ticks, index + ticks.length);
        if (closingTicks >= 0) {
          const end = closingTicks + ticks.length;
          output += lineContent.slice(index, end);
          index = end;
          continue;
        }
      }

      if (lineContent[index] === '\\') {
        let slashEnd = index + 1;
        while (lineContent[slashEnd] === '\\') slashEnd += 1;
        const slashCount = slashEnd - index;
        const open = lineContent[slashEnd];
        if (slashCount === 1 && (open === '(' || open === '[')) {
          const close = open === '(' ? ')' : ']';
          const match = findMathClose(lineContent, slashEnd + 1, close);
          if (match) {
            const expression = lineContent.slice(slashEnd + 1, match.start);
            if (open === '(') {
              output += `$${expression}$`;
            } else {
              output += `\n$$\n${expression}\n$$\n`;
            }
            index = match.end;
            continue;
          }
        }
        output += lineContent.slice(index, slashEnd);
        index = slashEnd;
        continue;
      }

      output += lineContent[index];
      index += 1;
    }
    return output + lineEnding;
  }).join('');
};

export const MathText: React.FC<MathTextProps> = ({ children, className }) => {
  const content = getQuestionTextBody(children);
  const renderedContent = convertTexDelimiters(content);
  // A paired TeX delimiter outside code is an explicit signal to render this text,
  // even when older question records do not have the Markdown prefix.
  const isMarkdown = MARKDOWN_PREFIX.test(children) || renderedContent !== content;

  return isMarkdown ? (
    <div className={`question-markdown ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {renderedContent}
      </ReactMarkdown>
    </div>
  ) : (
    <div className={className}>{children}</div>
  );
};
