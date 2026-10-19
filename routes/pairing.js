const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const QRCode = require('qrcode');

const sessions = new Map();

async function initWA(userId) {
  try {
    const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
    
    const dataDir = path.join(__dirname, '..', 'data', `session_${userId}`);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    const { state, saveCreds } = await useMultiFileAuthState(dataDir);
    const { version } = await fetchLatestBaileysVersion();
    
    if (sessions.has(userId)) {
      try { sessions.get(userId).sock.end(undefined); } catch(e){}
    }

    const sock = makeWASocket({
      version, 
      printQRInTerminal: false, 
      logger: pino({ level: 'silent' }), 
      auth: state, 
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false
    });

    const userSession = { sock, qr: null, connected: false };
    sessions.set(userId, userSession);

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => {
      if (u.qr) userSession.qr = u.qr;
      if (u.connection === 'open') { userSession.connected = true; userSession.qr = null; }
      if (u.connection === 'close') {
        userSession.connected = false; userSession.qr = null;
        const statusCode = u.lastDisconnect?.error?.output?.statusCode;
        // Auto reconnect kalau bukan karena logout
        if (statusCode !== DisconnectReason.loggedOut) {
          setTimeout(() => initWA(userId), 3000);
        }
      }
    });
    
    return sock;
  } catch (e) { throw e; }
}

router.post('/start', async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ ok: false, msg: 'Login dulu.' });
    await initWA(req.session.user.id);
    res.json({ ok: true, msg: 'Pairing engine siap' });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.get('/qr', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false });
  const userSession = sessions.get(req.session.user.id);
  if (!userSession) return res.json({ ok: false, msg: 'Belum start.' });
  if (userSession.connected) return res.json({ ok: true, connected: true });
  if (!userSession.qr) return res.json({ ok: false, msg: 'Menunggu QR...' });
  try {
    const img = await QRCode.toDataURL(userSession.qr, { margin: 2, width: 300 });
    res.json({ ok: true, image: img });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.post('/code', async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ ok: false });
    const userSession = sessions.get(req.session.user.id);
    if (!userSession) return res.status(400).json({ ok: false, msg: 'Klik START PAIRING dulu.' });
    if (userSession.connected) return res.status(400).json({ ok: false, msg: 'Sudah terhubung.' });

    let { phone } = req.body;
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('62')) return res.status(400).json({ ok: false, msg: 'Nomor harus 62.' });

    // Tunggu 2 detik agar socket benar-benar siap
    await new Promise(r => setTimeout(r, 2000));
    const code = await userSession.sock.requestPairingCode(cleanPhone);
    res.json({ ok: true, code });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.get('/status', (req, res) => {
  if (!req.session.user) return res.status(401).json({ ok: false });
  const userSession = sessions.get(req.session.user.id);
  let globalSenders = 0;
  for (const [id, sess] of sessions.entries()) {
    if (sess.connected) globalSenders++;
  }
  res.json({ 
    ok: true, 
    connected: userSession ? userSession.connected : false,
    globalSenders 
  });
});

router.getSock = (userId) => {
  const sess = sessions.get(userId);
  return sess ? sess.sock : null;
};

module.exports = router;
