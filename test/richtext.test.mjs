import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks } from '../public/js/richtext.mjs';
import { reportPdf } from '../server/report-pdf.mjs';

test('finds markdown tables with a header, and keeps the text around them', () => {
  const blocks = parseBlocks('Susunan LIVE:\n| Minit | **Fasa** |\n|:---|---:|\n| 0–5 | Hook |\n| 5–15 |\nSelesai');
  assert.deepEqual(blocks, [
    { type: 'text', text: 'Susunan LIVE:' },
    { type: 'table', header: ['Minit', 'Fasa'], rows: [['0–5', 'Hook'], ['5–15', '']] },
    { type: 'text', text: 'Selesai' },
  ]);
});

test('pipe rows without a separator line are a table without a header', () => {
  assert.deepEqual(parseBlocks('| a | b |\n| c | d |'), [{ type: 'table', header: null, rows: [['a', 'b'], ['c', 'd']] }]);
});

test('tab-separated rows copied from ChatGPT become a table; one tab line alone stays text', () => {
  assert.deepEqual(parseBlocks('Bantahan\tJawapan\nMahal\tRM1 sehari'), [{ type: 'table', header: ['Bantahan', 'Jawapan'], rows: [['Mahal', 'RM1 sehari']] }]);
  assert.deepEqual(parseBlocks('Nota\tsatu baris'), [{ type: 'text', text: 'Nota\tsatu baris' }]);
});

test('an answer without tables is all text', () => {
  assert.deepEqual(parseBlocks('## Tajuk\n- satu').map((b) => b.type), ['text', 'text']);
});

test('the report PDF builds with long, wide and multi-page tables', async () => {
  const rows = Array.from({ length: 80 }, (_, i) => `| ${i} | ${'ayat panjang '.repeat(8)} | ok |`).join('\n');
  const wide = '| ' + Array.from({ length: 8 }, (_, i) => `k${i}`).join(' | ') + ' |';
  const pdf = await reportPdf({ participantId: 'LL-AAAAAAAA', data: {}, approvals: { playbook: { text: `| No | Isi | Status |\n|---|---|---|\n${rows}\n${wide}` } } });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length >= 3);
});

test('the report is a cover with contents plus four parts, each starting on its own page, and markdown quirks still build', async () => {
  const pages = (b) => (b.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length;
  const quirks = '# Tajuk\n> Nota `kod` *italik*\n---\n- [ ] belum\n- [x] siap → terus ✓ ✗ ≥ ☐\n| A | B |\n|---|---|\n| ✓ | [PERLU SEMAK] |';
  const pdf = await reportPdf({ participantId: 'LL-AAAAAAAA', data: { businessName: 'Ujian' }, approvals: { playbook: { text: quirks } } });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pages(pdf), 5);
});
