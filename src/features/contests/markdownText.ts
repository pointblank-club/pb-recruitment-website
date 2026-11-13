import { unified } from 'unified';
import remarkParse from 'remark-parse';

const MARKDOWN_PREFIX = /^:::markdown(?:\r?\n|$)/;

export const getQuestionTextBody = (text: string) => text.replace(MARKDOWN_PREFIX, '');

interface PositionedNode {
  type: string;
  position?: {
    start?: { offset?: number };
    end?: { offset?: number };
  };
  children?: PositionedNode[];
}

const markdownParser = unified().use(remarkParse);

const getCodeRanges = (markdown: string) => {
  const ranges: Array<{ start: number; end: number }> = [];
  const visit = (node: PositionedNode) => {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if ((node.type === 'code' || node.type === 'inlineCode') && start !== undefined && end !== undefined) {
      ranges.push({ start, end });
      return;
    }
    node.children?.forEach(visit);
  };

  visit(markdownParser.parse(markdown) as unknown as PositionedNode);
  return ranges.sort((left, right) => left.start - right.start);
};

const convertMathDelimiters = (markdown: string) => {
  let converted = false;
  const convertSegment = (segment: string) => segment
    .replace(/\\\[([\s\S]*?)\\\]/g, (match, expression: string, offset: number, source: string) => {
      const closeStart = offset + match.lastIndexOf('\\]');
      if ((offset > 0 && source[offset - 1] === '\\') || (closeStart > 0 && source[closeStart - 1] === '\\')) return match;
      converted = true;
      return `\n$$\n${expression}\n$$\n`;
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (match, expression: string, offset: number, source: string) => {
      const closeStart = offset + match.lastIndexOf('\\)');
      if ((offset > 0 && source[offset - 1] === '\\') || (closeStart > 0 && source[closeStart - 1] === '\\')) return match;
      converted = true;
      return `$${expression}$`;
    });

  const ranges = getCodeRanges(markdown);
  let cursor = 0;
  let output = '';
  for (const range of ranges) {
    output += convertSegment(markdown.slice(cursor, range.start));
    output += markdown.slice(range.start, range.end);
    cursor = range.end;
  }
  output += convertSegment(markdown.slice(cursor));
  return { text: output, converted };
};

export const prepareQuestionMarkdown = (text: string) => {
  const content = getQuestionTextBody(text);
  const result = convertMathDelimiters(content);
  return {
    text: result.text,
    // Paired TeX is an explicit Markdown signal for legacy fields without the marker.
    shouldRender: MARKDOWN_PREFIX.test(text) || result.converted,
  };
};
