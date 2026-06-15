import anyTest, { type TestFn } from "ava";
import { adfToMarkdown, markdownToAdf } from "../index";
import { normalizeAdfForTesting } from "./test-helpers.js";

// Round-trip fixture imports (used in Section 2)
import basicsAdf from "./fixtures/basics.json" with { type: "json" };
import codeBlocksAdf from "./fixtures/code-blocks.json" with { type: "json" };
import inlineCodeAdf from "./fixtures/inline-code-marks.json" with {
  type: "json",
};
import nestedListAdf from "./fixtures/nested-list.json" with { type: "json" };
import specialCharsAdf from "./fixtures/special-chars.json" with {
  type: "json",
};
import tableAdf from "./fixtures/table.json" with { type: "json" };
import textEdgeCasesAdf from "./fixtures/text-edge-cases.json" with {
  type: "json",
};
import gfmTaskListAdf from "./fixtures/gfm-task-list.json" with {
  type: "json",
};
import gfmNestedTaskListAdf from "./fixtures/gfm-nested-task-list.json" with {
  type: "json",
};
import adfPassthroughAdf from "./fixtures/adf-passthrough.json" with {
  type: "json",
};
import inlineAdfElementsAdf from "./fixtures/inline-adf-elements.json" with { type: "json" };

const test = anyTest as unknown as TestFn<void>;

// ---------------------------------------------------------------------------
// Section 1: Unit tests
// ---------------------------------------------------------------------------

test("heading level 1", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Hello" }],
      },
    ],
  });
  t.is(result, "# Hello");
});

test("heading level 3", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Hello" }],
      },
    ],
  });
  t.is(result, "### Hello");
});

test("heading missing attrs defaults to level 1", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [{ type: "heading", content: [{ type: "text", text: "Hello" }] }],
  });
  t.is(result, "# Hello");
});

test("paragraph", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
    ],
  });
  t.is(result, "Hello");
});

test("bold text", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "bold", marks: [{ type: "strong" }] }],
      },
    ],
  });
  t.is(result, "**bold**");
});

test("italic text", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "italic", marks: [{ type: "em" }] }],
      },
    ],
  });
  t.is(result, "*italic*");
});

test("strikethrough text", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "strike", marks: [{ type: "strike" }] },
        ],
      },
    ],
  });
  t.is(result, "~~strike~~");
});

test("inline code", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "code", marks: [{ type: "code" }] }],
      },
    ],
  });
  t.is(result, "`code`");
});

test("link", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "text",
            marks: [{ type: "link", attrs: { href: "https://example.com" } }],
          },
        ],
      },
    ],
  });
  t.is(result, "[text](https://example.com)");
});

test("bold italic combined", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "text",
            marks: [{ type: "strong" }, { type: "em" }],
          },
        ],
      },
    ],
  });
  t.is(result, "***text***");
});

test("bold link", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "text",
            marks: [
              { type: "strong" },
              { type: "link", attrs: { href: "https://example.com" } },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "[**text**](https://example.com)");
});

test("italic link", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "text",
            marks: [
              { type: "em" },
              { type: "link", attrs: { href: "https://example.com" } },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "[*text*](https://example.com)");
});

test("hard break", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "line one" },
          { type: "hardBreak" },
          { type: "text", text: "line two" },
        ],
      },
    ],
  });
  t.is(result, "line one  \nline two");
});

test("blockquote", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "blockquote",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "text" }] },
        ],
      },
    ],
  });
  t.is(result, "> text");
});

test("bullet list", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item 1" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item 2" }],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "- Item 1\n- Item 2");
});

test("ordered list", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { order: 1 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item 1" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item 2" }],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "1. Item 1\n2. Item 2");
});

test("ordered list custom start", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { order: 3 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item 1" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Item 2" }],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "3. Item 1\n4. Item 2");
});

test("ordered list with triple-digit items (99 and 100)", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { order: 99 },
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Ninety-nine" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One hundred" }] }] },
        ],
      },
    ],
  });
  t.is(result, "99. Ninety-nine\n100. One hundred");
});

test("nested bullet list", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Parent" }],
              },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Child" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "- Parent\n  - Child");
});

test("task list unchecked", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "taskList",
        attrs: { localId: "x" },
        content: [
          {
            type: "taskItem",
            attrs: { localId: "y", state: "TODO" },
            content: [{ type: "text", text: "Task" }],
          },
        ],
      },
    ],
  });
  t.is(result, "- [ ] Task");
});

test("task list checked", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "taskList",
        attrs: { localId: "x" },
        content: [
          {
            type: "taskItem",
            attrs: { localId: "y", state: "DONE" },
            content: [{ type: "text", text: "Task" }],
          },
        ],
      },
    ],
  });
  t.is(result, "- [x] Task");
});

test("code block", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [{ type: "text", text: "code" }],
      },
    ],
  });
  t.is(result, "```typescript\ncode\n```");
});

test("code block language text omitted", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "codeBlock",
        attrs: { language: "text" },
        content: [{ type: "text", text: "code" }],
      },
    ],
  });
  t.is(result, "```\ncode\n```");
});

test("code block with backtick-only line in content uses longer fence", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "codeBlock",
        attrs: { language: "markdown" },
        content: [{ type: "text", text: "An example:\n```\ncode here\n```" }],
      },
    ],
  });
  t.is(result, "````markdown\nAn example:\n```\ncode here\n```\n````");
});

test("table", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Col A" }],
                  },
                ],
              },
              {
                type: "tableHeader",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Col B" }],
                  },
                ],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "1" }] },
                ],
              },
              {
                type: "tableCell",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "2" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |");
});

test("mediaSingle", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "mediaSingle",
        attrs: { layout: "center" },
        content: [
          {
            type: "media",
            attrs: {
              type: "external",
              url: "https://example.com/img.png",
              alt: "alt text",
            },
          },
        ],
      },
    ],
  });
  t.is(result, "![alt text](https://example.com/img.png)");
});

test("rule", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [{ type: "rule" }],
  });
  t.is(result, "---");
});

test("unknown block node falls back to adf tag", (t) => {
  const node = { type: "panel", attrs: { panelType: "info" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [node],
  });
  t.is(result, `<adf>\n${JSON.stringify(node)}\n</adf>`);
});

test("unknown inline node falls back to adf tag", (t) => {
  const unknownNode = { type: "status", attrs: { text: "In Progress" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [unknownNode],
      },
    ],
  });
  t.is(result, `<adf>${JSON.stringify(unknownNode)}</adf>`);
});

test("unknown inline node in heading falls back to inline adf tag", (t) => {
  const mention = { type: "mention", attrs: { id: "u1", text: "@Alice", accessLevel: "" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Hello " }, mention],
      },
    ],
  });
  t.is(result, `## Hello <adf>${JSON.stringify(mention)}</adf>`);
});

test("unknown inline node in bullet list item falls back to inline adf tag", (t) => {
  const status = { type: "status", attrs: { text: "Done", color: "green" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Item " }, status] },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, `- Item <adf>${JSON.stringify(status)}</adf>`);
});

test("unknown inline node in ordered list item falls back to inline adf tag", (t) => {
  const date = { type: "date", attrs: { timestamp: "1704067200000" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Due " }, date] },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, `1. Due <adf>${JSON.stringify(date)}</adf>`);
});

test("unknown inline node in blockquote falls back to inline adf tag", (t) => {
  const emoji = { type: "emoji", attrs: { shortName: ":tada:", text: "🎉" } };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "blockquote",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Congrats " }, emoji] },
        ],
      },
    ],
  });
  t.is(result, `> Congrats <adf>${JSON.stringify(emoji)}</adf>`);
});

test("accepts AdfDocument directly", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
    ],
  });
  t.is(result, "Hello");
});

test("accepts AdfNode array directly", (t) => {
  const result = adfToMarkdown([
    { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
  ]);
  t.is(result, "Hello");
});

test("mediaSingle with no media child returns empty string", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      { type: "mediaSingle", attrs: { layout: "center" }, content: [] },
    ],
  });
  t.is(result, "");
});

// ---------------------------------------------------------------------------
// Special character escaping (plain text — no marks)
// ---------------------------------------------------------------------------

test("plain asterisk is escaped so it does not become italic", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "*" },
          { type: "text", text: "not bold" },
          { type: "text", text: "*" },
        ],
      },
    ],
  });
  t.is(result, "\\*not bold\\*");
});

test("plain asterisk round-trips losslessly", (t) => {
  const original = {
    version: 1 as const,
    type: "doc" as const,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "*" },
          { type: "text", text: "not bold" },
          { type: "text", text: "*" },
        ],
      },
    ],
  };
  const md = adfToMarkdown(original);
  const roundTripped = markdownToAdf(md);
  t.deepEqual(roundTripped, original);
});

test("plain underscore is escaped so it does not become italic", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "_" },
          { type: "text", text: "not italic" },
          { type: "text", text: "_" },
        ],
      },
    ],
  });
  t.is(result, "\\_not italic\\_");
});

test("plain underscore round-trips losslessly", (t) => {
  const original = {
    version: 1 as const,
    type: "doc" as const,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "_" },
          { type: "text", text: "not italic" },
          { type: "text", text: "_" },
        ],
      },
    ],
  };
  const md = adfToMarkdown(original);
  const roundTripped = markdownToAdf(md);
  t.deepEqual(roundTripped, original);
});

test("plain backtick is escaped so it does not become code", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "`" },
          { type: "text", text: "not code" },
          { type: "text", text: "`" },
        ],
      },
    ],
  });
  t.is(result, "\\`not code\\`");
});

test("plain backtick round-trips losslessly", (t) => {
  const original = {
    version: 1 as const,
    type: "doc" as const,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "`" },
          { type: "text", text: "not code" },
          { type: "text", text: "`" },
        ],
      },
    ],
  };
  const md = adfToMarkdown(original);
  const roundTripped = markdownToAdf(md);
  t.deepEqual(roundTripped, original);
});

test("plain tilde pairs are escaped so they do not become strikethrough", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "~~not strike~~" }],
      },
    ],
  });
  t.is(result, "\\~\\~not strike\\~\\~");
});

test("plain backslash is escaped", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "a\\b" }],
      },
    ],
  });
  t.is(result, "a\\\\b");
});

test("plain open bracket is escaped so it does not start a link", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "[not a link]" }],
      },
    ],
  });
  t.is(result, "\\[not a link]");
});

// Two scenarios for marked text containing Markdown-special characters:
//
// Scenario A — separate text nodes (structure produced by markdownToAdf):
//   markdownToAdf splits escaped chars into individual text nodes, so bold
//   asterisks arrive as three separate strong nodes: "*", "bold", "*".
//   Each node is emitted independently; the asterisk content is escaped
//   inside the ** delimiters → **\*****bold*****\*** which round-trips back
//   to the original three-node structure.
//
// Scenario B — single text node (structure loaded directly from Confluence):
//   Confluence may store bold-asterisk content as a single node with text
//   "*bold*". The asterisks must be escaped inside the ** delimiters so they
//   are not interpreted as italic markers → **\*bold\***. This also
//   round-trips losslessly (markdownToAdf splits it into three strong nodes,
//   which is an equivalent ADF representation of the same content).

test("marked text — separate asterisk nodes (from markdownToAdf)", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "*", marks: [{ type: "strong" }] },
          { type: "text", text: "bold", marks: [{ type: "strong" }] },
          { type: "text", text: "*", marks: [{ type: "strong" }] },
        ],
      },
    ],
  });
  t.is(result, "**\\*****bold****\\***");
});

test("marked text — asterisks inline in single node (from Confluence)", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "*bold*", marks: [{ type: "strong" }] },
        ],
      },
    ],
  });
  t.is(result, "**\\*bold\\***");
});

// ---------------------------------------------------------------------------
// Table cell content rendering
// ---------------------------------------------------------------------------

// --- Happy path: inline content in cells ---

test("table cell with inline marks renders correctly", (t) => {
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "See ", marks: [{ type: "strong" }] },
                      {
                        type: "text",
                        text: "image",
                        marks: [{ type: "link", attrs: { href: "https://example.com" } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, "| H |\n| --- |\n| **See **[image](https://example.com) |");
});

// --- Complex cells: block content fallback ---

test("table cell with bullet list falls back to inline adf tag", (t) => {
  const list = {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "b" }] }] },
    ],
  };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Col" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [{ type: "tableCell", content: [list] }],
          },
        ],
      },
    ],
  });
  t.is(result, `| Col |\n| --- |\n| <adf>${JSON.stringify(list)}</adf> |`);
});

test("table cell with two paragraphs wraps both in array adf tag", (t) => {
  const p1 = { type: "paragraph", content: [{ type: "text", text: "First" }] };
  const p2 = { type: "paragraph", content: [{ type: "text", text: "Second" }] };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [p1, p2] },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, `| H |\n| --- |\n| <adf>${JSON.stringify([p1, p2])}</adf> |`);
});

test("table cell with paragraph, block node, and paragraph renders surrounding text inline and block as adf", (t) => {
  const list = {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] },
    ],
  };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Note:" }] },
                  list,
                  { type: "paragraph", content: [{ type: "text", text: "See above." }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  t.is(result, `| H |\n| --- |\n| Note: <adf>${JSON.stringify(list)}</adf> See above. |`);
});

// --- Naive block rendering: always uses <adf>, even for representable content ---

test("table cell with heading node uses inline adf tag (naive fallback, not ## syntax)", (t) => {
  const heading = {
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: "Section" }],
  };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [{ type: "tableCell", content: [heading] }],
          },
        ],
      },
    ],
  });
  t.is(result, `| H |\n| --- |\n| <adf>${JSON.stringify(heading)}</adf> |`);
});

test("table cell with single-item bullet list uses inline adf tag (naive fallback, not list syntax)", (t) => {
  const list = {
    type: "bulletList",
    content: [
      { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "only item" }] }] },
    ],
  };
  const result = adfToMarkdown({
    version: 1,
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "H" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [{ type: "tableCell", content: [list] }],
          },
        ],
      },
    ],
  });
  t.is(result, `| H |\n| --- |\n| <adf>${JSON.stringify(list)}</adf> |`);
});

// ---------------------------------------------------------------------------
// Section 2: Round-trip tests
// ---------------------------------------------------------------------------

/**
 * Integration test macro: ADF → Markdown → ADF round-trip.
 *
 * Covers the Confluence read-modify-write use case: a coding agent reads a
 * page (ADF), converts to Markdown for review, then converts back to ADF
 * before writing. Asserts lossless fidelity for all fixture node types.
 */
const roundTripMacro = test.macro({
  exec(t, fixture: any, _fixtureName: string) {
    const markdown = adfToMarkdown(fixture);
    const roundTripped = markdownToAdf(markdown);
    t.deepEqual(
      normalizeAdfForTesting(roundTripped),
      normalizeAdfForTesting(fixture),
    );
  },
  title(_provided, _fixture, fixtureName: string) {
    return `round-trip: ${fixtureName}`;
  },
});

// One call per fixture — all fixtures included.
// adf-passthrough is deliberately included: a silent regression in the <adf>
// fallback path (where unknown nodes lose content without erroring) would be
// very hard to diagnose without explicit round-trip coverage.
test(roundTripMacro, basicsAdf, "basics");
test(roundTripMacro, codeBlocksAdf, "code-blocks");
test(roundTripMacro, inlineCodeAdf, "inline-code-marks");
test(roundTripMacro, nestedListAdf, "nested-list");
test(roundTripMacro, specialCharsAdf, "special-chars");
test(roundTripMacro, tableAdf, "table");
test(roundTripMacro, textEdgeCasesAdf, "text-edge-cases");
test(roundTripMacro, gfmTaskListAdf, "gfm-task-list");
test(roundTripMacro, gfmNestedTaskListAdf, "gfm-nested-task-list");
test(roundTripMacro, adfPassthroughAdf, "adf-passthrough");
test(roundTripMacro, inlineAdfElementsAdf, "inline-adf-elements");
