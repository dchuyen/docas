function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function renderInlineMarkdown(value) {
  const codeTokens = [];
  const escaped = escapeHtml(value).replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  const linked = escaped.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const formatted = linked
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');
  return formatted.replace(/@@CODE(\d+)@@/g, (_, index) => codeTokens[index]);
}

export function normalizeAssistantText(value) {
  return value.replace(/(^|\n)(\s*)\*\s+/g, '$1$2- ');
}

export function renderMarkdown(value) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let codeLines = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
      paragraph = [];
    }
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```(?:[\w+-]+)?\s*$/);
    if (fence) {
      flushParagraph();
      closeList();
      if (codeLines) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:---+|\*\s*\*\s*\*|___+)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr>');
      continue;
    }
    const listItem = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (listItem) {
      flushParagraph();
      const nextListType = /^\d/.test(listItem[1]) ? 'ol' : 'ul';
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${renderInlineMarkdown(listItem[2])}</li>`);
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }

  if (codeLines) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join('');
}
