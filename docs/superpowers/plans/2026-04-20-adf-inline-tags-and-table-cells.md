# ADF Inline Tags and Table Cell Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add test coverage for inline `<adf>` in single-line Markdown elements (headings, list items, table cells), implement table cell complex-content fallback, and cover ordered list items 99/100.

**Architecture:** The block (`<adf>\n…\n</adf>`) and inline (`<adf>…</adf>`) tag formats are intentionally different and must stay that way — a bare inline tag gets wrapped in a `paragraph` by marked, whereas a block tag is inserted directly as a doc child (see `lib/test/adf-passthrough.test.ts`). The main change is replacing the table cell rendering logic with a `cellContentToMarkdown` helper. Cell rendering rules: single paragraph → render inline; multiple paragraphs only → emit all as `<adf>[{...},{...}]</adf>` (array form preserves structure); mix of paragraph(s) and block node(s) → render paragraph inline content, wrap block nodes individually as `<adf>{...}</adf>`; `mediaSingle` → rendered as `![…](…)`. Tests expand `adf-to-markdown.test.ts` and add a new fixture.

**Tech Stack:** TypeScript, AVA 6, `tsimp`, ESM modules. No new dependencies.

**Context:** Tasks 0–5b from the previous phase are complete and committed on branch `feat/adf-to-markdown`. This plan covers the remaining incomplete tasks (5c, 5d) plus the new inline-tag coverage work.

---

## File map

| File | Change |
|---|---|
| `lib/index.ts` | Add `cellContentToMarkdown` helper; update table cell loop to use it |
| `lib/test/adf-to-markdown.test.ts` | Add inline-`<adf>`-in-heading/list/cell tests; add triple-digit ordered list test |
| `lib/test/fixtures/inline-adf-elements.json` | New fixture: unknown inline ADF nodes in headings, list items, and blockquotes |

---

## Task 1: Test inline `<adf>` tags in single-line Markdown elements

**Files:**
- Create: `lib/test/fixtures/inline-adf-elements.json`
- Modify: `lib/test/adf-to-markdown.test.ts`

These tests verify that an unknown inline node (which `adfToMarkdown` emits as `<adf>…</adf>`) embedded within headings, list items, and blockquotes survives a full ADF→MD→ADF round-trip. Unit tests cover the `adfToMarkdown` output format; the round-trip is covered via the `roundTripMacro` using a fixture.

- [ ] **Step 1: Create `lib/test/fixtures/inline-adf-elements.json`**

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [
        { "type": "text", "text": "Hello " },
        { "type": "mention", "attrs": { "id": "u1", "text": "@Alice", "accessLevel": "" } }
      ]
    },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                { "type": "text", "text": "Item " },
                { "type": "status", "attrs": { "text": "Done", "color": "green" } }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "orderedList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                { "type": "text", "text": "Due " },
                { "type": "date", "attrs": { "timestamp": "1704067200000" } }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "blockquote",
      "content": [
        {
          "type": "paragraph",
          "content": [
            { "type": "text", "text": "Congrats " },
            { "type": "emoji", "attrs": { "shortName": ":tada:", "text": "🎉" } }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the unit tests**

Add to the unit tests section of `lib/test/adf-to-markdown.test.ts` (after the `"unknown inline node falls back to adf tag"` test, around line 587), and add the fixture import at the top of the file alongside the other fixture imports:

```typescript
// Add to imports at top of file:
import inlineAdfElementsAdf from "./fixtures/inline-adf-elements.json" with { type: "json" };
```

```typescript
// Add to unit tests section:
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
```

```typescript
// Add to round-trip section alongside the other roundTripMacro calls:
test(roundTripMacro, inlineAdfElementsAdf, "inline-adf-elements");
```

- [ ] **Step 3: Run the unit tests**

These exercise existing behaviour — inline nodes in headings/list items already go through `inlineNodesToMarkdown` which emits `<adf>…</adf>`. They should pass without code changes.

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "unknown inline node in"
```

Expected: all PASS. If any fail, investigate before continuing.

- [ ] **Step 4: Run the round-trip test**

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "round-trip: inline-adf-elements"
```

Expected: PASS.

- [ ] **Step 5: Run the full test suite**

```bash
cd lib && npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/test/fixtures/inline-adf-elements.json lib/test/adf-to-markdown.test.ts
git commit
```

---

## Task 2: Table cells — complex content fallback (task 5c)

**Files:**
- Modify: `lib/index.ts` (add `cellContentToMarkdown` helper; update table case)
- Modify: `lib/test/adf-to-markdown.test.ts`

GFM table cells support inline content only. The fix: a new `cellContentToMarkdown` helper with these rules:

1. **Single paragraph** → render via `inlineNodesToMarkdown` (simple, lossless)
2. **Multiple paragraphs only** → wrap all as `<adf>[{p1},{p2},...]</adf>` (array form preserves structure; joining inline would lose paragraph boundaries)
3. **`mediaSingle`** (alone or with other nodes) → rendered as `![alt](url)` inline
4. **Mix of paragraph(s) + block node(s)** → render each paragraph's inline content directly, wrap each block node individually as `<adf>{node}</adf>`; join all parts with a single space
5. **Other block-only node** (single non-paragraph, non-mediaSingle) → wrap as `<adf>{node}</adf>`

Note: cells with block nodes are intentionally rendered naively — a `heading` node in a cell becomes `<adf>{"type":"heading",...}</adf>` even though it could theoretically render as `## text`. Smarter handling is deferred to a future iteration.

- [ ] **Step 1: Write the failing tests**

Add to `lib/test/adf-to-markdown.test.ts`:

```typescript
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
  t.is(result, "| H |\n| --- |\n| **See** [image](https://example.com) |");
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
```

- [ ] **Step 2: Run the tests to confirm they fail (except the happy-path test)**

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "table cell"
```

Expected: the happy-path test (`"table cell with inline marks"`) PASSES. The complex/block tests FAIL.

- [ ] **Step 3: Add `cellContentToMarkdown` helper in `lib/index.ts`**

Insert this function before `blockNodeToMarkdown` (around line 760):

```typescript
/**
 * Renders the content of a table cell to a Markdown-safe inline string.
 *
 * Rules (in order):
 * - Empty content → single space (GFM requires non-empty cells)
 * - Single paragraph → inline content via inlineNodesToMarkdown (simple, lossless)
 * - Multiple paragraphs only → <adf>[{p1},{p2},...}</adf> (array form preserves boundaries)
 * - mediaSingle → ![alt](url) inline
 * - Mix of paragraphs + block nodes → paragraphs rendered inline, block nodes as <adf>{node}</adf>
 * - Single non-paragraph block node → <adf>{node}</adf>
 *
 * Block nodes in cells are handled naively — a heading node becomes <adf>{"type":"heading",...}</adf>
 * even though it could theoretically be rendered as "## text". Smarter handling is deferred.
 */
function cellContentToMarkdown(cellContent: AdfNode[]): string {
  if (cellContent.length === 0) return " ";

  // Simple case: single paragraph — render inline content directly.
  if (cellContent.length === 1 && cellContent[0]!.type === "paragraph") {
    return inlineNodesToMarkdown(cellContent[0]!.content) || " ";
  }

  // Multiple-paragraphs-only case: wrap all as a single array <adf> tag to
  // preserve paragraph boundaries (joining inline would lose them).
  if (cellContent.every((node) => node.type === "paragraph")) {
    return `<adf>${JSON.stringify(cellContent)}</adf>`;
  }

  // Complex case: mix of paragraphs, mediaSingle, and/or block nodes.
  const parts = cellContent.map((node) => {
    if (node.type === "paragraph") {
      return inlineNodesToMarkdown(node.content);
    }
    if (node.type === "mediaSingle") {
      // Render the image inline so it survives the cell's single-line constraint.
      const media = (node.content ?? []).find((c) => c.type === "media");
      if (media) {
        return `![${media.attrs?.alt ?? ""}](${media.attrs?.url ?? ""})`;
      }
      return "";
    }
    // Block-level node that can't be inlined — emit as inline <adf> tag.
    // Table cells are an inline context, so the inline form is correct here.
    return `<adf>${JSON.stringify(node)}</adf>`;
  });

  return parts.filter(Boolean).join(" ") || " ";
}
```

- [ ] **Step 4: Update the table case in `blockNodeToMarkdown` to use the helper**

Find the table case (around line 825–845). Replace the `cellTexts` map:

```typescript
// Before:
const cellTexts = cells.map((cell) => {
  const content = blockNodesToMarkdown(cell.content ?? [])
    .replace(/\n+/g, " ")
    .trim();
  return content || " ";
});

// After:
const cellTexts = cells.map((cell) =>
  cellContentToMarkdown(cell.content ?? [])
);
```

- [ ] **Step 5: Run the new tests**

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "table cell"
```

Expected: all tests PASS.

- [ ] **Step 6: Run the full test suite**

```bash
cd lib && npm test
```

Expected: all tests pass, including `round-trip: table`. The existing `table.json` has a cell with `[mediaSingle, paragraph]` content. `cellContentToMarkdown` renders this as `"![Example Image](https://picsum.photos/400/300) Image with text in cell"` (mediaSingle → Markdown image string, paragraph → inline text, joined by space). `markdownToAdf` re-parses this via `processParagraph(cell.tokens)`: the image token is extracted as a `mediaSingle` node, and the remaining text token becomes a `paragraph` — reproducing the original `[mediaSingle, paragraph]` structure.

- [ ] **Step 7: Commit**

```bash
git add lib/index.ts lib/test/adf-to-markdown.test.ts
git commit
```

---

## Task 3: Ordered list items 99 and 100 (task 5d)

**Files:**
- Modify: `lib/test/adf-to-markdown.test.ts`

Verify that triple-digit list item numbers are formatted correctly. This is a pure test addition — no implementation change needed (the implementation uses `${start + i}. ` which handles any number).

- [ ] **Step 1: Write the test**

Add to the unit tests section of `lib/test/adf-to-markdown.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test**

```bash
cd lib && npx ava test/adf-to-markdown.test.ts -- "ordered list with triple-digit"
```

Expected: PASS (implementation already handles this correctly).

- [ ] **Step 3: Commit**

```bash
git add lib/test/adf-to-markdown.test.ts
git commit
```

---

## Task 4: Final verification and finishing

- [ ] **Step 1: Run the full test suite**

```bash
cd lib && npm test
```

Expected: all tests pass.

- [ ] **Step 2: Confirm `adfToMarkdown` is exported from the build**

```bash
cd lib && npm run build
```

Expected: build succeeds, no TypeScript errors. Check `lib/dist/index.d.ts` includes `export declare function adfToMarkdown(...)`.

- [ ] **Step 3: Remove spec and plan docs**

```bash
git rm docs/superpowers/specs/2026-03-23-adf-to-markdown-design.md \
       docs/superpowers/plans/2026-04-20-adf-inline-tags-and-table-cells.md
git commit
```

- [ ] **Step 4: Invoke finishing-a-development-branch skill**

Use superpowers:finishing-a-development-branch to decide how to integrate the work.
