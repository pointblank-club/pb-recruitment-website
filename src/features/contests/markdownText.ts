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

      // Protect the destination and any title while still allowing math in the label.
      if (start !== undefined && end !== undefined) {
        let depth = 0;
        let labelEnd = -1;
        for (let index = 0; index < source.length; index += 1) {
          if (source[index] === '\\') {
            index += 1;
            continue;
          }
          if (source[index] === '[') depth += 1;
          if (source[index] === ']' && --depth === 0) {
            labelEnd = index;
            break;
          }
        }
        if (labelEnd !== -1 && source[labelEnd + 1] === '(') {
          ranges.push({ start: start + labelEnd + 1, end });
        }
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
  const exactPrefix = linePrefix.match(/^(?: {0,3}> ?)*(?: {0,3}(?:[-+*]|\d+[.)]) +)?$/)?.[0];
  const containerPrefix = exactPrefix ?? linePrefix.match(/^(?:(?: {0,3}> ?)+| {0,3}(?:[-+*]|\d+[.)]) +)+/)?.[0] ?? '';
  const continuationPrefix = containerPrefix.replace(/([-+*]|\d+[.)]) +$/, (marker) => ' '.repeat(marker.length));
  return { lineStart, linePrefix, containerPrefix, continuationPrefix };
};

const isEscaped = (source: string, offset: number) => offset > 0 && source[offset - 1] === '\\';

const convertVisibleMath = (markdown: string) => {
  const edits: SourceEdit[] = [];
  let converted = false;
  const delimiters = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g;
  const protectedRanges = getProtectedRanges(markdown);
  let rangeIndex = 0;
  const searchable = markdown.split('').map((character, index) => {
    while (rangeIndex < protectedRanges.length && protectedRanges[rangeIndex].end <= index) rangeIndex += 1;
    const isProtected = rangeIndex < protectedRanges.length
      && index >= protectedRanges[rangeIndex].start
      && index < protectedRanges[rangeIndex].end;
    return isProtected && character !== '\n' && character !== '\r' ? ' ' : character;
  }).join('');

  let match: RegExpExecArray | null;
  while ((match = delimiters.exec(searchable)) !== null) {
      const absoluteStart = match.index;
      const absoluteEnd = absoluteStart + match[0].length;
      const original = markdown.slice(absoluteStart, absoluteEnd);
      const inlineContent = original.slice(2, -2);
      const open = match[0].startsWith('\\[') ? '[' : '(';
      const closeStart = absoluteStart + original.lastIndexOf(open === '[' ? '\\]' : '\\)');
      if (isEscaped(markdown, absoluteStart) || isEscaped(markdown, closeStart)) continue;

      if (open === '(') {
        edits.push({
          start: absoluteStart,
          end: absoluteEnd,
          replacement: `$${inlineContent}$`,
        });
      } else {
        const { lineStart, linePrefix, containerPrefix, continuationPrefix } = getContainerPrefixes(markdown, absoluteStart);
        const content = inlineContent.split(/\r?\n/).map((line) => (
          continuationPrefix && line.startsWith(continuationPrefix)
            ? line.slice(continuationPrefix.length)
            : line
        )).join('\n').replace(/^\n|\n$/g, '');
        const hasContainerPrefix = containerPrefix.length > 0;
        const hasSurroundingProse = linePrefix !== containerPrefix;
        edits.push({
          start: hasContainerPrefix && linePrefix === containerPrefix ? lineStart : absoluteStart,
          end: absoluteEnd,
          replacement: hasContainerPrefix
            ? `${hasSurroundingProse ? '\n\n' : ''}${containerPrefix}$$\n${continuationPrefix}${content.split('\n').join(`\n${continuationPrefix}`)}\n${continuationPrefix}$$${hasSurroundingProse ? '\n\n' : '\n'}${hasSurroundingProse ? continuationPrefix : ''}`
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
