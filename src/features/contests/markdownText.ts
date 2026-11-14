import { unified } from 'unified';
import remarkParse from 'remark-parse';

const MARKDOWN_PREFIX = /^:::markdown(?:\r?\n|$)/;

export const getQuestionTextBody = (text: string) => text.replace(MARKDOWN_PREFIX, '');

interface PositionedNode {
  type: string;
  url?: string;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
  children?: PositionedNode[];
}

interface SourceRange {
  start: number;
  end: number;
}

interface SourceEdit extends SourceRange {
  replacement: string;
}

const markdownParser = unified().use(remarkParse);

const getProtectedRanges = (markdown: string): SourceRange[] => {
  const ranges: SourceRange[] = [];
  const visit = (node: PositionedNode) => {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;

    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'image' || node.type === 'imageReference' || node.type === 'definition' || node.type === 'html') {
      if (start !== undefined && end !== undefined) ranges.push({ start, end });
      return;
    }

    if (node.type === 'link') {
      const source = start !== undefined && end !== undefined ? markdown.slice(start, end) : '';
      // Explicit link labels may contain math, but autolinks are URLs and stay untouched.
      if (!source.startsWith('[')) {
        if (start !== undefined && end !== undefined) ranges.push({ start, end });
        return;
      }
    }
    node.children?.forEach(visit);
  };

  visit(markdownParser.parse(markdown) as unknown as PositionedNode);
  for (const match of markdown.matchAll(/\bhttps?:\/\/[^\s<>()]+/gi)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
  return ranges.sort((left, right) => left.start - right.start);
};

const getContainerPrefixes = (source: string, offset: number) => {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const linePrefix = source.slice(lineStart, offset);
  const containerPrefix = linePrefix.match(/^(?: {0,3}> ?)*(?: {0,3}(?:[-+*]|\d+[.)]) +)?$/)?.[0] ?? '';
  const continuationPrefix = containerPrefix.replace(/([-+*]|\d+[.)]) +$/, (marker) => ' '.repeat(marker.length));
  return { lineStart, containerPrefix, continuationPrefix };
};

const isEscaped = (source: string, offset: number) => offset > 0 && source[offset - 1] === '\\';

const convertVisibleMath = (markdown: string) => {
  const edits: SourceEdit[] = [];
  let converted = false;
  const delimiters = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
  const protectedRanges = getProtectedRanges(markdown);

  let match: RegExpExecArray | null;
  while ((match = delimiters.exec(markdown)) !== null) {
      const absoluteStart = match.index;
      const absoluteEnd = absoluteStart + match[0].length;
      if (protectedRanges.some((range) => absoluteStart < range.end && absoluteEnd > range.start)) continue;
      const open = match[0].startsWith('\\[') ? '[' : '(';
      const closeStart = absoluteStart + match[0].lastIndexOf(open === '[' ? '\\]' : '\\)');
      if (isEscaped(markdown, absoluteStart) || isEscaped(markdown, closeStart)) continue;

      if (open === '(') {
        edits.push({
          start: absoluteStart,
          end: absoluteEnd,
          replacement: `$${match[2]}$`,
        });
      } else {
        const { lineStart, containerPrefix, continuationPrefix } = getContainerPrefixes(markdown, absoluteStart);
        const content = (match[1] ?? '').split(/\r?\n/).map((line) => (
          continuationPrefix && line.startsWith(continuationPrefix)
            ? line.slice(continuationPrefix.length)
            : line
        )).join('\n').replace(/^\n|\n$/g, '');
        const hasContainerPrefix = containerPrefix.length > 0;
        edits.push({
          start: hasContainerPrefix ? lineStart : absoluteStart,
          end: absoluteEnd,
          replacement: hasContainerPrefix
            ? `${containerPrefix}$$\n${continuationPrefix}${content.split('\n').join(`\n${continuationPrefix}`)}\n${continuationPrefix}$$\n`
            : `\n$$\n${content}\n$$\n`,
        });
      }
      converted = true;
  }

  edits.sort((left, right) => right.start - left.start);
  let output = markdown;
  for (const edit of edits) {
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
  }
  return { text: output, converted };
};

export const prepareQuestionMarkdown = (text: string) => {
  const content = getQuestionTextBody(text);
  const result = convertVisibleMath(content);
  return {
    text: result.text,
    // Paired TeX is an explicit Markdown signal for legacy fields without the marker.
    shouldRender: MARKDOWN_PREFIX.test(text) || result.converted,
  };
};
