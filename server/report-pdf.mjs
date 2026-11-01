// The participant's full LIVE LARIS report as a PDF (A4). Cover with contents, then one section per page:
// the approved Master Playbook, their answers (as tables), the other approved materials, and the
// quality check with Misi 7 Hari. Same look as the Business Quick Fix report: Inter + Bricolage
// Grotesque (OFL), nude/red/black.
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS, QC_ITEMS, LEAKS, LEAK_LABELS } from '../public/js/cards.mjs';
import { parseBlocks } from '../public/js/richtext.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fonts = path.join(here, 'fonts');
const LOGOS = { klinik: path.join(here, '..', 'public', 'img', 'klinik-bisnes-sme.png'), rcg: path.join(here, '..', 'public', 'img', 'rcg.png') };
const C = { nude: '#f7eee1', red: '#c02026', ink: '#000000', text: '#2e2924', muted: '#5c534a', line: '#ebe1d3', soft: '#fcf8f2' };
// Status labels used in the AI outputs, coloured so the items to check stand out.
const TONE = {
  check: { ink: '#8a4b00', bg: '#fdf0d8' }, // [PERLU SEMAK]
  missing: { ink: '#a3161c', bg: '#fbe4e4' }, // [BELUM LENGKAP], [BELUM DITETAPKAN], PERLU BETULKAN
  done: { ink: '#1f6f3f', bg: '#e6f3ea' }, // LENGKAP, ADA, OK
};
const STATUS_TOKEN = /(\[(?:PERLU SEMAK|BELUM LENGKAP|BELUM DITETAPKAN)[^\]]*\])/;
const toneOf = (s) => {
  const t = s.trim().toUpperCase();
  if (/^\[?PERLU SEMAK/.test(t)) return TONE.check;
  if (/^\[?BELUM (LENGKAP|DITETAPKAN)\]?$/.test(t) || t === 'PERLU BETULKAN') return TONE.missing;
  if (/^(LENGKAP|ADA|OK|YA)$/.test(t)) return TONE.done;
  return null;
};

// Labels as participants see them on the page.
const PROFILE = [
  ['owner', 'Nama'], ['businessName', 'Nama bisnes / jenama'], ['years', 'Tempoh berniaga'], ['model', 'Cara berniaga'],
  ['industry', 'Industri'], ['team', 'Saiz team'], ['location', 'Kawasan pelanggan'], ['sales', 'Anggaran jualan sebulan'],
  ['customer', 'Pelanggan sasaran'], ['age', 'Umur pelanggan'], ['businessDesc', 'Bisnes anda secara ringkas']];
const REALITY = [
  ['platform', 'Platform LIVE'], ['experience', 'Pengalaman LIVE'], ['liveCount30', 'LIVE dalam 30 hari terakhir'],
  ['liveDuration', 'Purata tempoh LIVE'], ['viewersEnter', 'Apa berlaku apabila viewers masuk'], ['commonQuestions', 'Soalan paling kerap'],
  ['checkout', 'Cara pelanggan membeli'], ['goal', 'Apa yang mahu dicapai melalui LIVE'], ['liveExtra', 'Cara buat LIVE']];
const PRODUCT = [
  ['productType', 'Apa yang dijual'], ['productName', 'Produk / servis untuk LIVE'], ['price', 'Harga jualan'], ['size', 'Saiz / pilihan / pakej'],
  ['features', 'Ciri atau bahan penting'], ['customerNeed', 'Masalah pelanggan yang diselesaikan'], ['difference', 'Keistimewaan'], ['proof', 'Bukti / sijil'],
  ['reviews', 'Kata pelanggan'], ['stock', 'Stok / tempahan'], ['offer', 'Promosi'], ['demo', 'Yang boleh ditunjuk semasa LIVE'],
  ['objections', 'Soalan / keraguan pelanggan'], ['productExtra', 'Maklumat penting lain'], ['toVerify', 'Maklumat PERLU SEMAK']];
// "Misi 7 Hari LIVE Laris"; ticked boxes are stored as '✓'.
const MISSION = [['lastLiveAt', 'LIVE terakhir sebelum kelas'], ['lastViewers', 'Jumlah viewers'], ['lastOrders', 'Jumlah pesanan'],
  ['noLastLive', 'Tiada rekod LIVE sebelum ini', 'tick'], ['nextChange', 'Satu teknik baharu untuk dicuba'], ['scriptReady', 'Skrip LIVE Selling siap digunakan', 'tick'],
  ['nextLiveAt', 'Bila LIVE misi dalam 7 hari'], ['followupConsent', 'Setuju dihubungi untuk semakan hasil 7 hari', 'tick']];
const NOTE = 'Penafian AI: Prompt dan output AI adalah draf awal berasaskan input peserta. Semak semua fakta, harga dan dakwaan sebelum digunakan; hasil jualan tidak dijamin.';

// Symbols the fonts lack would print as boxes: swap them for ones they have, then drop emoji.
const GLYPHS = { '→': '›', '⇒': '›', '➔': '›', '➜': '›', '←': '‹', '⇐': '‹', '✓': '•', '✔': '•', '✅': '•', '☑': '•', '✗': '×', '✘': '×', '❌': '×', '☒': '×',
  '☐': '[ ]', '≥': '>=', '≤': '<=', '⚠': '!', '★': '*', '☆': '*' };
const GLYPH_RE = new RegExp(`[${Object.keys(GLYPHS).join('')}]`, 'gu');
const clean = (s) => String(s ?? '').replace(GLYPH_RE, (c) => GLYPHS[c]).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
  .replace(/\r/g, '').replace(/[ \t]{2,}/g, ' ').trim();
// Markdown the AI writes inside a line: `code` and *italics* markers go; **bold** is drawn as bold.
const unmd = (s) => clean(s).replace(/`+/g, '').replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1$2');
const cell = (s) => { const t = unmd(s).replace(/\*\*/g, ''); return t === '•' ? 'Ya' : t === '×' ? 'Tidak' : t; };
const dateMY = (d) => d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });

// The participant's download has no code; the organiser's Drive copy adds it so same-named businesses don't clash.
export const reportFileName = (data, id) =>
  `Panduan LIVE · ${clean(data.businessName).replace(/[^\p{L}\p{N} .-]+/gu, '').trim().slice(0, 60) || 'Peserta'}${id ? ` · ${id}` : ''}.pdf`;

/** Ready when step 1 and the customer problem are filled in and the Master Playbook has been approved. */
export function reportMissing(data = {}, approvals = {}) {
  const missing = [];
  const required = ['owner', 'businessName', 'years', 'model', 'industry', 'team', 'location', 'sales', 'customer', 'age'];
  if (required.some((k) => !String(data[k] ?? '').trim())) missing.push('Profil bisnes belum lengkap');
  if (!String(data.customerNeed ?? '').trim()) missing.push('Masalah pelanggan (Product Blueprint) belum diisi');
  if (!approvals.playbook?.text) missing.push('Panduan LIVE Lengkap (Master Playbook) belum diluluskan');
  return missing;
}

export function reportPdf({ participantId, data = {}, approvals = {}, date = new Date() }) {
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 50, bottom: 60, left: 52, right: 52 },
    info: { Title: `Panduan LIVE — ${clean(data.businessName) || 'Peserta'}`, Author: 'Klinik Bisnes SME' } });
  doc.registerFont('Body', path.join(fonts, 'Inter-Regular.woff'));
  doc.registerFont('Bold', path.join(fonts, 'Inter-Bold.woff'));
  doc.registerFont('Display', path.join(fonts, 'BricolageGrotesque-Bold.woff'));
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const page = () => { const r = doc.bufferedPageRange(); return r.start + r.count - 1; };
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  const room = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const text = (s, { size = 10, font = 'Body', color = C.ink, gap = 4, indent = 0 } = {}) => {
    doc.font(font).fontSize(size).fillColor(color).text(clean(s) || '—', L + indent, doc.y, { width: W - indent, lineGap: 1.6 });
    doc.y += gap;
  };
  // One line of AI text with **bold** runs and coloured status labels.
  const inline = (s, { size = 9.5, color = C.text, indent = 0, gap = 1.5 } = {}) => {
    const runs = unmd(s).split(/(\*\*[^*]+\*\*)/).flatMap((r) => (r.startsWith('**') ? [{ t: r.slice(2, -2), bold: true }] : r.split(STATUS_TOKEN).map((t) => ({ t, tone: toneOf(t) }))))
      .filter((r) => r.t);
    if (!runs.length) return;
    runs.forEach((r, i) => {
      doc.font(r.bold || r.tone ? 'Bold' : 'Body').fontSize(size).fillColor(r.tone ? r.tone.ink : color);
      const opts = { width: W - indent, lineGap: 1.6, continued: i < runs.length - 1 };
      if (i === 0) doc.text(r.t, L + indent, doc.y, opts); else doc.text(r.t, opts);
    });
    doc.y += gap;
  };

  // Contents entries, filled in on the cover once the page numbers are known.
  const toc = [];
  const section = (num, title) => {
    doc.addPage();
    toc.push({ num, title: clean(title), page: page(), level: 0 });
    doc.font('Bold').fontSize(8).fillColor(C.red).text(`BAHAGIAN ${num}`, L, doc.y, { characterSpacing: 1.3, width: W });
    doc.y += 3;
    doc.font('Display').fontSize(18).fillColor(C.ink).text(clean(title), L, doc.y, { width: W });
    doc.moveTo(L, doc.y + 5).lineTo(L + W, doc.y + 5).lineWidth(1).strokeColor(C.red).stroke();
    doc.y += 16;
  };
  const subsection = (title, { inToc = false } = {}) => {
    room(90);
    doc.y += 8;
    if (inToc) toc.push({ title: clean(title), page: page(), level: 1 });
    const y = doc.y;
    doc.rect(L, y, 3, 17).fill(C.red);
    doc.font('Display').fontSize(12.5).fillColor(C.ink).text(clean(title), L + 11, y + 1, { width: W - 11 });
    doc.y += 7;
  };
  // Question | answer table for the participant's own answers; empty answers are left out.
  const kvTable = (rows, { empty = 'Belum diisi.' } = {}) => {
    const shown = rows.map(([l, v]) => [l, clean(v)]).filter(([, v]) => v);
    if (!shown.length) { text(empty, { color: C.muted, size: 9.5, gap: 6 }); return; }
    const lw = W * 0.36, vw = W - lw, pad = 6;
    shown.forEach(([l, v], i) => {
      const h = Math.max(doc.font('Bold').fontSize(8.5).heightOfString(l, { width: lw - 2 * pad }),
        doc.font('Body').fontSize(9.5).heightOfString(v, { width: vw - 2 * pad, lineGap: 1.4 })) + 2 * pad;
      room(h);
      const y = doc.y;
      if (i % 2 === 0) doc.rect(L, y, W, h).fill(C.soft);
      doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.6).strokeColor(C.line).stroke();
      doc.font('Bold').fontSize(8.5).fillColor(C.muted).text(l, L + pad, y + pad, { width: lw - 2 * pad });
      doc.font('Body').fontSize(9.5).fillColor(C.ink).text(v, L + lw + pad, y + pad, { width: vw - 2 * pad, lineGap: 1.4 });
      doc.x = L; doc.y = y + h;
    });
    doc.y += 8;
  };
  // A table from a ChatGPT answer: bordered cells that wrap, a nude header row repeated on each new
  // page, columns sized by their content, status cells tinted. Too many columns to fit → one line per row.
  const table = ({ header, rows }) => {
    const n = (header || rows[0] || []).length;
    if (!n) return;
    if (n > 6) {
      [header, ...rows].filter(Boolean).forEach((r) => { room(16); inline(r.map(cell).join('   |   '), { size: 9 }) });
      return;
    }
    const pad = 5, size = 8.5;
    const weight = Array.from({ length: n }, (_, c) => {
      const cells = [header, ...rows].filter(Boolean).map((r) => cell(r[c]));
      const longestWord = Math.max(...cells.flatMap((t) => t.split(/\s+/).map((w) => w.length)));
      return Math.max(longestWord + 2, Math.min(40, Math.max(6, ...cells.map((t) => t.length))));
    });
    const total = weight.reduce((a, b) => a + b, 0);
    const widths = weight.map((w) => (w / total) * W);
    const cellH = (cells, font) => Math.max(...cells.map((t, c) => doc.font(font).fontSize(size).heightOfString(cell(t) || ' ', { width: widths[c] - 2 * pad, lineGap: 1 }))) + 2 * pad;
    const drawRow = (cells, isHeader) => {
      const h = cellH(cells, isHeader ? 'Bold' : 'Body');
      const y = doc.y;
      let x = L;
      cells.forEach((raw, c) => {
        const t = cell(raw), tone = !isHeader && toneOf(t);
        if (isHeader) doc.rect(x, y, widths[c], h).fill(C.nude);
        else if (tone) doc.rect(x, y, widths[c], h).fill(tone.bg);
        doc.rect(x, y, widths[c], h).lineWidth(0.6).strokeColor(C.line).stroke();
        doc.font(isHeader || tone ? 'Bold' : 'Body').fontSize(size).fillColor(isHeader ? C.ink : tone ? tone.ink : C.text)
          .text(t, x + pad, y + pad, { width: widths[c] - 2 * pad, lineGap: 1 });
        x += widths[c];
      });
      doc.x = L;
      doc.y = y + h;
    };
    doc.y += 4;
    if (header) { room(cellH(header, 'Bold') + 30); drawRow(header, true); }
    rows.forEach((r) => {
      if (doc.y + cellH(r, 'Body') > bottom()) { doc.addPage(); if (header) drawRow(header, true); }
      drawRow(r, false);
    });
    doc.y += 8;
  };
  const tickbox = (checked, y, x = L) => {
    doc.roundedRect(x, y + 1, 10, 10, 2).lineWidth(0.9).strokeColor(checked ? C.red : C.muted).stroke();
    if (checked) doc.moveTo(x + 2, y + 6).lineTo(x + 4.5, y + 8.8).lineTo(x + 8.5, y + 3.2).lineWidth(1.3).strokeColor(C.red).stroke();
  };
  // Approved ChatGPT text: headings, dividers, quotes, checklists and bullets drawn properly; tables as tables.
  const HEADING = { 1: [15, 'Display'], 2: [13, 'Display'], 3: [11.5, 'Display'], 4: [10.5, 'Bold'], 5: [10, 'Bold'], 6: [10, 'Bold'] };
  const richText = (raw) => {
    let quote = null; // start y of a run of "> " lines, for the bar beside them
    const endQuote = () => { if (quote !== null) { doc.rect(L, quote, 2.5, doc.y - quote).fill(C.red); doc.y += 4; quote = null } };
    for (const block of parseBlocks(raw)) {
      if (block.type === 'table') { endQuote(); table(block); continue; }
      const line = block.text;
      const q = line.match(/^\s*>\s?(.*)$/);
      if (q) {
        if (quote === null) { room(30); quote = doc.y; }
        if (q[1].trim()) inline(q[1], { indent: 10, color: C.muted, size: 9 }); else doc.y += 3;
        continue;
      }
      endQuote();
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { room(20); doc.y += 4; doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.6).strokeColor(C.line).stroke(); doc.y += 8; continue; }
      const h = line.match(/^\s*(#{1,6})\s+(.*)/);
      if (h) {
        const [size, font] = HEADING[h[1].length];
        room(36); doc.y += h[1].length <= 2 ? 8 : 5;
        text(unmd(h[2]).replace(/\*\*/g, ''), { font, size, gap: 4 });
        continue;
      }
      if (!line.trim()) { doc.y += 4; continue; }
      const depth = Math.min(2, Math.floor((line.match(/^\s*/)[0].length) / 2));
      const box = line.match(/^\s*(?:[-*•]\s+)?\[( |x|X)\]\s+(.*)$/);
      if (box) {
        room(16);
        const x = L + depth * 12, y = doc.y;
        tickbox(box[1] !== ' ', y, x);
        inline(box[2], { indent: depth * 12 + 16 });
        doc.y += 1.5;
        continue;
      }
      const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
      room(16);
      if (bullet) inline(`•  ${bullet[1]}`, { indent: depth * 12 + 4 });
      else inline(line.trim(), { indent: depth * 12 });
    }
    endQuote();
  };

  // Cover: logos on white, nude title band, then the contents (drawn at the end) and a key to the status labels
  doc.image(LOGOS.klinik, L, 18, { height: 44 });
  doc.image(LOGOS.rcg, L + W - 55, 18, { fit: [55, 44], align: 'right' });
  const B = 82;
  doc.rect(0, B, doc.page.width, 104).fill(C.nude);
  doc.font('Bold').fontSize(8).fillColor(C.red).text('LIVE LARIS · DARI VIEWERS KE BUYERS', L, B + 20, { characterSpacing: 1.4, width: W });
  doc.font('Display').fontSize(22).fillColor(C.ink).text('Panduan LIVE Saya', L, B + 35, { width: W });
  doc.font('Body').fontSize(9.5).fillColor(C.text)
    .text([clean(data.businessName), clean(data.owner), dateMY(date), participantId].filter(Boolean).join('  ·  '), L, B + 68, { width: W });
  const tocTop = B + 132;

  // 01: the Master Playbook — the main result
  const playbook = CARDS.find((c) => c.id === 'playbook');
  section('01', playbook.title);
  if (approvals.playbook?.text) richText(approvals.playbook.text);
  else text('Belum diluluskan.', { color: C.muted });

  // 02: the participant's own answers
  section('02', 'Maklumat Bisnes Anda');
  subsection('Profil Bisnes');
  kvTable(PROFILE.map(([k, l]) => [l, data[k]]));
  subsection('LIVE Selling Reality Check');
  kvTable(REALITY.map(([k, l]) => [l, data[k]]));
  room(40);
  text('Kenal Pasti Masalah Semasa LIVE (1 = tiada masalah, 5 = sangat serius)', { size: 8.5, font: 'Bold', color: C.muted, gap: 4 });
  kvTable(LEAKS.map((n) => [LEAK_LABELS[n], clean(data[`leak${n}`]) ? `${clean(data[`leak${n}`])} / 5` : '–']));
  subsection('Produk / Servis Anda');
  kvTable(PRODUCT.map(([k, l]) => [l, data[k]]));

  // 03: the other approved materials, in course order
  section('03', 'Bahan LIVE yang Diluluskan');
  const sources = CARDS.filter((c) => c.id !== 'playbook');
  if (!sources.some((c) => approvals[c.id]?.text)) text('Belum ada bahan yang diluluskan.', { color: C.muted });
  sources.forEach((c, i) => {
    if (!approvals[c.id]?.text) return;
    subsection(`${String(i + 1).padStart(2, '0')} · ${c.title}`, { inToc: true });
    richText(approvals[c.id].text);
    doc.y += 6;
  });

  // 04: quality check and Misi 7 Hari
  section('04', 'Komitmen & Semakan');
  subsection('Panduan LIVE Anda Dah Siap?');
  const done = QC_ITEMS.filter((_, i) => clean(data[`qc${i}`])).length;
  text(`Kemajuan semakan: ${done} / ${QC_ITEMS.length} siap`, { size: 9, font: 'Bold', color: C.muted, gap: 6 });
  QC_ITEMS.forEach((q, i) => {
    room(18);
    const y = doc.y;
    tickbox(Boolean(clean(data[`qc${i}`])), y);
    doc.font('Body').fontSize(10).fillColor(C.ink).text(q, L + 18, y, { width: W - 18, lineGap: 1.4 });
    doc.y += 4;
  });
  subsection('Misi 7 Hari LIVE Laris');
  kvTable(MISSION.map(([k, l, tick]) => [l, tick ? (clean(data[k]) ? 'Ya' : 'Tidak') : clean(data[k]) || 'Belum diisi']));
  room(50);
  const my = doc.y;
  doc.roundedRect(L, my, W, 42, 8).fill(C.nude);
  doc.font('Display').fontSize(11).fillColor(C.ink).text('Misi Anda', L, my + 8, { width: W, align: 'center' });
  doc.font('Body').fontSize(9).fillColor(C.text).text('1 Penambahbaikan  •  1 LIVE Dalam 7 Hari  •  1 Semakan Hasil', L, my + 24, { width: W, align: 'center' });

  // Cover contents, now that every section's page is known
  doc.switchToPage(0);
  let y = tocTop;
  doc.font('Display').fontSize(13).fillColor(C.ink).text('Kandungan', L, y, { width: W });
  y += 24;
  toc.forEach((e) => {
    const top = e.level === 0;
    if (top) y += 4;
    const x = L + (top ? 0 : 30);
    doc.font(top ? 'Bold' : 'Body').fontSize(top ? 10.5 : 9.5).fillColor(top ? C.ink : C.text);
    const label = top ? `${e.num}   ${e.title}` : e.title;
    doc.text(label, x, y, { width: W - (x - L) - 40, lineBreak: false, ellipsis: true });
    const tw = Math.min(doc.widthOfString(label), W - (x - L) - 40);
    doc.moveTo(x + tw + 6, y + 8).lineTo(L + W - 28, y + 8).dash(1, { space: 2.5 }).lineWidth(0.6).strokeColor(C.line).stroke().undash();
    doc.font(top ? 'Bold' : 'Body').fillColor(C.muted).text(String(e.page + 1), L + W - 24, y, { width: 24, align: 'right', lineBreak: false });
    y += top ? 20 : 16;
  });
  // Key to the status labels used in the AI outputs
  y += 18;
  doc.font('Bold').fontSize(8.5).fillColor(C.muted).text('PETUNJUK STATUS', L, y, { characterSpacing: 1, width: W });
  y += 16;
  [['[PERLU SEMAK]', TONE.check, 'Maklumat perlu disahkan sebelum digunakan semasa LIVE'],
    ['[BELUM LENGKAP]', TONE.missing, 'Bahan belum tersedia atau belum diluluskan'],
    ['LENGKAP / ADA', TONE.done, 'Sudah tersedia dan boleh digunakan']].forEach(([label, tone, meaning]) => {
    doc.font('Bold').fontSize(8.5);
    const w = doc.widthOfString(label) + 12;
    doc.roundedRect(L, y - 3, w, 15, 4).fill(tone.bg);
    doc.fillColor(tone.ink).text(label, L + 6, y, { lineBreak: false });
    doc.font('Body').fontSize(9).fillColor(C.text).text(meaning, L + 120, y, { width: W - 120, lineBreak: false });
    y += 22;
  });

  // Footer on every page: brand line, disclaimer, page number
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // the footer sits in the margin; without this pdfkit starts a new page
    const fy = doc.page.height - 44;
    doc.font('Bold').fontSize(7).fillColor(C.ink).text('LIVE LARIS AI Builder | Klinik Bisnes SME | Richworks X Academy | powered by RCG', L, fy, { width: W - 40, lineBreak: false });
    doc.font('Body').fontSize(6.5).fillColor(C.muted).text(NOTE, L, fy + 10, { width: W - 40 });
    doc.font('Body').fontSize(7.5).fillColor(C.muted).text(`${i + 1} / ${range.count}`, L + W - 40, fy, { width: 40, align: 'right', lineBreak: false });
  }
  doc.end();
  return finished;
}
