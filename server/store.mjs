// Participant data: the Apps Script bridge to the Google Sheet (apps-script/Code.gs), or an
// in-memory stand-in for local runs without one. Both expose the same four calls.

export function appsScriptStore({ url, secret, fetchImpl = fetch, timeoutMs = 60_000 }) {
  async function rpc(op, args = {}) {
    let res;
    try {
      // text/plain: Apps Script reads the raw body; fetch follows its redirect to the result.
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ secret, op, ...args }),
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw Object.assign(new Error(`Apps Script unreachable: ${e.message}`), { code: 503 });
    }
    const text = await res.text();
    let out;
    try { out = JSON.parse(text); } catch {
      // A login or error page instead of JSON: usually the deployment isn't "Anyone".
      throw Object.assign(new Error(`Apps Script returned HTTP ${res.status}, not JSON. Check the Web app URL and that access is "Anyone".`), { code: 502 });
    }
    if (!out.ok) throw Object.assign(new Error(`Apps Script: ${out.error}`), { code: out.code || 500 });
    return out.result;
  }

  return {
    kind: 'apps-script',
    ping: () => rpc('ping'),
    saveProfile: (data) => rpc('saveProfile', { data }),
    loadProfile: (participantId) => rpc('loadProfile', { participantId }),
    saveApproval: (participantId, cardId, text) => rpc('saveApproval', { participantId, cardId, text }),
    logPrompt: (entry) => rpc('logPrompt', { entry }),
    saveReport: (participantId, base64, name) => rpc('saveReport', { participantId, base64, name }),
  };
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newId = () => 'LL-' + Array.from({ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function memoryStore() {
  const profiles = new Map();
  const log = [];
  const answers = [];
  const reports = new Map();
  return {
    kind: 'memory',
    profiles, log, answers, reports,
    async saveReport(id, base64, name) {
      if (!profiles.has(id)) throw Object.assign(new Error('Profil tidak dijumpai'), { code: 404 });
      const at = stamp();
      reports.set(id, { base64, name, at });
      return { fileId: `memory-${id}`, link: `memory://${encodeURIComponent(name)}`, at };
    },
    async ping() { return { ok: true } },
    async saveProfile(data) {
      const id = profiles.has(data.participantId) || /^LL-[A-Z0-9]{8}$/.test(data.participantId || '') ? data.participantId : newId();
      const prev = profiles.get(id) || { data: {}, approvals: {}, createdAt: stamp() };
      const { participantId, ...fields } = data;
      const updatedAt = stamp();
      profiles.set(id, { ...prev, data: { ...prev.data, ...fields }, updatedAt });
      return { participantId: id, updatedAt };
    },
    async loadProfile(id) {
      const p = profiles.get(id);
      return p ? { participantId: id, updatedAt: p.updatedAt, data: p.data, approvals: p.approvals } : null;
    },
    async saveApproval(id, cardId, text) {
      const p = profiles.get(id);
      if (!p) throw Object.assign(new Error('Profil tidak dijumpai'), { code: 404 });
      const at = stamp();
      p.approvals[cardId] = { text, at };
      answers.push({ participantId: id, cardId, answer: text, at });
      return { at };
    },
    async logPrompt(entry) { log.push({ ...entry, at: stamp() }); return true },
  };
}
