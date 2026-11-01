// Splits a pasted ChatGPT answer into plain text lines and tables, for the report PDF and the page.
// Tables come in two shapes: markdown ("| a | b |" rows, usually with a "|---|---|" line, from
// ChatGPT's Copy button) or tab-separated cells (from selecting the table with the mouse).

const PIPE_ROW = /^\s*\|.*\|\s*$/;
const SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const unmark = (s) => s.replace(/\*\*|__/g, '').trim();
const pipeCells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map(unmark);
const tabCells = (line) => line.split('\t').map(unmark);

/** @returns {Array<{type:'text', text:string} | {type:'table', header:string[]|null, rows:string[][]}>} */
export function parseBlocks(raw) {
  const lines = String(raw ?? '').replace(/\r/g, '').split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (PIPE_ROW.test(line) || (SEPARATOR.test(line) && line.includes('|'))) {
      const group = [];
      while (i < lines.length && (PIPE_ROW.test(lines[i]) || (SEPARATOR.test(lines[i]) && lines[i].includes('|')))) group.push(lines[i++]);
      const hasHeader = group.length > 1 && SEPARATOR.test(group[1]);
      const rows = group.filter((l) => !SEPARATOR.test(l)).map(pipeCells);
      if (rows.length) blocks.push(table(hasHeader ? rows[0] : null, hasHeader ? rows.slice(1) : rows));
      continue;
    }
    if (line.includes('\t') && line.split('\t').length >= 2 && i + 1 < lines.length && lines[i + 1].includes('\t')) {
      const group = [];
      while (i < lines.length && lines[i].includes('\t')) group.push(tabCells(lines[i++]));
      blocks.push(table(group[0], group.slice(1))); // a copied table starts with its header row
      continue;
    }
    blocks.push({ type: 'text', text: line });
    i++;
  }
  return blocks;
}

// Every row gets the same number of cells.
function table(header, rows) {
  const n = Math.max(header?.length || 0, ...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(n - r.length).fill('')];
  return { type: 'table', header: header ? pad(header) : null, rows: rows.map(pad) };
}
