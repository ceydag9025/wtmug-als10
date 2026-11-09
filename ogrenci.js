const statusEl        = document.getElementById('status');
const connectSection  = document.getElementById('connectSection');
const transferSection = document.getElementById('transferSection');
const teacherIdInput  = document.getElementById('teacherId');
const connectBtn      = document.getElementById('connectBtn');
const scanBtn         = document.getElementById('scanBtn');
const scannerEl       = document.getElementById('scanner');
const barEl           = document.getElementById('bar');
const pctEl           = document.getElementById('pct');
const statusTextEl    = document.getElementById('statusText');
const downloadEl      = document.getElementById('download');
const logEl           = document.getElementById('log');

let peer = null, conn = null;
const incoming = {}; // id -> { name, mime, size, chunks, received }
let currentURL = null;

function setStatus(txt, cls) { statusEl.textContent = txt; statusEl.className = 'status ' + (cls || ''); }
function log(text) {
  const d = document.createElement('div');
  d.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
}

// Cihaz türü otomatik algılama
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;
if (!isMobile) scanBtn.classList.add('hidden');

function connectTo(teacherId) {
  if (!teacherId) return;
  setStatus('Bağlanıyor: ' + teacherId, 'waiting');
  peer = new Peer(undefined, { debug: 1 });
  peer.on('open', () => {
    const c = peer.connect(teacherId, { reliable: true });
    conn = c;
    c.on('open', () => {
      setStatus('Hocaya bağlandı!', 'connected');
      log('Hocaya bağlandı: ' + teacherId);
      connectSection.classList.add('hidden');
      transferSection.classList.remove('hidden');
      statusTextEl.textContent = 'Dosya bekleniyor...';
    });
    c.on('data', handleData);
    c.on('close', () => {
      setStatus('Bağlantı kapandı', 'error');
      log('Bağlantı kapandı');
    });
    c.on('error', console.error);
  });
  peer.on('error', err => { console.error(err); setStatus('Hata: ' + err.type, 'error'); });
}

function handleData(data) {
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const entries = Object.values(incoming);
    if (!entries.length) return;
    const e = entries[0];
    const buf = data instanceof ArrayBuffer
      ? data
      : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    e.chunks.push(buf);
    e.received += buf.byteLength;
    const pct = Math.min(100, Math.round(e.received*100/e.size));
    barEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';
    statusTextEl.textContent = 'Alınıyor...';
    return;
  }
  if (data && typeof data === 'object') {
    if (data.type === 'file-start') {
      incoming[data.id] = { id: data.id, name: data.name, mime: data.mime, size: data.size, chunks: [], received: 0 };
      log(`📥 Dosya alınıyor: ${data.name} (${formatSize(data.size)})`);
      barEl.style.width = '0%';
      pctEl.textContent = '0%';
      statusTextEl.textContent = 'Alınıyor...';
      downloadEl.classList.add('hidden');
    } else if (data.type === 'file-end') {
      const e = incoming[data.id];
      if (!e) return;
      const blob = new Blob(e.chunks, { type: e.mime || 'application/octet-stream' });
      delete incoming[data.id];
      if (currentURL) URL.revokeObjectURL(currentURL);
      currentURL = URL.createObjectURL(blob);
      downloadEl.href = currentURL;
      downloadEl.download = e.name;
      downloadEl.textContent = '💾 ' + e.name + ' — İndir';
      downloadEl.classList.remove('hidden');
      statusTextEl.textContent = 'Tamamlandı ✓';
      log(`✅ Dosya tamamlandı: ${e.name}`);
      if (conn && conn.open) conn.send({ type: 'file-ack', name: e.name });
    }
  }
}

connectBtn.addEventListener('click', () => connectTo(teacherIdInput.value.trim()));

scanBtn.addEventListener('click', async () => {
  scannerEl.classList.remove('hidden');
  const scanner = new Html5Qrcode('scanner');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (text) => {
        scanner.stop().then(() => { scanner.clear(); scannerEl.classList.add('hidden'); });
        const m = text.match(/peer=([^&]+)/);
        const id = m ? decodeURIComponent(m[1]) : text.trim();
        teacherIdInput.value = id;
        connectTo(id);
      },
      () => {}
    );
  } catch (e) {
    alert('Kamera hatası: ' + e.message);
    scannerEl.classList.add('hidden');
  }
});

// URL hash ile otomatik bağlan
const m = location.hash.match(/peer=([^&]+)/);
if (m) {
  const id = decodeURIComponent(m[1]);
  teacherIdInput.value = id;
  connectTo(id);
}