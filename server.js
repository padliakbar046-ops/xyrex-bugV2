const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const DB_FILE = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    users: [
      { id: 1, username: 'Dlizz', password: '20111608', role: 'owner', avatar: 1, createdAt: Date.now() }
    ],
    notes: [],
    chat: []
  }, null, 2));
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'xyrex-super-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 Hari
}));

app.use(express.static(path.join(__dirname, 'public')));

const db = {
  read: () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8')),
  write: (d) => fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2))
};
app.set('db', db);
app.set('io', io);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/pairing', require('./routes/pairing'));
app.use('/api/bug', require('./routes/bugnomor'));
app.use('/api/tools', require('./routes/tools'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/admin', require('./routes/admin'));

io.on('connection', (socket) => {
  socket.on('chat:join', () => {
    socket.emit('chat:history', db.read().chat.slice(-50));
  });

  socket.on('chat:send', (data) => {
    if (!data || !data.text) return;
    const d = db.read();
    const entry = { 
      user: data.user || 'Anon', 
      role: data.role || 'member',
      text: String(data.text).slice(0, 500), 
      ts: Date.now() 
    };
    d.chat.push(entry);
    if (d.chat.length > 500) d.chat = d.chat.slice(-500);
    db.write(d);
    io.emit('chat:message', entry);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[XYREX] running on http://localhost:${PORT}`));
