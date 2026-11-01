// The participant's full LIVE LARIS report as a PDF (A4): their answers, the approved Master
// Playbook and other approved materials, the quality check and their next-LIVE plan.
// Same look as the Business Quick Fix report: Inter + Bricolage Grotesque (OFL), nude/red/black.
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS, QC_ITEMS, LEAKS, LEAK_LABELS } from '../public/js/cards.mjs';
import { parseBlocks } from '../public/js/richtext.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fonts = path.join(here, 'fonts');
const LOGOS = { klinik: path.join(here, '..', 'public', 'img', 'klinik-bisnes-sme.png'), rcg: path.join(here, '..', 'public', 'img', 'rcg.png') };
const C = { nude: '#f7eee1', red: '#c02026', ink: '#000000', text: '#2e2924', muted: '#5c534a', line: '#ebe1d3', soft: '#fcf8f2' };

// Labels as participants see them on the page.
const SECTIONS = [
  ['01 · Profil bisnes', 'Profil Bisnes', [
    ['owner', 'Nama'], ['businessName', 'Nama bisnes / jenama'], ['years', 'Tempoh berniaga'], ['model', 'Cara berniaga'],
    ['industry', 'Industri'], ['team', 'Saiz team'], ['location', 'Kawasan pelanggan'], ['sales', 'Anggaran jualan sebulan'],
    ['customer', 'Pelanggan sasaran'], ['age', 'Umur pelanggan'], ['customerNeed', 'Masalah pelanggan yang diselesaikan'],
    ['businessDesc', 'Bisnes anda secara ringkas']]],
  ['02 · Reality check', 'LIVE Selling Reality Check', [
    ['platform', 'Platform LIVE'], ['experience', 'Pengalaman LIVE'], ['liveCount30', 'LIVE dalam 30 hari terakhir'],
    ['liveDuration', 'Purata tempoh LIVE'], ['viewersEnter', 'Apa berlaku apabila viewers masuk'], ['commonQuestions', 'Soalan paling kerap'],
    ['checkout', 'Cara pelanggan membeli']]],
  ['03 · Produk / servis', 'Produk / Servis Anda', [
    ['productType', 'Apa yang dijual'], ['productName', 'Produk / servis untuk LIVE'], ['price', 'Harga jualan'], ['size', 'Saiz / pilihan / pakej'],
    ['features', 'Ciri atau bahan penting'], ['benefits', 'Manfaat untuk pelanggan'], ['difference', 'Keistimewaan'], ['proof', 'Bukti / sijil'],
    ['reviews', 'Kata pelanggan'], ['stock', 'Stok / tempahan'], ['offer', 'Promosi'], ['demo', 'Yang boleh ditunjuk semasa LIVE'],
    ['objections', 'Soalan / keraguan pelanggan'], ['productExtra', 'Maklumat penting lain'], ['toVerify', 'Maklumat PERLU SEMAK']]],
];
const AFTER_LEAKS = [['goal', 'Apa yang mahu dicapai melalui LIVE'], ['liveExtra', 'Cara buat LIVE']];
const PLAN = [['nextLiveAt', 'Bila LIVE seterusnya'], ['nextProduct', 'Produk untuk dijual'], ['nextChange', 'Satu perkara untuk dicuba / dibaiki'],
  ['nextMetric', 'Apa yang akan dikira / dicatat'], ['reviewDate', 'Bila semak hasil'], ['commitNotes', 'Perlu disediakan']];
const NOTE = 'Penafian AI: Prompt dan output AI adalah draf awal berasaskan input peserta. Semak semua fakta, harga dan dakwaan sebelum digunakan; hasil jualan tidak dijamin.';

// Emoji and other symbols outside the fonts would print as boxes.
const clean = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\r/g, '').replace(/[ \t]{2,}/g, ' ').trim();
const dateMY = (d) => d.toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });

export const reportFileName = (data, id) =>
  `Panduan LIVE · ${clean(data.businessName).replace(/[^\p{L}\p{N} .-]+/gu, '').trim().slice(0, 60) || 'Peserta'} · ${id}.pdf`;

/** Ready when step 1 is filled in and the Master Playbook has been approved. */
export function reportMissing(data = {}, approvals = {}) {
  const missing = [];
  const required = ['owner', 'businessName', 'years', 'model', 'industry', 'team', 'location', 'sales', 'customer', 'age', 'customerNeed'];
  if (required.some((k) => !String(data[k] ?? '').trim())) missing.push('Profil bisnes belum lengkap');
  if (!approvals.playbook?.text) missing.push('Panduan LIVE Lengkap (Master Playbook) belum diluluskan');
  return missing;
}

/** prompts: card name → { prompt, at } (the latest prompt we gave for each card, from the Prompt Log). */
export function reportPdf({ participantId, data = {}, approvals = {}, prompts = {}, date = new Date() }) {
  const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 50, bottom: 60, left: 52, right: 52 },
    info: { Title: `Panduan LIVE — ${clean(data.businessName) || 'Peserta'}`, Author: 'Klinik Bisnes SME' } });
  doc.registerFont('Body', path.join(fonts, 'Inter-Regular.woff'));
  doc.registerFont('Bold', path.join(fonts, 'Inter-Bold.woff'));
  doc.registerFont('Display', path.join(fonts, 'BricolageGrotesque-Bold.woff'));
  const L = doc.page.margins.left, W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  const room = (h) => { if (doc.y + h > bottom()) doc.addPage(); };
  const text = (s, { size = 10, font = 'Body', color = C.ink, gap = 4, indent = 0 } = {}) => {
    doc.font(font).fontSize(size).fillColor(color).text(clean(s) || '—', L + indent, doc.y, { width: W - indent, lineGap: 1.6 });
    doc.y += gap;
  };
  const section = (label, title) => {
    room(80);
    doc.y += 12;
    doc.font('Bold').fontSize(7.5).fillColor(C.red).text(label.toUpperCase(), L, doc.y, { characterSpacing: 1.2, width: W });
    doc.y += 3;
    doc.font('Display').fontSize(15).fillColor(C.ink).text(clean(title), L, doc.y, { width: W });
    doc.moveTo(L, doc.y + 4).lineTo(L + W, doc.y + 4).lineWidth(0.8).strokeColor(C.line).stroke();
    doc.y += 12;
  };
  const field = (label, value) => {
    const v = clean(value);
    if (!v) return;
    room(34);
    text(label, { size: 8.5, font: 'Bold', color: C.muted, gap: 1 });
    text(v, { gap: 7 });
  };
  // A table from a ChatGPT answer: bordered cells that wrap, a nude header row repeated on each new
  // page, columns sized by their content. Too many columns to fit legibly → one line per row.
  const table = ({ header, rows }) => {
    const n = (header || rows[0] || []).length;
    if (!n) return;
    if (n > 6) {
      [header, ...rows].filter(Boolean).forEach((r) => { room(16); text(r.join('   |   '), { size: 9, color: C.text, gap: 1.5 }) });
      return;
    }
    const pad = 5, size = 8.5;
    const weight = Array.from({ length: n }, (_, c) => {
      const cells = [header, ...rows].filter(Boolean).map((r) => clean(r[c]));
      const longestWord = Math.max(...cells.flatMap((t) => t.split(/\s+/).map((w) => w.length)));
      return Math.max(longestWord + 2, Math.min(40, Math.max(6, ...cells.map((t) => t.length))));
    });
    const total = weight.reduce((a, b) => a + b, 0);
    const widths = weight.map((w) => (w / total) * W);
    const cellH = (cells, font) => Math.max(...cells.map((t, c) => doc.font(font).fontSize(size).heightOfString(clean(t) || ' ', { width: widths[c] - 2 * pad, lineGap: 1 }))) + 2 * pad;
    const drawRow = (cells, isHeader) => {
      const font = isHeader ? 'Bold' : 'Body';
      const h = cellH(cells, font);
      const y = doc.y;
      let x = L;
      cells.forEach((t, c) => {
        if (isHeader) doc.rect(x, y, widths[c], h).fill(C.nude);
        doc.rect(x, y, widths[c], h).lineWidth(0.6).strokeColor(C.line).stroke();
        doc.font(font).fontSize(size).fillColor(isHeader ? C.ink : C.text).text(clean(t), x + pad, y + pad, { width: widths[c] - 2 * pad, lineGap: 1 });
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
  // Approved ChatGPT text: headings, bold markers and bullets made readable; tables drawn as tables.
  const richText = (raw) => {
    for (const block of parseBlocks(raw)) {
      if (block.type === 'table') { table(block); continue; }
      let line = block.text.replace(/\*\*|__/g, '');
      const h = line.match(/^\s*#{1,6}\s+(.*)/);
      if (h) { room(30); doc.y += 4; text(h[1], { font: 'Display', size: 11.5, gap: 3 }); continue; }
      line = line.replace(/^(\s*)[-*•]\s+/, '$1•  ');
      if (!line.trim()) { doc.y += 4; continue; }
      room(16);
      text(line, { size: 9.5, color: C.text, gap: 1.5, indent: /^\s+•/.test(line) ? 12 : 0 });
    }
  };
  const tickbox = (checked, y) => {
    doc.roundedRect(L, y + 1, 10, 10, 2).lineWidth(0.9).strokeColor(checked ? C.red : C.muted).stroke();
    if (checked) doc.moveTo(L + 2, y + 6).lineTo(L + 4.5, y + 8.8).lineTo(L + 8.5, y + 3.2).lineWidth(1.3).strokeColor(C.red).stroke();
  };

  // Cover: logos on white, nude title band
  doc.image(LOGOS.klinik, L, 18, { height: 44 });
  doc.image(LOGOS.rcg, L + W - 55, 18, { fit: [55, 44], align: 'right' });
  const B = 82;
  doc.rect(0, B, doc.page.width, 104).fill(C.nude);
  doc.font('Bold').fontSize(8).fillColor(C.red).text('LIVE LARIS · DARI VIEWERS KE BUYERS', L, B + 20, { characterSpacing: 1.4, width: W });
  doc.font('Display').fontSize(22).fillColor(C.ink).text('Panduan LIVE Saya', L, B + 35, { width: W });
  doc.font('Body').fontSize(9.5).fillColor(C.text)
    .text([clean(data.businessName), clean(data.owner), dateMY(date), participantId].filter(Boolean).join('  ·  '), L, B + 68, { width: W });
  doc.y = B + 124;

  // 1–3: the participant's answers
  SECTIONS.forEach(([label, title, fields], i) => {
    section(label, title);
    fields.forEach(([k, l]) => field(l, data[k]));
    if (i !== 1 && !fields.some(([k]) => clean(data[k]))) text('Belum diisi.', { color: C.muted, gap: 6 });
    if (i === 1) {
      room(110);
      text('Kenal Pasti Masalah Semasa LIVE (1 = tiada masalah, 5 = sangat serius)', { size: 8.5, font: 'Bold', color: C.muted, gap: 4 });
      LEAKS.forEach((n) => {
        room(16);
        const y = doc.y, score = clean(data[`leak${n}`]) || '–';
        doc.font('Body').fontSize(10).fillColor(C.ink).text(LEAK_LABELS[n], L, y, { width: W - 60 });
        doc.font('Bold').fontSize(10).fillColor(score === '–' ? C.muted : C.ink).text(score === '–' ? '–' : `${score} / 5`, L + W - 50, y, { width: 50, align: 'right' });
        doc.y = Math.max(doc.y, y + 14) + 2;
      });
      doc.y += 5;
      AFTER_LEAKS.forEach(([k, l]) => field(l, data[k]));
    }
  });

  // 4: approved materials — the Master Playbook first, then the rest in course order
  const playbook = CARDS.find((c) => c.id === 'playbook');
  section('04 · Panduan LIVE lengkap', playbook.title);
  if (approvals.playbook?.text) richText(approvals.playbook.text);
  else text('Belum diluluskan.', { color: C.muted });
  const others = CARDS.filter((c) => c.id !== 'playbook' && approvals[c.id]?.text);
  if (others.length) {
    section('05 · Bahan LIVE yang diluluskan', 'Bahan LIVE Anda');
    others.forEach((c) => {
      room(60);
      doc.y += 6;
      const y = doc.y;
      doc.rect(L, y, 3, 16).fill(C.red);
      doc.font('Display').fontSize(12).fillColor(C.ink).text(clean(c.title), L + 10, y + 1, { width: W - 10 });
      doc.y += 6;
      richText(approvals[c.id].text);
    });
  }

  // 6: quality check and next-LIVE plan
  section(others.length ? '06 · Komitmen & semakan' : '05 · Komitmen & semakan', 'Panduan LIVE Anda Dah Siap?');
  const done = QC_ITEMS.filter((_, i) => clean(data[`qc${i}`])).length;
  text(`Kemajuan semakan: ${done} / ${QC_ITEMS.length} siap`, { size: 9, font: 'Bold', color: C.muted, gap: 6 });
  QC_ITEMS.forEach((q, i) => {
    room(18);
    const y = doc.y;
    tickbox(Boolean(clean(data[`qc${i}`])), y);
    doc.font('Body').fontSize(10).fillColor(C.ink).text(q, L + 18, y, { width: W - 18, lineGap: 1.4 });
    doc.y += 4;
  });
  doc.y += 6;
  room(60);
  doc.font('Display').fontSize(12.5).fillColor(C.ink).text('Pelan LIVE Saya Seterusnya', L, doc.y, { width: W });
  doc.y += 6;
  PLAN.forEach(([k, l]) => field(l, data[k] || 'Belum diisi'));

  // Appendix: the prompt we gave for each approved card, so each answer can be read next to what produced it
  const used = CARDS.filter((c) => approvals[c.id]?.text && prompts[c.name]?.prompt);
  if (used.length) {
    doc.addPage();
    section('Lampiran', 'Arahan ChatGPT yang digunakan');
    text('Arahan (prompt) terakhir yang AI tulis untuk setiap bahan yang anda luluskan. Gunakan semula jika mahu kemas kini bahan dengan maklumat baharu.', { size: 9, color: C.muted, gap: 8 });
    used.forEach((c) => {
      room(70);
      doc.y += 6;
      const y = doc.y;
      doc.rect(L, y, 3, 16).fill(C.red);
      doc.font('Display').fontSize(11.5).fillColor(C.ink).text(clean(c.title), L + 10, y + 1, { width: W - 10 });
      if (prompts[c.name].at) text(`Dijana: ${prompts[c.name].at}`, { size: 7.5, color: C.muted, gap: 3, indent: 10 });
      doc.y += 2;
      for (const line of String(prompts[c.name].prompt).replace(/\r/g, '').split('\n')) {
        if (!line.trim()) { doc.y += 3; continue; }
        room(14);
        text(line, { size: 8.5, color: C.text, gap: 1 });
      }
      doc.y += 6;
    });
  }

  // Footer on every page: brand line, disclaimer, page number
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // the footer sits in the margin; without this pdfkit starts a new page
    const y = doc.page.height - 44;
    doc.font('Bold').fontSize(7).fillColor(C.ink).text('LIVE LARIS AI Builder | Klinik Bisnes SME | Richworks X Academy | powered by RCG', L, y, { width: W - 40, lineBreak: false });
    doc.font('Body').fontSize(6.5).fillColor(C.muted).text(NOTE, L, y + 10, { width: W - 40 });
    doc.font('Body').fontSize(7.5).fillColor(C.muted).text(`${i + 1} / ${range.count}`, L + W - 40, y, { width: 40, align: 'right', lineBreak: false });
  }
  doc.end();
  return finished;
}
