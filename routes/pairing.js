const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const pino = require('pino');
const QRCode = require('qrcode');

let sock = null;
let qrData = null;
let isConnected = false;

async function initWA() {
  try {
    const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');
    
    const dataDir = path.join(__dirname, '..', 'data', 'baileys');
    
    // JANGAN hapus folder sesi agar proses login yang terputus bisa dilanjutkan
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    
    const { state, saveCreds } = await useMultiFileAuthState(dataDir);
    const { version } = await fetchLatestBaileysVersion();
    
    if (sock) { try { sock.end(undefined); } catch (e) {} }

    sock = makeWASocket({
      version,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      auth: state,
      browser: Browsers.ubuntu('Chrome'), 
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) qrData = qr;
      
      if (connection === 'close') {
        isConnected = false; 
        qrData = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log('Koneksi WA terputus. Kode:', statusCode);
        
        // AUTO-RECONNECT: Jika bukan karena logout, sambung ulang
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log('Menyambung ulang dalam 2 detik...');
          setTimeout(initWA, 2000);
        }
      } else if (connection === 'open') {
        isConnected = true; 
        qrData = null;
        console.log('WhatsApp BERHASIL terhubung!');
      }
    });
    return sock;
  } catch (e) { 
    console.error("Error init WA:", e);
    throw e; 
  }
}

router.post('/start', async (req, res) => {
  try { 
    await initWA(); 
    res.json({ ok: true, msg: 'Engine siap' }); 
  } catch (e) { 
    res.status(500).json({ ok: false, msg: e.message }); 
  }
});

router.get('/qr', async (req, res) => {
  if (isConnected) return res.json({ ok: true, connected: true });
  if (!qrData) return res.json({ ok: false, msg: 'Menunggu QR...' });
  try {
    const img = await QRCode.toDataURL(qrData, { margin: 2, width: 300 });
    res.json({ ok: true, image: img });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

router.post('/code', async (req, res) => {
  try {
    let { phone } = req.body;
    if (!sock) return res.status(400).json({ ok: false, msg: 'Klik START PAIRING dulu.' });
    if (isConnected) return res.status(400).json({ ok: false, msg: 'WhatsApp sudah terhubung.' });
    
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
    
    if (!cleanPhone.startsWith('62')) {
      return res.status(400).json({ ok: false, msg: 'Nomor harus diawali 62.' });
    }

    await new Promise(r => setTimeout(r, 2000));
    const code = await sock.requestPairingCode(cleanPhone);
    res.json({ ok: true, code });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message || 'Gagal meminta code. Coba lagi.' });
  }
});

router.get('/status', (req, res) => {
  res.json({ ok: true, connected: isConnected, globalSenders: isConnected ? 1 : 0 });
});

router.getSock = () => sock;

module.exports = router;
