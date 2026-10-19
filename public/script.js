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
  
  // Validasi rute masuk (jika user iseng ketik URL manual)
  if (view === 'tools/ddos' && currentUser.role === 'member') { 
    location.hash = '#tools'; 
    customAlert('Akses Ditolak', 'Fitur DDoS khusus Premium ke atas.'); 
  }
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
      // Jangan pakai pointer-events: none agar tetap bisa diklik
      btnDdos.removeAttribute('href'); 
      btnDdos.style.cursor = 'pointer'; // Ubah kursor jadi tangan
      
      // Timpa event onclick bawaan browser dengan Custom Alert
      btnDdos.onclick = (e) => {
        e.preventDefault();
        customAlert('Akses Ditolak', 'Fitur DDoS hanya tersedia untuk role Premium, Admin, dan Owner. Silakan hubungi Owner untuk upgrade akun.');
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

async function toolVideo() { /* ... */ }
async function toolGmail() { /* ... */ }
async function toolAnime() { /* ... */ }
async function toolMusic() { /* ... */ }
async function toolScan() { /* ... */ }
async function startDdos() { /* ... */ }
async function stopDdos() { /* ... */ }
async function addNote() { /* ... */ }
async function loadNotes() { /* ... */ }
async function createUser() { /* ... */ }
async function loadUsers() { /* ... */ }
async function delUser(id) { /* ... */ }
async function loadDdosLogs() { /* ... */ }

(async () => {
  loadTheme();
  const r = await api('/auth/me');
  if (r.ok) { currentUser = r.user; enterApp(); }
  else showPage('login');
})();
