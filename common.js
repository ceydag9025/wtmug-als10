console.log('%ccommon.js v9 yüklendi', 'color:#4a7dff;font-weight:bold');

/* ==================== SABİTLER ==================== */
const CHUNK_SIZE = 16 * 1024;
const BACKPRESSURE_LIMIT = 1024 * 1024;

/* ==================== PEERJS KONFİGÜRASYONU ====================
   Google + Cloudflare + Metered STUN sunucuları (ücretsiz).
   Farklı ağlar arası NAT geçişi için yeterli. */
const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.relay.metered.ca:80' }
    ],
    iceCandidatePoolSize: 10,
    sdpSemantics: 'unified-plan'
  }
};

/* ==================== YARDIMCILAR ==================== */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function formatSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' MB';
  return (b/1024/1024/1024).toFixed(2) + ' GB';
}
/* Sağlam ID üretimi — crypto.randomUUID varsa onu kullan */
function makePeerId(prefix) {
  let rand;
  try {
    rand = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  } catch (e) {
    rand = Math.random().toString(36).slice(2).padEnd(10, '0').slice(0, 10);
  }
  return prefix + '-' + rand;
}

/* ==================== QR (qrserver.com üzerinden) ====================
   Kütüphane YOK, canvas YOK — sadece <img>.
   Hedef cihazda URL açılacak; hash içinde peer ID var. */
function renderQR(container, text) {
  console.log('[QR] render ediliyor:', text);
  if (!container) { console.error('[QR] container yok'); return; }
  container.innerHTML = '';

  const img = document.createElement('img');
  img.className = 'qr-img';
  img.alt = 'QR Kod';
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=4&data=' +
            encodeURIComponent(text);

  img.onload  = () => console.log('[QR] ✅ yüklendi');
  img.onerror = () => {
    console.error('[QR] ❌ qrserver engelli');
    container.innerHTML = '';
    const fb = document.createElement('div');
    fb.className = 'qr-fallback';
    fb.innerHTML = '<strong>QR görseli yüklenemedi.</strong><br>' +
      'Aşağıdaki adresi telefona elle girin:<br><code></code>';
    fb.querySelector('code').textContent = text;
    container.appendChild(fb);
  };
  container.appendChild(img);
}

/* ==================== ChatUI (ALŞ08 — sohbet + iki yönlü dosya) ==================== */
class ChatUI {
  constructor(messagesEl) {
    this.messagesEl = messagesEl;
    this.incoming = {};
    this.fileEls = {};
  }
  scroll() { this.messagesEl.scrollTop = this.messagesEl.scrollHeight; }

  system(text) {
    const d = document.createElement('div');
    d.className = 'msg system'; d.textContent = text;
    this.messagesEl.appendChild(d); this.scroll();
  }
  message(dir, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + dir; d.textContent = text;
    this.messagesEl.appendChild(d); this.scroll();
  }
  fileStart(dir, id, name, size, mime, label) {
    const d = document.createElement('div');
    d.className = 'msg file ' + dir;
    d.innerHTML =
      '<div class="file-name">📄 ' + escapeHtml(name) + '</div>' +
      '<div class="file-size">' + formatSize(size) + '</div>' +
      '<div class="progress"><div class="bar" style="width:0%"></div></div>' +
      '<div class="file-status">' + label + '</div>' +
      '<div class="file-extra"></div>';
    this.messagesEl.appendChild(d);
    this.fileEls[id] = d;
    this.scroll();
  }
  fileProgress(id, received, size, label) {
    const d = this.fileEls[id]; if (!d) return;
    const pct = Math.min(100, Math.round(received * 100 / size));
    d.querySelector('.bar').style.width = pct + '%';
    d.querySelector('.file-status').textContent = label + ' ' + pct + '%';
  }
  fileComplete(id, blob, name, mime) {
    const d = this.fileEls[id]; if (!d) return;
    d.querySelector('.bar').style.width = '100%';
    d.querySelector('.file-status').textContent = 'Tamamlandı ✓';
    const extra = d.querySelector('.file-extra');
    const url = URL.createObjectURL(blob);
    if (mime && mime.startsWith('image/')) {
      const img = document.createElement('img'); img.src = url;
      img.className = 'preview-media'; img.loading = 'lazy';
      extra.appendChild(img);
    } else if (mime && mime.startsWith('video/')) {
      const v = document.createElement('video'); v.src = url; v.controls = true;
      v.className = 'preview-media'; extra.appendChild(v);
    } else if (mime && mime.startsWith('audio/')) {
      const a = document.createElement('audio'); a.src = url; a.controls = true;
      a.className = 'preview-media'; extra.appendChild(a);
    }
    const a = document.createElement('a');
    a.href = url; a.download = name; a.textContent = '💾 İndir';
    a.className = 'download-btn'; extra.appendChild(a);
    delete this.fileEls[id];
  }
  handleMeta(msg) {
    if (msg.type === 'chat') {
      this.message('in', msg.text);
    } else if (msg.type === 'file-start') {
      this.incoming[msg.id] = { id: msg.id, name: msg.name, mime: msg.mime, size: msg.size, chunks: [], received: 0 };
      this.fileStart('in', msg.id, msg.name, msg.size, msg.mime, 'Alınıyor...');
    } else if (msg.type === 'file-end') {
      const e = this.incoming[msg.id]; if (!e) return;
      const blob = new Blob(e.chunks, { type: e.mime || 'application/octet-stream' });
      delete this.incoming[msg.id];
      this.fileComplete(msg.id, blob, e.name, e.mime);
    }
  }
  handleBinary(data) {
    const entries = Object.values(this.incoming);
    if (!entries.length) return;
    const e = entries[0];
    let buf;
    if (data instanceof ArrayBuffer) buf = data;
    else if (ArrayBuffer.isView(data))
      buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    else return;
    e.chunks.push(buf);
    e.received += buf.byteLength;
    this.fileProgress(e.id, e.received, e.size, 'Alınıyor...');
  }
}

async function sendFile(conn, file, chatUI) {
  if (!conn || !conn.open) return;
  const id = 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  chatUI.fileStart('out', id, file.name, file.size, file.type, 'Gönderiliyor...');
  conn.send({ type: 'file-start', id, name: file.name, mime: file.type, size: file.size });

  const dc = conn.dataChannel;
  let offset = 0;
  while (offset < file.size) {
    const buf = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    while (dc && dc.bufferedAmount > BACKPRESSURE_LIMIT)
      await new Promise(r => setTimeout(r, 15));
    conn.send(buf);
    offset += CHUNK_SIZE;
    chatUI.fileProgress(id, Math.min(offset, file.size), file.size, 'Gönderiliyor...');
  }
  conn.send({ type: 'file-end', id });

  const d = chatUI.fileEls[id];
  if (d) {
    d.querySelector('.file-status').textContent = 'Gönderildi ✓';
    const url = URL.createObjectURL(file);
    const extra = d.querySelector('.file-extra');
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img'); img.src = url; img.className = 'preview-media';
      extra.appendChild(img);
    } else if (file.type.startsWith('video/')) {
      const v = document.createElement('video'); v.src = url; v.controls = true;
      v.className = 'preview-media'; extra.appendChild(v);
    }
    const a = document.createElement('a'); a.href = url; a.download = file.name;
    a.textContent = '💾 İndir'; a.className = 'download-btn'; extra.appendChild(a);
    delete chatUI.fileEls[id];
  }
}