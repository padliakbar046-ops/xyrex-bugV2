const socket = io();
let currentUser = null;
let selectedSenderBug = 'private';

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include'
  });
  return r.json();
}

function customAlert(title, desc) {
  let overlay = document.getElementById('customModal');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'customModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box"><div class="modal-icon">!</div><div class="modal-title" id="modalTitle"></div><div class="modal-desc" id="modalDesc"></div><button class="neo-btn" style="background:#000;color:#fff;" onclick="closeModal()">OK</button></div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalDesc').textContent = desc;
  overlay.classList.add('show');
}
function closeModal() { document.getElementById('customModal').classList.remove('show'); }

function toggleTheme() {
  const isDark = document.getElementById('darkModeToggle').checked;
  if (isDark) { document.body.classList.add('dark-mode'); localStorage.setItem('xyrex_theme', 'dark'); }
  else { document.body.classList.remove('dark-mode'); localStorage.setItem('xyrex_theme', 'light'); }
}
function loadTheme() {
  const saved = localStorage.getItem('xyrex_theme');
  if (saved === 'dark') { document.body.classList.add('dark-mode'); const t = document.getElementById('darkModeToggle'); if(t) t.checked = true; }
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
}

function router() {
  if (!currentUser) return showPage('login');
  const hash = (location.hash || '#chat').slice(1);
  const validBase = ['chat','pairing','bug','tools','notes','admin','settings'];
  const rootPath = hash.split('/')[0];
  const view = validBase.includes(rootPath) ? rootPath : 'chat';

  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.dataset.view === hash));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === view));

  if (view === 'admin') loadUsers();
  if (view === 'notes') loadNotes();
  if (view === 'settings') loadProfile();
  if (view === 'bug' || view === 'bug/xyrex') loadSenderStatus();
  if (view === 'tools/ddos' && currentUser.role === 'member') { location.hash = '#tools'; customAlert('Akses Ditolak', 'Fitur DDoS khusus Premium ke atas.'); }
}
window.addEventListener('hashchange', router);

async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const r = await api('/auth/login', { method: 'POST', body: { username, password } });
  if (!r.ok) return customAlert('Login Gagal', r.msg);
  currentUser = r.user; enterApp();
}

function enterApp() {
  showPage('app');
  document.getElementById('userBox').textContent = `@${currentUser.username}`;
  document.getElementById('navAdmin').style.display = (currentUser.role === 'owner' || currentUser.role === 'admin') ? '' : 'none';
  
  const roleSelect = document.getElementById('newRole');
  if (roleSelect) {
    const opt = Array.from(roleSelect.options).find(o => o.value === 'owner');
    if (opt) opt.style.display = (currentUser.role === 'owner') ? '' : 'none';
  }

  // === KUNCI TOMBOL DDOS UNTUK MEMBER ===
  const btnDdos = document.getElementById('btnMenuDdos');
  if (btnDdos) {
    if (currentUser.role === 'member') {
      btnDdos.style.opacity = '0.5';
      btnDdos.removeAttribute('href'); 
      btnDdos.style.cursor = 'pointer'; 
      btnDdos.onclick = (e) => {
        e.preventDefault();
        customAlert('Akses Ditolak', 'Fitur DDoS hanya tersedia untuk role Premium, Admin, dan Owner.');
      };
    } else {
      btnDdos.style.opacity = '1';
      btnDdos.setAttribute('href', '#tools/ddos');
      btnDdos.style.cursor = 'default';
      btnDdos.onclick = null;
    }
  }

  if (!location.hash) location.hash = '#chat';
  router();
  socket.emit('chat:join');
}

async function doLogout() {
  await api('/auth/logout', { method: 'POST' });
  currentUser = null; location.hash = ''; showPage('login'); document.getElementById('loginPass').value = '';
}

function loadProfile() {
  if (!currentUser) return;
  document.getElementById('profileName').textContent = currentUser.username;
  document.getElementById('profileRole').textContent = `Role: ${currentUser.role.toUpperCase()}`;
  document.querySelector('.profile-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
}

function selectBugType(el, type) {
  document.querySelectorAll('.bug-type-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('selectedBugType').value = type;
}

async function loadSenderStatus() {
  const r = await api('/pairing/status');
  if (!r.ok) return;
  
  const gCount = document.getElementById('globalCount');
  if (gCount) gCount.textContent = r.globalSenders;

  const boxGlobal = document.getElementById('boxGlobal');
  const boxPrivate = document.getElementById('boxPrivate');

  if (boxGlobal && boxPrivate) {
    if (!r.connected) {
      boxPrivate.classList.add('disabled');
      if (selectedSenderBug === 'private') selectSender('global');
    } else {
      boxPrivate.classList.remove('disabled');
    }
    
    if (r.globalSenders === 0) {
      boxGlobal.classList.add('disabled');
    } else {
      boxGlobal.classList.remove('disabled');
    }
  }
}

function selectSender(type) {
  if (type === 'global') {
    const boxGlobal = document.getElementById('boxGlobal');
    if (boxGlobal && boxGlobal.classList.contains('disabled')) return;
  }
  if (type === 'private') {
    const boxPrivate = document.getElementById('boxPrivate');
    if (boxPrivate && boxPrivate.classList.contains('disabled')) return customAlert('Belum Pairing', 'Anda harus pairing WhatsApp dulu untuk pakai Private.');
  }
  
  selectedSenderBug = type;
  const boxGlobal = document.getElementById('boxGlobal');
  const boxPrivate = document.getElementById('boxPrivate');
  if (boxGlobal && boxPrivate) {
    if (type === 'global') { boxGlobal.classList.add('active'); boxPrivate.classList.remove('active'); }
    else { boxPrivate.classList.add('active'); boxGlobal.classList.remove('active'); }
  }
}

async function changePassword() {
  const oldPass = document.getElementById('oldPass').value;
  const newPass = document.getElementById('newPass').value;
  if (!oldPass || !newPass) return customAlert('Kosong', 'Isi password lama dan baru.');
  const r = await api('/auth/change-password', { method: 'POST', body: { oldPass, newPass } });
  if (!r.ok) return customAlert('Gagal', r.msg);
  customAlert('Sukses', r.msg);
  document.getElementById('oldPass').value = ''; document.getElementById('newPass').value = '';
}

socket.on('chat:history', list => {
  const box = document.getElementById('chatBox'); if (!box) return;
  box.innerHTML = ''; list.forEach(addChatMsg);
});
socket.on('chat:message', addChatMsg);

function addChatMsg(m) {
  const box = document.getElementById('chatBox'); if (!box) return;
  const div = document.createElement('div'); div.className = 'chat-msg';
  const roleClass = m.role ? `role-${m.role}` : 'role-member';
  div.innerHTML = `<span class="chat-user ${roleClass}">${escape(m.user)}</span>: ${escape(m.text)}`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}
function escape(s) { return String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }

function sendChat() {
  const input = document.getElementById('chatInput'); if (!input.value.trim()) return;
  socket.emit('chat:send', { user: currentUser.username, role: currentUser.role, text: input.value.trim() });
  input.value = '';
}

async function startPairing() {
  const qrContainer = document.getElementById('qrContainer');
  const qrImage = document.getElementById('qrImage');
  const qrBox = document.getElementById('qrBox');
  qrContainer.classList.add('hidden'); qrBox.classList.remove('hidden');
  qrBox.textContent = 'Memulai sesi...'; qrImage.src = '';
  const r = await api('/pairing/start', { method: 'POST' });
  if (!r.ok) return qrBox.textContent = 'Gagal: ' + r.msg;
  qrBox.textContent = 'Menunggu QR...';
  const interval = setInterval(async () => {
    const q = await api('/pairing/qr');
    if (q.ok && q.connected) {
      clearInterval(interval); qrContainer.classList.add('hidden');
      qrBox.textContent = 'WhatsApp BERHASIL terhubung!'; qrBox.classList.remove('hidden');
    } else if (q.ok && q.image) {
      clearInterval(interval); qrBox.classList.add('hidden');
      qrContainer.classList.remove('hidden'); qrImage.src = q.image;
    }
  }, 2000);
}

async function requestCode() {
  const phoneInput = document.getElementById('pairPhone').value.trim();
  const box = document.getElementById('pairCodeBox');
  let phone = phoneInput.replace(/[^0-9]/g, '');
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  if (phone.length < 10) return customAlert('Nomor Salah', 'Masukkan nomor valid.');
  box.textContent = 'Meminta kode...';
  const r = await api('/pairing/code', { method: 'POST', body: { phone } });
  if (!r.ok) { box.textContent = 'Gagal.'; return customAlert('Gagal Pairing', r.msg); }
  box.textContent = `Pairing Code: ${r.code}\n\nMasukkan kode ini di WhatsApp.`;
}

async function sendBug() {
  const target = document.getElementById('bugTarget').value.trim();
  const type = document.getElementById('selectedBugType').value;
  const btn = document.querySelector('button[onclick="sendBug()"]');
  if (!target.startsWith('62') && !target.startsWith('+62')) return customAlert('Nomor Tidak Valid', 'Gunakan format +62...');

  const originalText = btn.innerHTML; btn.disabled = true;
  let dots = 0;
  const loadingInterval = setInterval(() => { dots = (dots + 1) % 4; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;margin-right:8px;"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> Memproses${'.'.repeat(dots)}`; }, 300);

  const r = await api('/bug/send', { method: 'POST', body: { target, type, senderType: selectedSenderBug } });
  clearInterval(loadingInterval); btn.disabled = false; btn.innerHTML = originalText;
  if (!r.ok) return customAlert('Gagal Mengirim', r.msg);
  customAlert('Serangan Dimulai', `Bug tipe ${type.toUpperCase()} berhasil dikirim ke ${target}.`);
}

/* TOOLS */
async function toolVideo() {
  const url = document.getElementById('videoUrl').value.trim();
  const out = document.getElementById('videoOut');
  const resultBox = document.getElementById('videoResultBox');
  out.textContent = 'Memproses video...';
  resultBox.classList.add('hidden');
  const r = await api('/tools/video', { method: 'POST', body: { url } });
  if (!r.ok) { out.textContent = 'Gagal.'; return customAlert('Gagal', r.msg); }
  out.textContent = '';
  if (r.result && r.result.video) {
    resultBox.classList.remove('hidden');
    document.getElementById('videoTitle').textContent = r.result.title;
    document.getElementById('videoPlayer').src = r.result.video;
    const dl = document.getElementById('videoDownloadBtn');
    const safeTitle = (r.result.title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 20);
    dl.href = `/api/tools/download?url=${encodeURIComponent(r.result.video)}&filename=${safeTitle}.mp4`;
    dl.removeAttribute('target');
    dl.removeAttribute('download');
  } else { out.textContent = JSON.stringify(r, null, 2); }
}

async function toolGmail() {
  const card = document.getElementById('gmailCard');
  const res = document.getElementById('gmailResult');
  const pass = document.getElementById('gmailPass');
  card.classList.remove('hidden');
  res.textContent = '...'; pass.textContent = '...';
  const r = await api('/tools/gmail');
  if (!r.ok) { res.textContent = 'Gagal'; return; }
  res.textContent = r.email; pass.textContent = r.password;
}

async function toolAnime() {
  const q = document.getElementById('animeQuery').value.trim() || 'naruto';
  const grid = document.getElementById('animeGrid');
  grid.innerHTML = '<p style="font-weight:bold; grid-column:span 2; color:var(--text-muted);">Mencari...</p>';
  
  const r = await api('/tools/anime?q=' + encodeURIComponent(q));
  if (!r.ok) {
    grid.innerHTML = `<p style="color:var(--danger); grid-column:span 2; font-weight:bold;">${r.msg}</p>`;
    return customAlert('Gagal Anime', r.msg);
  }
  
  grid.innerHTML = '';
  r.data.forEach(a => {
    const title = a.title.english || a.title.romaji;
    grid.innerHTML += `<div class="anime-card"><img src="${a.coverImage.large}"><div class="info"><b>${title}</b>ID: ${a.id}</div></div>`;
  });
}

async function toolMusic() {
  const q = document.getElementById('musicQuery').value.trim() || 'lofi';
  const list = document.getElementById('musicList');
  list.innerHTML = '<p style="font-weight:bold; color:var(--text-muted);">Mencari...</p>';
  
  const r = await api('/tools/music?q=' + encodeURIComponent(q));
  if (!r.ok) {
    list.innerHTML = `<p style="color:var(--danger); font-weight:bold;">${r.msg}</p>`;
    return customAlert('Gagal Musik', r.msg);
  }
  
  const tracks = r.data.filter(x => x.previewUrl);
  if (!tracks.length) return list.innerHTML = '<p style="font-weight:bold; color:var(--text-muted);">Lagu tidak ditemukan.</p>';
  
  list.innerHTML = '';
  tracks.forEach(t => {
    list.innerHTML += `<div class="music-card"><div class="music-header"><img src="${t.artworkUrl100}"><div class="music-info"><b>${t.trackName}</b><span>${t.artistName}</span></div></div><audio controls src="${t.previewUrl}"></audio></div>`;
  });
}

async function toolScan() {
  const url = document.getElementById('scanUrl').value.trim();
  const out = document.getElementById('scanOut');
  if (!url) return customAlert('Kosong', 'Masukkan URL.');
  out.textContent = 'Memindai (maks 8 detik)...';
  try {
    const r = await api('/tools/scan', { method: 'POST', body: { url } });
    if (!r.ok) { out.textContent = 'Gagal: ' + r.msg; return customAlert('Gagal', r.msg); }
    let html = `<b>Target:</b> ${r.url}\n<b>Status:</b> ${r.status}\n<b>Server:</b> ${r.server}\n\n--- TEMUAN ---\n`;
    if (!r.findings.length) html += 'Aman (Header lengkap).\n';
    r.findings.forEach(f => html += `- ${f}\n`);
    out.innerHTML = `<pre style="white-space:pre-wrap;">${html}</pre>`;
  } catch(e) { out.textContent = 'Error koneksi.'; }
}

async function startDdos() {
  let target = document.getElementById('ddosTarget').value.trim();
  const duration = +document.getElementById('ddosDur').value;
  const threads = +document.getElementById('ddosThr').value;
  target = target.replace(/[, ]+$/, "");
  if (!target) return customAlert('Target Kosong', 'Isi URL target terlebih dahulu.');
  if (!target.startsWith('https://')) return customAlert('URL Salah', 'URL harus diawali https://');
  if (duration > 120) return customAlert('Batas Maksimal', 'Durasi maksimal adalah 120 detik.');
  if (threads > 200) return customAlert('Batas Maksimal', 'Threads maksimal adalah 200.');

  document.getElementById('btnStartDdos').disabled = true;
  document.getElementById('ddosOut').classList.remove('hidden');
  
  document.getElementById('statSent').textContent = '0';
  document.getElementById('statRps').textContent = '0.0';
  document.getElementById('statElapsed').textContent = '0s';
  document.getElementById('statOk').textContent = '0';
  document.getElementById('statErr').textContent = '0';
  document.getElementById('statHeld').textContent = '0';
  document.getElementById('ddosProgress').style.width = '0%';
  document.getElementById('ddosProgress').textContent = '0%';
  document.getElementById('statStatus').textContent = 'Menyiapkan serangan...';
  
  const r = await api('/tools/ddos', { method: 'POST', body: { target, duration, threads } });
  if (!r.ok) {
    document.getElementById('btnStartDdos').disabled = false;
    document.getElementById('statStatus').textContent = 'Gagal: ' + r.msg;
    return customAlert('Gagal Memulai', r.msg);
  }
}

socket.off('ddos:stats'); 
socket.on('ddos:stats', s => {
  const elapsedSec = (Date.now() - s.startedAt) / 1000;
  const rps = elapsedSec > 0 ? (s.requests / elapsedSec).toFixed(1) : '0.0';
  const dur = +document.getElementById('ddosDur').value || 60;
  let percent = Math.min((elapsedSec / dur) * 100, 100).toFixed(0);
  
  document.getElementById('statSent').textContent = s.requests;
  document.getElementById('statRps').textContent = rps;
  document.getElementById('statElapsed').textContent = Math.floor(elapsedSec) + 's';
  document.getElementById('statOk').textContent = s.success;
  document.getElementById('statErr').textContent = s.failed;
  document.getElementById('statHeld').textContent = s.activeSockets || 0;
  
  document.getElementById('ddosProgress').style.width = percent + '%';
  document.getElementById('ddosProgress').textContent = percent + '%';
  document.getElementById('statStatus').textContent = 'Menunggu response...';
});

socket.off('ddos:done');
socket.on('ddos:done', s => {
  document.getElementById('btnStartDdos').disabled = false;
  document.getElementById('statStatus').textContent = '[DONE] Serangan Selesai.';
  document.getElementById('ddosProgress').style.width = '100%';
  document.getElementById('ddosProgress').textContent = '100%';
});

async function stopDdos() {
  document.getElementById('statStatus').textContent = 'Menghentikan...';
  const r = await api('/tools/ddos/stop', { method: 'POST' });
  if (!r.ok) customAlert('Gagal Stop', r.msg);
}

async function addNote() {
  const text = document.getElementById('noteText').value.trim();
  const music = document.getElementById('noteMusic').value.trim();
  if (!text) return customAlert('Kosong', 'Isi catatan.');
  const r = await api('/notes', { method: 'POST', body: { username: currentUser.username, text, music } });
  if (!r.ok) return customAlert('Gagal', r.msg);
  loadNotes();
}

async function loadNotes() {
  const r = await api('/notes');
  const list = document.getElementById('notesList');
  if (!list) return;
  list.innerHTML = (r.notes || []).map(n => `<div class="note-card"><b>${n.username}</b>: ${n.text}</div>`).join('') || '<p class="hint">Belum ada notes.</p>';
}

async function createUser() {
  const username = document.getElementById('newUser').value.trim();
  const password = document.getElementById('newPass').value;
  const role = document.getElementById('newRole').value;
  if (!username || !password) return customAlert('Kosong', 'Isi semua field.');
  const r = await api('/admin/user', { method: 'POST', body: { username, password, role } });
  if (!r.ok) return customAlert('Gagal', r.msg);
  customAlert('Sukses', 'Akun dibuat!');
  loadUsers();
}

async function loadUsers() {
  const r = await api('/admin/users');
  if (!r.ok) return;
  document.getElementById('userList').innerHTML = r.users.map(u => {
    const btn = (currentUser.role === 'owner' && u.id !== currentUser.id) ? `<button class="neo-btn danger" style="padding:6px;margin-top:10px;font-size:12px;" onclick="delUser(${u.id})">Hapus</button>` : '';
    return `<div class="user-card" style="background:var(--card-bg); border:3px solid #000; border-radius:12px; padding:12px; margin-bottom:10px; box-shadow:3px 3px 0 #000;"><b>${u.username}</b> <span style="font-size:12px; color:#ff3333; font-weight:bold;">[${u.role}]</span>${btn}</div>`;
  }).join('');
}

async function delUser(id) {
  const r = await api('/admin/user/' + id, { method: 'DELETE' });
  if (!r.ok) return customAlert('Gagal', r.msg);
  customAlert('Sukses', 'Akun dihapus.');
  loadUsers();
}

async function loadDdosLogs() {
  const r = await api('/tools/ddos/logs');
  const list = document.getElementById('ddosLogList');
  if (!r.ok) { list.innerHTML = '<p style="color:red;">Gagal load log.</p>'; return; }
  
  if (r.logs.length === 0) {
    list.innerHTML = '<p style="font-size:12px; color:var(--text-muted);">Belum ada serangan DDoS.</p>';
    return;
  }

  list.innerHTML = r.logs.map(log => `
    <div style="background:var(--card-bg); border:2px solid var(--danger); border-radius:8px; padding:10px; font-size:12px;">
      <b style="color:var(--danger);">${log.user}</b> menyerang <b style="color:var(--primary);">${log.target}</b>
      <br><span style="color:var(--text-muted);">${new Date(log.time).toLocaleString()}</span>
    </div>
  `).join('');
}

(async () => {
  loadTheme();
  const r = await api('/auth/me');
  if (r.ok) { currentUser = r.user; enterApp(); }
  else showPage('login');
})();
