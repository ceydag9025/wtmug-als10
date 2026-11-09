const statusEl       = document.getElementById('status');
const fileInput      = document.getElementById('fileInput');
const pickBtn        = document.getElementById('pickBtn');
const fileNameEl     = document.getElementById('fileName');
const qrHolder       = document.getElementById('qrHolder');
const peerIdEl       = document.getElementById('peerId');
const linkOut        = document.getElementById('linkOut');
const studentsEl     = document.getElementById('students');
const logEl          = document.getElementById('log');
const studentCountEl = document.getElementById('studentCount');
const doneCountEl    = document.getElementById('doneCount');

let peer = null, selectedFile = null;
const students = {};

function setStatus(txt, cls) {
  statusEl.textContent = txt;
  statusEl.className = 'status ' + (cls || '');
}
function log(text) {
  const d = document.createElement('div');
  d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}
function updateStudents() {
  studentsEl.innerHTML = '';
  const ids = Object.keys(students);
  studentCountEl.textContent = ids.length;
  let done = 0;
  ids.forEach(id => {
    const s = students[id];
    if (s.done) done++;
    const d = document.createElement('div');
    d.className = 'student';
    d.innerHTML = '<span>' + escapeHtml(id) + '</span><span>' +
      (s.done ? '✓ Tamam' : s.progress + '%') + '</span>';
    studentsEl.appendChild(d);
  });
  doneCountEl.textContent = done;
}

/* ---------------- QR Yardımcıları ---------------- */
function renderQR(text) {
  if (typeof QRCode === 'undefined') {
    console.error('QRCode yüklenemedi');
    setStatus('QR kütüphanesi yüklenemedi', 'error');
    return;
  }
  const canvas = qrHolder.querySelector('canvas') || (() => {
    const c = document.createElement('canvas'); qrHolder.innerHTML = '';
    qrHolder.appendChild(c); return c;
  })();
  try {
    QRCode.toCanvas(canvas, text, { width: 260, margin: 1 }, (err) => {
      if (err) {
        console.error('toCanvas hata:', err);
        QRCode.toDataURL(text, { width: 260, margin: 1 }, (err2, url) => {
          if (err2) return;
          const img = new Image();
          img.src = url; img.alt = 'QR Kod';
          img.style.cssText = 'background:#fff;border-radius:8px;padding:8px;width:260px;height:260px;';
          qrHolder.innerHTML = ''; qrHolder.appendChild(img);
        });
      }
    });
  } catch (e) {
    console.error('QR exception:', e);
  }
}

/* ---------------- Dosya gönderimi ---------------- */
async function sendToStudent(conn) {
  if (!selectedFile) return;
  const s = students[conn.peer];
  if (!s) return;
  const file = selectedFile;
  const id = 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  conn.send({ type: 'file-start', id, name: file.name, mime: file.type, size: file.size });
  const dc = conn.dataChannel;
  let offset = 0, lastLogged = -1;
  while (offset < file.size) {
    if (!conn.open) { log(conn.peer + ' bağlantısı koptu'); return; }
    const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    while (dc && dc.bufferedAmount > BACKPRESSURE_LIMIT) await new Promise(r => setTimeout(r, 15));
    conn.send(buf);
    offset += CHUNK_SIZE;
    const pct = Math.min(100, Math.round(offset * 100 / file.size));
    s.progress = pct;
    if (pct >= lastLogged + 10) { lastLogged = pct; log('📤 ' + conn.peer + ' → ' + pct + '%'); updateStudents(); }
  }
  conn.send({ type: 'file-end', id });
  log('📦 ' + conn.peer + ' dosyası gönderildi');
  updateStudents();
}

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (!fileInput.files.length) return;
  selectedFile = fileInput.files[0];
  fileNameEl.textContent = '📄 ' + selectedFile.name + ' (' + formatSize(selectedFile.size) + ')';
  log('Dosya seçildi: ' + selectedFile.name);
  Object.values(students).forEach(s => {
    if (s.conn && s.conn.open && !s.done) sendToStudent(s.conn);
  });
});

/* ---------------- Başlatma ---------------- */
function init() {
  const id = 'h-' + Math.random().toString(36).slice(2, 8);

  // QR'ı HEMEN hazırla (peer beklemeden)
  const url = new URL('ogrenci.html', location.href.replace(/[^/]*$/, ''));
  url.hash = 'peer=' + id;
  const link = url.toString();
  peerIdEl.textContent = id;
  linkOut.value = link;
  document.getElementById('copyLink').onclick = () => {
    linkOut.select(); navigator.clipboard.writeText(link).catch(() => {});
  };
  renderQR(link);
  setStatus('Sunucuya bağlanılıyor...', 'waiting');

  if (typeof Peer === 'undefined') {
    setStatus('PeerJS kütüphanesi yüklenemedi', 'error');
    return;
  }
  peer = new Peer(id, { debug: 2 });

  peer.on('open', (pid) => {
    setStatus('Hazır — QR okutun (' + pid + ')', 'waiting');
    console.log('Hoca peer opened:', pid);
  });
  peer.on('error', (err) => {
    console.error('Hoca peer error:', err);
    setStatus('Hata: ' + err.type, 'error');
  });
  peer.on('disconnected', () => {
    try { peer.reconnect(); } catch (e) {}
  });

  peer.on('connection', (conn) => {
    students[conn.peer] = { conn, progress: 0, done: false };
    conn.on('open', () => {
      log('✅ ' + conn.peer + ' bağlandı');
      updateStudents();
      if (selectedFile) sendToStudent(conn);
    });
    conn.on('data', (data) => {
      if (data && typeof data === 'object' && data.type === 'file-ack' && students[conn.peer]) {
        students[conn.peer].done = true;
        students[conn.peer].progress = 100;
        log('🎉 ' + conn.peer + ' dosyayı aldı');
        updateStudents();
      }
    });
    conn.on('close', () => {
      if (students[conn.peer]) { log('❌ ' + conn.peer + ' ayrıldı'); delete students[conn.peer]; updateStudents(); }
    });
    conn.on('error', console.error);
  });

  setTimeout(() => {
    if (peer && !peer.open && statusEl.classList.contains('waiting')) {
      setStatus('Sunucu yavaş — QR yine de taranabilir', 'waiting');
    }
  }, 10000);
}

init();