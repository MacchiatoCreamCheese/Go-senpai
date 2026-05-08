// Tiny markdown renderer for LLM-authored review text.
//
// Intentionally minimal — supports the formatting our prompt actually emits:
// paragraphs, bold/italic, inline code, and forced line breaks. Anything more
// elaborate (headings, lists, links) renders as plain prose, which is fine.

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(s: string): string {
  let out = escape(s);
  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold: **text** or __text__
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
  return out;
}

/** Render a markdown-ish string as an HTML string. The output is meant to be
 *  used with `dangerouslySetInnerHTML`; only the LLM's own text feeds in. */
export function renderMarkdown(md: string): string {
  if (!md) return "";
  const blocks = md.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      // Single line breaks within a block become <br>.
      const lines = block.split(/\n/).map(inlineFormat).join("<br>");
      return `<p>${lines}</p>`;
    })
    .join("\n");
}
