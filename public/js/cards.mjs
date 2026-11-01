// LIVE LARIS course content shared by the browser (app.mjs) and the server (prompt-writer.mjs).
// Cards follow the Trainer Deck sections and the Participant Workbook "AI Prompt Cards".
// `id` is stable: the Sheet stores each card's approved output under it. `short` is the one-line purpose shown on the card.

export const CARDS = [
  { id: 'reality', ref: '01 · Reality Check', name: 'LIVE Reality Check',
    short: "Kenal pasti titik kebocoran utama LIVE anda dan satu perkara untuk dibaiki dahulu.",
    task: 'Analisis jawapan Reality Check. Kenal pasti titik kebocoran utama (Attention, Retention, Interest, Confidence, Action) berdasarkan keutamaan dan tanda yang diberi, punca berkemungkinan, SATU perkara untuk diperbaiki dahulu dan cara merekod 2 metrik yang dipilih. Bezakan metrik perhatian dan metrik jualan.' },
  { id: 'product', ref: '02 · Product & Offer', name: 'Product Intelligence',
    short: "Asingkan ciri, manfaat dan bukti produk anda menjadi Product Selling Blueprint.",
    task: 'Berdasarkan maklumat produk, asingkan ciri, manfaat yang munasabah dan bukti yang perlu ditunjukkan. Susun Product Selling Blueprint: pelanggan sasaran, situasi pelanggan, 3 × ciri → manfaat → bukti, harga & variasi, tawaran/pakej sebenar, kaedah pembelian, dan senarai PERLU SEMAK. Jangan tambah fakta yang tiada dalam input.' },
  { id: 'angles', ref: '02 · Product & Offer', name: 'Selling Angles',
    short: "3 sudut jualan yang sesuai dengan pelanggan sasaran anda.",
    task: 'Cadangkan 3 selling angles untuk pelanggan sasaran. Bagi setiap angle: situasi pelanggan, mesej utama dan bukti yang diperlukan. Jangan reka dakwaan.' },
  { id: 'rundown', ref: '03 · Formula LIVE 60 Minit', name: 'LIVE Rundown',
    short: "Rundown LIVE 60 minit, blok demi blok, dengan pelan alternatif.",
    task: 'Bina rundown LIVE 60 minit (00–05 Opening & Hook, 05–15 Build Interest, 15–30 Product Demo, 30–40 Engagement & Objection, 40–50 Offer & Closing, 50–60 Repeat & Checkout). Setiap blok: tujuan, apa ditunjuk, apa disebut, soalan engagement dan CTA. Sertakan pelan alternatif jika komen perlahan dan jika terlalu banyak soalan, serta ringkasan 30 saat untuk viewers yang baru masuk. Gunakan hanya maklumat produk yang diberi.' },
  { id: 'dosdonts', ref: "04 · Do's & Don'ts", name: "Do's & Don'ts Reviewer",
    short: "Semak skrip dengan checklist sebelum, semasa dan selepas LIVE.",
    task: "Semak rundown/skrip menggunakan checklist Before, During dan After LIVE. Senaraikan isu, sebab dan cadangan pembaikan. Tandakan dakwaan tanpa bukti, scarcity atau urgency palsu, kos/syarat tersembunyi, CTA kabur dan fakta PERLU SEMAK." },
  { id: 'script', ref: '05 · Script Building', name: 'Script Builder H.E.B.A.T',
    short: "3 opening hooks, skrip H.E.B.A.T, skrip demo dan skrip tawaran.",
    task: 'Tulis skrip LIVE Bahasa Melayu percakapan. Sertakan: 3 opening hooks (berasaskan masalah, demonstrasi dan soalan); ayat Empathy; Benefit (ciri → kegunaan → manfaat); Assurance (bukti/demo); Trigger to Buy (CTA jelas); skrip product demonstration 60–90 saat (tunjuk produk → terangkan ciri → kaitkan manfaat → beri bukti → jemput soalan); skrip tawaran penuh; dan transisi antara blok. Labelkan setiap bahagian. Jangan cipta harga atau testimoni.' },
  { id: 'objection', ref: '06 · Engagement & Objection', name: 'Objection Coach',
    short: "Jawapan D.E.N.G.A.R untuk bantahan lazim, serta soalan engagement.",
    task: 'Bina response bank menggunakan D.E.N.G.A.R (Dengar, Empati, Nyatakan fakta, Gali, Arahkan, Respect) untuk: Harga mahal; Saya fikir dahulu; Apa beza dengan produk lain?; Sesuai untuk saya?; Boleh kurang lagi?; dan objection lain dalam profil. Bagi setiap satu: 3 respons sopan (ringkas, empati, penerangan) dan fakta yang menyokong. Tambah 5 soalan engagement mengikut fasa LIVE. Jangan beri diskaun atau cipta perbandingan dan dakwaan.' },
  { id: 'cta', ref: '07 · CTA & Checkout', name: 'CTA & Follow-up',
    short: "CTA yang jelas, langkah checkout dan mesej follow-up.",
    task: 'Berdasarkan kaedah checkout dan tawaran sebenar, hasilkan Direct CTA, Choice CTA (hanya jika pilihan benar-benar wujud) dan Summary CTA; langkah checkout sebenar pelanggan untuk platform peserta; follow-up untuk pelanggan yang bertanya; dan mesej selepas pembelian. Jangan cipta urgency.' },
  { id: 'rehearsal', ref: '08 · Practice Lab', name: 'Rehearsal Partner',
    short: "Latihan main peranan dengan \"pelanggan\" AI dan scorecard 35 markah.",
    task: 'Bertindak sebagai pelanggan sasaran yang mempertimbangkan produk ini. Tanya satu soalan pada satu masa dan tunggu jawapan peserta. Selepas setiap jawapan, beri feedback (pemerhatian → kesan → cadangan) tentang kejelasan dan ketepatan. Selepas 3 pusingan, nilai dengan LIVE Practice Scorecard: 7 kriteria skor 1–5 (jumlah maksimum 35), satu kekuatan dan satu pembaikan.' },
  { id: 'playbook', ref: '09 · Final Playbook', name: 'Master LIVE Selling Playbook',
    short: "Gabungkan semua output yang diluluskan menjadi playbook lengkap.",
    task: "Gabungkan menjadi LIVE Selling Playbook lengkap: Product Selling Blueprint; LIVE Rundown 60 Minit; Do's & Don'ts Checklist; 3 Opening Hooks dan skrip lengkap; Product Demonstration Guide; Engagement & Objection Response Bank; CTA, Checkout & Follow-up; Practice Scorecard dan Action Plan. Akhiri dengan Final Quality Check (lengkap / perlu semakan) dan My Next LIVE Commitment. Tandakan semua perkara PERLU SEMAK." },
];

export const cardById = (id) => CARDS.find((c) => c.id === id);

export const QC_ITEMS = [
  'Maklumat produk, harga, pakej dan syarat disahkan.',
  'Rundown mempunyai tujuan bagi setiap blok.',
  'Opening hooks sesuai dengan pelanggan sasaran.',
  'Skrip natural apabila dibaca kuat.',
  'Demonstrasi boleh dibuat dengan peralatan tersedia.',
  'Jawapan objection tidak membuat dakwaan tidak disokong.',
  'CTA dan checkout telah diuji.',
  'Follow-up sopan dan relevan.',
  'Saya telah menerima feedback selepas praktis.',
];

export const LEAKS = ['Attention', 'Retention', 'Interest', 'Confidence', 'Action'];
// What participants see for each leakage point ("Kenal Pasti Masalah Semasa LIVE").
export const LEAK_LABELS = {
  Attention: 'Susah tarik penonton', Retention: 'Penonton cepat keluar', Interest: 'Penonton kurang bertanya',
  Confidence: 'Penonton belum yakin', Action: 'Penonton tak jadi beli',
};

export const METRICS = {
  mAttention: 'Attention', mEngagement: 'Engagement', mIntent: 'Intent', mConversion: 'Conversion', mFollowup: 'Follow-up',
};

// Form field → label used when the profile is shown to the AI. Leak, metric and checklist fields are summarised separately.
export const LABELS = {
  owner: 'Nama pemilik', businessName: 'Nama bisnes', years: 'Tempoh operasi', model: 'Model bisnes', industry: 'Industri',
  team: 'Saiz team', location: 'Lokasi', sales: 'Jualan bulanan', customer: 'Pelanggan sasaran', age: 'Umur pelanggan',
  customerNeed: 'Situasi/masalah pelanggan', businessDesc: 'Penerangan bisnes',
  platform: 'Platform LIVE', experience: 'Pengalaman LIVE', liveCount30: 'Kekerapan LIVE (30 hari)', liveDuration: 'Purata tempoh LIVE',
  viewersEnter: 'Apa berlaku apabila viewers masuk', commonQuestions: 'Soalan paling kerap', checkout: 'Cara pelanggan membeli',
  improveOne: 'Satu perkara untuk diperbaiki', goal: 'Matlamat LIVE', liveExtra: 'Nota operasi LIVE',
  productType: 'Jenis tawaran', productName: 'Produk fokus', price: 'Harga', size: 'Saiz/variasi', features: 'Ciri/bahan/spesifikasi',
  benefits: 'Manfaat boleh disokong', proof: 'Bukti/dokumen', difference: 'Perbezaan', reviews: 'Review', stock: 'Stok/kapasiti',
  offer: 'Tawaran/pakej', demo: 'Demo', objections: 'Objection pelanggan', productExtra: 'Cara guna/amaran/polisi', toVerify: 'PERLU SEMAK',
  nextLiveAt: 'LIVE seterusnya', nextProduct: 'Produk LIVE seterusnya', nextChange: 'Perubahan untuk diuji', nextMetric: 'Metrik direkod',
  reviewDate: 'Tarikh semak hasil', commitNotes: 'Nota susulan',
};

const v = (d, k) => String(d?.[k] ?? '').trim();
const or = (s) => s || '[Belum diberikan]';

/** The participant's answers as labelled lines (what the AI sees). */
export function profileText(d) {
  const lines = Object.entries(LABELS).map(([k, l]) => `${l}: ${or(v(d, k))}`);
  const leaks = LEAKS.map((n) => {
    const sign = v(d, `leak${n}Sign`); // only on profiles saved before the sign boxes were removed
    return `${LEAK_LABELS[n]} (${n}) ${v(d, `leak${n}`) || '-'}${sign ? ` (${sign})` : ''}`;
  }).join('; ');
  lines.splice(lines.findIndex((l) => l.startsWith('Satu perkara')), 0, `Masalah semasa LIVE (skor 1 = tiada masalah, 5 = sangat serius): ${leaks}`);
  const metrics = Object.entries(METRICS).filter(([k]) => v(d, k)).map(([, n]) => n);
  lines.push(`Metrik dipilih: ${metrics.join(', ') || '[Belum dipilih]'}`);
  lines.push(`Final Quality Check: ${QC_ITEMS.map((q, i) => (v(d, `qc${i}`) ? '✓ ' : '☐ ') + q).join(' | ')}`);
  return lines.join('\n');
}

/** Approved outputs from earlier cards, for the Master Playbook. */
export function approvedText(approvals, exceptId) {
  const done = CARDS.filter((c) => c.id !== exceptId && approvals?.[c.id]?.text);
  if (!done.length) return '';
  return done.map((c) => `--- ${c.name} ---\n${approvals[c.id].text}`).join('\n\n');
}

export const RULES = `PERATURAN WAJIB:
1. Bezakan FAKTA DIBERIKAN, CADANGAN AI dan [PERLU SEMAK].
2. Jangan reka fakta, harga, stok, bahan, sijil, status regulatori, testimoni, review, manfaat, hasil, polisi, promosi atau urgency.
3. Jangan tukar 'ada dokumen/sijil' menjadi 'diluluskan KKM/NPRA'. Jangan buat dakwaan kesihatan/kecantikan/keberkesanan tanpa bukti.
4. Jika maklumat belum cukup, hasilkan draf yang boleh dibuat dan tandakan [PERLU SEMAK]. Jangan hentikan keseluruhan kerja.
5. Gunakan Bahasa Melayu Malaysia yang natural, praktikal dan mudah disebut ketika LIVE. Satu ayat, satu idea.
6. Jangan menjanjikan jualan atau conversion. Jangan gunakan scarcity palsu, pilihan palsu atau mendesak pelanggan.
7. Setiap output mesti boleh terus digunakan dan ikut format workbook (jadual/skrip/checklist).`;

/** The fixed prompt, used when the AI prompt writer is off or fails. */
export function templatePrompt(card, data, approvals) {
  const approved = card.id === 'playbook' ? approvedText(approvals, card.id) : '';
  return `ANDA IALAH LIVE LARIS AI BUILDER — pembantu LIVE selling praktikal untuk usahawan mikro dan SME Malaysia, mengikut kursus "LIVE LARIS: Dari Viewers ke Buyers".

PROFIL PESERTA (gunakan sebagai konteks induk; jangan tanya semula):
${profileText(data)}${approved ? `\n\nOUTPUT YANG TELAH DILULUSKAN PESERTA (gunakan sebagai sumber utama; jangan ubah fakta):\n${approved}` : ''}

${RULES}

KAD AI: ${card.name} (${card.ref})
TUGAS: ${card.task}

Hasilkan output lengkap dan tersusun. Akhiri dengan cadangan langkah seterusnya tanpa bertanya semula perkara yang telah dijawab.`;
}
