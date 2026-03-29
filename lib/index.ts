import { Marked } from "marked";
import type { Token, Tokens } from "marked";

type AdfNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: AdfNode[];
  marks?: AdfMark[];
  text?: string;
};

type AdfMark = {
  type: string;
  attrs?: Record<string, any>;
};

type AdfDocument = {
  version: 1;
  type: "doc";
  content: AdfNode[];
};

type RelaxedToken = Token & {
  tokens?: RelaxedToken[];
  task?: boolean;
  checked?: boolean;
};

type AdfInlineToken = {
  type: "adf_inline";
  raw: string;
  adfJson: string;
};

/**
 * A local Marked instance with the adf_inline extension registered. Using a
 * local instance (rather than calling `marked.use()` on the global singleton)
 * ensures that importing marklassian does not affect any other use of marked
 * in the consumer's application.
 *
 * The extension intercepts <adf>…</adf> tags appearing within inline content
 * (paragraphs, table cells, headings, etc.) and produces a single `adf_inline`
 * token carrying the raw JSON string. Without this extension, marked's inline
 * lexer splits the tag into four separate tokens (html, text, html, text),
 * making it impossible to parse.
 */
const marked = new Marked({
  extensions: [
    {
      name: "adf_inline",
      level: "inline" as const,
      start(src: string) {
        // Use a case-insensitive search to match the tokenizer regex (/i),
        // so <ADF> tags are treated consistently by both functions.
        return src.search(/<adf>/i);
      },
      tokenizer(src: string): AdfInlineToken | undefined {
        const match = src.match(/^<adf>([\s\S]*?)<\/adf>/i);
        if (match) {
          return {
            type: "adf_inline",
            raw: match[0],
            adfJson: match[1]!.trim(),
          };
        }
      },
      // renderer is required by the marked extension interface but is not
      // relevant here — marklassian never renders to HTML.
      renderer() {
        return "";
      },
    },
  ],
});

/**
 * Generates a local ID for ADF elements.
 * @returns a random UUID v4 string
 */
const generateLocalId = (): string => globalThis.crypto.randomUUID();

/**
 * Parses an <adf>...</adf> HTML token value and returns the embedded ADF node(s).
 * Returns null if the raw string is not an <adf> tag.
 * Throws a descriptive error if the tag content is not valid ADF JSON.
 */
function parseAdfTag(raw: string): AdfNode | AdfNode[] | null {
  const match = raw.trim().match(/^<adf>([\s\S]*?)<\/adf>$/i);
  if (!match) return null;

  const json = match[1]!.trim();

  if (json.length === 0) {
    throw new Error(
      "<adf> tag content is empty — expected a JSON object or array",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Invalid JSON in <adf> tag: ${json}`);
  }

  if (Array.isArray(parsed)) {
    return parsed.map((item, i) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new Error(
          `ADF node must be a JSON object or array of objects (item ${i} is not an object)`,
        );
      }
      const node = item as Record<string, unknown>;
      if (typeof node.type !== "string" || node.type.length === 0) {
        throw new Error(`ADF node must have a "type" string property`);
      }
      return node as AdfNode;
    });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(
      `ADF node must be a JSON object or array, got: ${JSON.stringify(parsed)}`,
    );
  }

  const node = parsed as Record<string, unknown>;
  if (typeof node.type !== "string" || node.type.length === 0) {
    throw new Error(`ADF node must have a "type" string property`);
  }

  return node as AdfNode;
}

export function markdownToAdf(markdown: string): AdfDocument {
  const tokens = marked.lexer(markdown);
  return {
    version: 1,
    type: "doc",
    content: tokensToAdf(tokens),
  };
}

function tokensToAdf(tokens?: RelaxedToken[]): AdfNode[] {
  if (!tokens) return [];

  return tokens
    .map((token) => {
      switch (token.type) {
        case "paragraph":
          return processParagraph(token.tokens);

        case "heading":
          return {
            type: "heading",
            attrs: { level: token.depth },
            content: inlineToAdf(token.tokens),
          };

        case "list":
          // Check if this is a task list (all items have task: true)
          const allItemsAreTasks = token.items.every(
            (item: RelaxedToken) => item.task,
          );

          if (
            allItemsAreTasks &&
            token.items.some((item: RelaxedToken) => item.task)
          ) {
            return {
              type: "taskList",
              attrs: { localId: generateLocalId() },
              content: token.items.map((item: RelaxedToken) =>
                processTaskItem(item),
              ),
            };
          } else {
            return {
              type: token.ordered ? "orderedList" : "bulletList",
              ...(token.ordered ? { attrs: { order: token.start || 1 } } : {}),
              content: token.items.map((item: RelaxedToken) =>
                processListItem(item),
              ),
            };
          }

        case "code":
          return {
            type: "codeBlock",
            attrs: { language: token.lang || "text" },
            content: [
              {
                type: "text",
                text: token.text,
              },
            ],
          };

        case "blockquote":
          return {
            type: "blockquote",
            content: tokensToAdf(token.tokens),
          };

        case "hr":
          return { type: "rule" };

        case "table":
          return processTable(token as Tokens.Table);

        case "html": {
          const adfNode = parseAdfTag(token.raw);
          if (adfNode) return adfNode;
          return null;
        }

        default:
          return null;
      }
    })
    .filter(Boolean)
    .flat() as AdfNode[];
}

function createMediaNode(token: Tokens.Image): AdfNode {
  return {
    type: "mediaSingle",
    attrs: {
      layout: "center",
    },
    content: [
      {
        type: "media",
        attrs: {
          type: "external",
          url: token.href,
          alt: token.text || "",
        },
      },
    ],
  };
}

function processTable(token: Tokens.Table): AdfNode {
  const headers = token.header.map((header) => ({
    type: "tableHeader",
    content: processParagraph(header.tokens),
  }));

  const rows = token.rows.map((row) => ({
    type: "tableRow",
    content: row.map((cell) => {
      const content = processParagraph(cell.tokens);

      // ADF requires at least one item in the content
      if (content.length === 0) {
        content.push({
          type: "paragraph",
          content: [
            {
              type: "text",
              text: " ", // ADF requires at least 1 char
            },
          ],
        });
      }

      return {
        type: "tableCell",
        content,
      };
    }),
  }));

  const content = [];

  if (headers.length) {
    content.push({
      type: "tableRow",
      content: headers,
    });
  }

  return {
    type: "table",
    content: content.concat(rows),
  };
}

function processParagraph(tokens?: RelaxedToken[]): AdfNode[] {
  if (!tokens) return [];

  if (tokens.length === 1 && tokens[0]?.type === "image") {
    return [createMediaNode(tokens[0] as Tokens.Image)];
  }

  const outputNodes: AdfNode[] = [];
  let currentParagraphTokens: RelaxedToken[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] as RelaxedToken;

    if (token?.type === "image") {
      if (currentParagraphTokens.length) {
        outputNodes.push({
          type: "paragraph",
          content: inlineToAdf(currentParagraphTokens),
        });
        currentParagraphTokens = [];
      }

      outputNodes.push(createMediaNode(token as Tokens.Image));
    } else {
      currentParagraphTokens.push(token);
    }
  }

  if (currentParagraphTokens.length) {
    outputNodes.push({
      type: "paragraph",
      content: inlineToAdf(currentParagraphTokens),
    });
  }

  return outputNodes;
}

function processListItem(item: RelaxedToken): AdfNode {
  const itemContent: AdfNode[] = [];
  let currentParagraphTokens: RelaxedToken[] = [];

  (item.tokens || []).forEach((token: RelaxedToken) => {
    if (
      token.type === "text" ||
      token.type === "em" ||
      token.type === "strong" ||
      token.type === "del" ||
      token.type === "link" ||
      token.type === "codespan"
    ) {
      currentParagraphTokens.push(token);
    } else {
      if (currentParagraphTokens.length) {
        itemContent.push({
          type: "paragraph",
          content: inlineToAdf(currentParagraphTokens),
        });
        currentParagraphTokens = [];
      }

      if (token.type === "list") {
        // Check if nested list is a task list (all items have task: true)
        const allItemsAreTasks = token.items.every(
          (nestedItem: RelaxedToken) => nestedItem.task,
        );

        if (
          allItemsAreTasks &&
          token.items.some((nestedItem: RelaxedToken) => nestedItem.task)
        ) {
          itemContent.push({
            type: "taskList",
            attrs: { localId: generateLocalId() },
            content: token.items.map((nestedItem: RelaxedToken) =>
              processTaskItem(nestedItem),
            ),
          });
        } else {
          itemContent.push({
            type: token.ordered ? "orderedList" : "bulletList",
            ...(token.ordered ? { attrs: { order: token.start || 1 } } : {}),
            content: token.items.map((nestedItem: RelaxedToken) =>
              processListItem(nestedItem),
            ),
          });
        }
      } else {
        const processed = tokensToAdf([token]);
        if (processed.length) {
          itemContent.push(...processed);
        }
      }
    }
  });

  if (currentParagraphTokens.length) {
    itemContent.push({
      type: "paragraph",
      content: inlineToAdf(currentParagraphTokens),
    });
  }

  return {
    type: "listItem",
    content: itemContent,
  };
}

function processTaskItem(item: RelaxedToken): AdfNode {
  const itemContent: AdfNode[] = [];
  let currentParagraphTokens: RelaxedToken[] = [];

  (item.tokens || []).forEach((token: RelaxedToken) => {
    if (
      token.type === "text" ||
      token.type === "em" ||
      token.type === "strong" ||
      token.type === "del" ||
      token.type === "link" ||
      token.type === "codespan"
    ) {
      currentParagraphTokens.push(token);
    } else {
      if (currentParagraphTokens.length) {
        // For task items, content is directly inline text nodes, not wrapped in paragraphs
        itemContent.push(...inlineToAdf(currentParagraphTokens));
        currentParagraphTokens = [];
      }

      if (token.type === "list") {
        // Check if nested list is a task list (all items have task: true)
        const allItemsAreTasks = token.items.every(
          (nestedItem: RelaxedToken) => nestedItem.task,
        );

        if (
          allItemsAreTasks &&
          token.items.some((nestedItem: RelaxedToken) => nestedItem.task)
        ) {
          itemContent.push({
            type: "taskList",
            attrs: { localId: generateLocalId() },
            content: token.items.map((nestedItem: RelaxedToken) =>
              processTaskItem(nestedItem),
            ),
          });
        } else {
          itemContent.push({
            type: token.ordered ? "orderedList" : "bulletList",
            ...(token.ordered ? { attrs: { order: token.start || 1 } } : {}),
            content: token.items.map((nestedItem: RelaxedToken) =>
              processListItem(nestedItem),
            ),
          });
        }
      } else {
        const processed = tokensToAdf([token]);
        if (processed.length) {
          itemContent.push(...processed);
        }
      }
    }
  });

  if (currentParagraphTokens.length) {
    // For task items, content is directly inline text nodes, not wrapped in paragraphs
    itemContent.push(...inlineToAdf(currentParagraphTokens));
  }

  return {
    type: "taskItem",
    attrs: {
      localId: generateLocalId(),
      state: item.checked ? "DONE" : "TODO",
    },
    content: itemContent,
  };
}

function getSafeText(token: RelaxedToken): string {
  if (
    token.tokens?.length === 1 &&
    token.tokens[0] &&
    "text" in token.tokens[0]
  ) {
    return getSafeText(token.tokens[0]);
  }

  if ("text" in token) {
    return token.text
      .replace(/\n$/, "")
      .replace(/\n/g, " ")
      .replace(/\s+/g, " ");
  }

  return "";
}

function getMarks(
  token: RelaxedToken,
  marks: Record<string, AdfMark> = {},
): AdfMark[] {
  if (token.type === "em" && !marks.em) {
    marks.em = { type: "em" };
  }

  if (token.type === "strong" && !marks.strong) {
    marks.strong = { type: "strong" };
  }

  if (token.type === "del" && !marks.strike) {
    marks.strike = { type: "strike" };
  }

  if (token.type === "link") {
    marks.link = {
      type: "link",
      attrs: { href: token.href },
    };
  }

  if (token.type === "codespan" && !marks.code) {
    marks.code = { type: "code" };
  }

  const nextToken = token.tokens?.[0];
  const tokensLength = token.tokens?.length ?? 0;

  // Only continue recursion if there is only one nested token
  if (nextToken && tokensLength === 1) {
    return getMarks(nextToken, marks);
  }

  const resolvedMarks = Object.values(marks);

  if (marks.code) {
    // Code Inline mark only supports a link or annotation mark
    return resolvedMarks.filter(
      (mark) => mark.type === "link" || mark.type === "code",
    );
  }

  return resolvedMarks;
}

/**
 * Resolves a single inline token to ADF node(s), accumulating marks as it
 * recurses into nested emphasis spans.
 *
 * - adf_inline tokens are parsed and emitted as their ADF node(s) directly,
 *   with no marks applied (ADF inline nodes such as mention and date are not
 *   text nodes and cannot carry marks).
 * - em/strong/del tokens recurse into their children, merging the token's mark
 *   into the inherited marks accumulator so all ancestors' marks are preserved.
 * - All other tokens are emitted as a single text node carrying the given marks.
 *
 * The marks parameter is only supplied during recursion; top-level callers omit it.
 */
function resolveInlineToken(
  token: RelaxedToken,
  marks: AdfMark[] = [],
): AdfNode[] {
  if (token.type === "adf_inline") {
    const node = parseAdfTag(`<adf>${(token as AdfInlineToken).adfJson}</adf>`);
    if (!node) return [];
    return Array.isArray(node) ? node : [node];
  }

  const markForType: Record<string, AdfMark> = {
    em: { type: "em" },
    strong: { type: "strong" },
    del: { type: "strike" },
  };

  const ownMark = markForType[token.type];
  if (ownMark && token.tokens?.length) {
    const accumulated = [...marks, ownMark];
    return token.tokens.flatMap((t) => resolveInlineToken(t, accumulated));
  }

  return [{ type: "text", text: getSafeText(token), marks }];
}

function inlineToAdf(tokens?: RelaxedToken[]): AdfNode[] {
  if (!tokens) return [];

  return tokens
    .flatMap((token) => {
      switch (token.type) {
        case "text":
          if (token.tokens) {
            return inlineToAdf(token.tokens);
          }
          return [
            {
              type: "text",
              text: getSafeText(token),
              ...(token.tokens ? { content: inlineToAdf(token.tokens) } : {}),
            },
          ];

        case "em":
          return resolveInlineToken(token);

        case "strong":
          return resolveInlineToken(token);

        case "del":
          return resolveInlineToken(token);

        case "link":
          return [
            {
              type: "text",
              text: getSafeText(token),
              marks: getMarks(token),
            },
          ];

        case "codespan":
          return [
            {
              type: "text",
              text: getSafeText(token),
              marks: getMarks(token),
            },
          ];

        case "escape":
          return [
            {
              type: "text",
              text: token.text,
            },
          ];

        case "br":
          return [{ type: "hardBreak" }];

        case "adf_inline":
          return resolveInlineToken(token);

        default:
          return [];
      }
    })
    .filter((node) => {
      if (node.type === "text" && !node.text) {
        return false;
      }

      return true;
    });
}

/**
 * Converts an array of inline ADF nodes to a Markdown string, applying
 * marks inside-out.
 */
function inlineNodesToMarkdown(nodes?: AdfNode[]): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "  \n";
      if (node.type !== "text") {
        // Unknown inline node — fall back to <adf> passthrough
        return `<adf>${JSON.stringify(node)}</adf>`;
      }
      let text = node.text ?? "";
      const marks = node.marks ?? [];
      const hasCode = marks.some((m) => m.type === "code");
      const hasStrike = marks.some((m) => m.type === "strike");
      const hasEm = marks.some((m) => m.type === "em");
      const hasStrong = marks.some((m) => m.type === "strong");
      const linkMark = marks.find((m) => m.type === "link");
      // Escape Markdown-special characters so they survive a round-trip
      // through markdownToAdf without being interpreted as formatting.
      // We always escape the raw text content, whether or not marks are
      // present — a marked node like bold "*bold*" must escape the inner
      // asterisks to avoid them being interpreted as italic delimiters when
      // the bold wrapping is applied.
      // Trade-off: the emitted Markdown may not exactly match any original
      // Markdown source (e.g. bold+italic "text" always emits ***text***
      // regardless of which delimiter pair was used originally), but it
      // guarantees a lossless ADF → MD → ADF round-trip, which is the
      // contract we care about.
      if (marks.length === 0) {
        text = text.replace(/[\\*_`~\[]/g, "\\$&");
      } else {
        // Inside a mark, only escape * and _ — these are the characters that
        // can form unintended emphasis delimiters when the mark wrapper is
        // applied. Other special characters (`, ~, \, [) are already safely
        // contained within the outer mark delimiters.
        text = text.replace(/[*_]/g, "\\$&");
      }
      // Apply marks inside-out: code → strike → em → strong → link.
      if (hasCode) text = `\`${text}\``;
      if (hasStrike) text = `~~${text}~~`;
      if (hasEm) text = `*${text}*`;
      if (hasStrong) text = `**${text}**`;
      if (linkMark) text = `[${text}](${linkMark.attrs?.href ?? ""})`;
      return text;
    })
    .join("");
}

/**
 * Renders a listItem node with the given indent and prefix (e.g. "- " or "1. ").
 */
function listItemToMarkdown(
  item: AdfNode,
  indent: number,
  prefix: string,
): string {
  const pad = " ".repeat(indent);
  const lines: string[] = [];
  for (const child of item.content ?? []) {
    if (child.type === "paragraph") {
      lines.push(`${pad}${prefix}${inlineNodesToMarkdown(child.content)}`);
    } else if (
      child.type === "bulletList" ||
      child.type === "orderedList" ||
      child.type === "taskList"
    ) {
      lines.push(blockNodeToMarkdown(child, indent + prefix.length));
    }
  }
  return lines.join("\n");
}

/**
 * Renders a taskItem node with the appropriate checkbox prefix.
 */
function taskItemToMarkdown(item: AdfNode, indent: number): string {
  const pad = " ".repeat(indent);
  const checked = item.attrs?.state === "DONE";
  const checkbox = checked ? "- [x] " : "- [ ] ";
  const lines: string[] = [];
  // taskItem content is inline nodes directly (no paragraph wrapper)
  const inlineContent = (item.content ?? []).filter(
    (c) => c.type === "text" || c.type === "hardBreak",
  );
  const nestedLists = (item.content ?? []).filter(
    (c) =>
      c.type === "bulletList" ||
      c.type === "orderedList" ||
      c.type === "taskList",
  );
  lines.push(`${pad}${checkbox}${inlineNodesToMarkdown(inlineContent)}`);
  for (const nested of nestedLists) {
    lines.push(blockNodeToMarkdown(nested, indent + 2));
  }
  return lines.join("\n");
}

/**
 * Converts an array of block ADF nodes to Markdown, joining blocks with a
 * blank line.
 */
function blockNodesToMarkdown(nodes: AdfNode[], indent = 0): string {
  return nodes
    .map((node) => blockNodeToMarkdown(node, indent))
    .filter((s) => s !== "")
    .join("\n\n");
}

/**
 * Converts a single block ADF node to a Markdown string. Unknown node types
 * fall back to an <adf> passthrough block.
 */
function blockNodeToMarkdown(node: AdfNode, indent = 0): string {
  switch (node.type) {
    case "heading": {
      const level = node.attrs?.level ?? 1;
      return `${"#".repeat(level)} ${inlineNodesToMarkdown(node.content)}`;
    }

    case "paragraph": {
      const text = inlineNodesToMarkdown(node.content);
      // A paragraph whose rendered text starts with "# " (one or more hashes
      // followed by a space) would be re-parsed as a heading on round-trip.
      // Escape the leading # to prevent that.
      return text.replace(/^(#+) /, "\\$1 ");
    }

    case "blockquote": {
      const inner = blockNodesToMarkdown(node.content ?? []);
      return inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    }

    case "bulletList":
      return (node.content ?? [])
        .map((item) => listItemToMarkdown(item, indent, "- "))
        .join("\n");

    case "orderedList": {
      const start = node.attrs?.order ?? 1;
      return (node.content ?? [])
        .map((item, i) => listItemToMarkdown(item, indent, `${start + i}. `))
        .join("\n");
    }

    case "taskList":
      return (node.content ?? [])
        .map((item) => taskItemToMarkdown(item, indent))
        .join("\n");

    case "codeBlock": {
      // Atlassian does not support nested code block macros, so an extended
      // fence will not arise from Confluence content in practice. This is a
      // defensive measure for content created outside Confluence.
      // Note: markdownToAdf does not preserve fence depth in ADF, so the
      // MD→ADF direction cannot mirror this behavior.
      //
      // Per the CommonMark spec (and marked's implementation), only a line
      // consisting entirely of backticks can close a fenced code block — a
      // backtick sequence embedded mid-line is safe and does not need to be
      // accounted for here.
      const text = node.content?.[0]?.text ?? "";
      const longestBacktickLine = (
        text.match(/^`+$/gm) ?? ([] as string[])
      ).reduce((max: number, s: string) => Math.max(max, s.length), 0);
      const fenceLength = Math.max(3, longestBacktickLine + 1);
      const fence = "`".repeat(fenceLength);
      const lang =
        node.attrs?.language && node.attrs.language !== "text"
          ? node.attrs.language
          : "";
      return `${fence}${lang}\n${text}\n${fence}`;
    }

    case "table": {
      const rows = node.content ?? [];
      const output: string[] = [];
      let separatorEmitted = false;
      for (const row of rows) {
        const cells = row.content ?? [];
        const isHeaderRow =
          cells.length > 0 && cells[0]?.type === "tableHeader";
        const cellTexts = cells.map((cell) => {
          const content = blockNodesToMarkdown(cell.content ?? [])
            .replace(/\n+/g, " ")
            .trim();
          return content || " ";
        });
        output.push(`| ${cellTexts.join(" | ")} |`);
        if (isHeaderRow && !separatorEmitted) {
          output.push(`| ${cells.map(() => "---").join(" | ")} |`);
          separatorEmitted = true;
        }
      }
      return output.join("\n");
    }

    case "mediaSingle": {
      const media = (node.content ?? []).find((c) => c.type === "media");
      if (!media) return "";
      return blockNodeToMarkdown(media, indent);
    }

    case "media":
      return `![${node.attrs?.alt ?? ""}](${node.attrs?.url ?? ""})`;

    case "rule":
      return "---";

    default:
      return `<adf>\n${JSON.stringify(node)}\n</adf>`;
  }
}

/**
 * Converts an Atlassian Document Format (ADF) document or node array to
 * GitHub-flavored Markdown.
 *
 * Never throws. Input is assumed to be trusted Atlassian API output. Unknown
 * node types are serialized as <adf> passthrough blocks so they survive the
 * round-trip losslessly. Missing or malformed fields fall back to safe defaults.
 */
export function adfToMarkdown(adf: AdfDocument | AdfNode[]): string {
  const nodes = Array.isArray(adf) ? adf : (adf.content ?? []);
  return blockNodesToMarkdown(nodes);
}
