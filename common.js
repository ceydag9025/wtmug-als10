/* ============================================================
   common.js — Ortak protokol + BULLETPROOF QR RENDER
   ============================================================ */

console.log('%ccommon.js v5 yüklendi', 'color:#4a7dff;font-weight:bold');

const CHUNK_SIZE = 16 * 1024;
const BACKPRESSURE_LIMIT = 1024 * 1024;

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

/* ============================================================
   renderQR — 3 kademeli fallback
   1) QRCode.toDataURL (varsa)
   2) api.qrserver.com (fallback <img>)
   3) Manuel link göster
   ============================================================ */
function renderQR(container, text) {
  console.log('%c[QR] renderQR başladı', 'color:#4a7dff;font-weight:bold');
  console.log('[QR] QRCode global:', typeof QRCode);
  console.log('[QR] Hedef:', text);
  console.log('[QR] Container:', container);

  if (!container) { console.error('[QR] Container yok!'); return; }
  container.innerHTML = '';

  const diag = document.createElement('div');
  diag.className = 'qr-diag';
  diag.textContent = 'QR hazırlanıyor...';
  container.appendChild(diag);

  /* ---- Yedek 2: qrserver.com ---- */
  function tryQrServer() {
    console.warn('[QR] qrserver.com deneniyor');
    diag.textContent = 'Alternatif QR servisi deneniyor...';
    const api = 'https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=4&data=' + encodeURIComponent(text);
    const img = document.createElement('img');
    img.className = 'qr-img';
    img.alt = 'QR Kod';
    img.style.display = 'none';
    img.onload  = () => { diag.remove(); img.style.display = 'block'; console.log('[QR] ✅ qrserver başarılı'); };
    img.onerror = () => {
      console.error('[QR] ❌ qrserver başarısız');
      diag.textContent = 'QR üretilemedi. Aşağıdaki linki elle kullanın.';
      addFallbackLink(container, text);
    };
    img.src = api;
    container.appendChild(img);
  }

  /* ---- Yedek 3: manuel link ---- */
  function addFallbackLink(container, text) {
    const box = document.createElement('div');
    box.className = 'qr-fallback';
    box.innerHTML = '<strong>QR üretilemedi.</strong><br>Bu adresi elle girin:<br><code></code>';
    box.querySelector('code').textContent = text;
    container.appendChild(box);
  }

  /* ---- Yedek 1: QRCode kütüphanesi ---- */
  if (typeof QRCode !== 'undefined' && typeof QRCode.toDataURL === 'function') {
    const opts = { width: 280, margin: 2, errorCorrectionLevel: 'M' };

    function onSuccess(url) {
      console.log('[QR] ✅ toDataURL başarılı');
      diag.remove();
      const img = document.createElement('img');
      img.className = 'qr-img';
      img.alt = 'QR Kod';
      img.src = url;
      container.appendChild(img);
    }
    function onError(err) {
      console.warn('[QR] toDataURL hata, qrserver deneniyor:', err);
      tryQrServer();
    }

    try {
      // Promise API (qrcode@1.5 Promise döner)
      const r = QRCode.toDataURL(text, opts);
      if (r && typeof r.then === 'function') {
        r.then(onSuccess).catch(() => {
          // callback API dene
          try { QRCode.toDataURL(text, opts, (e,u)=> e ? onError(e) : onSuccess(u)); }
          catch(e2){ onError(e2); }
        });
      } else if (typeof r === 'string') {
        onSuccess(r);
      } else {
        QRCode.toDataURL(text, opts, (e,u)=> e ? onError(e) : onSuccess(u));
      }
    } catch (e) {
      console.warn('[QR] toDataURL exception:', e);
      tryQrServer();
    }
    return;
  }

  console.warn('[QR] QRCode kütüphanesi yok → qrserver deneniyor');
  tryQrServer();
}

/* ============================================================
   ChatUI — sohbet + dosya transfer UI + chunk birleştirme
   ============================================================ */
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
    const pct = Math.min(100, Math.round(received*100/size));
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
    a.href = url; a.download = name; a.textContent = 'İndir';
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
    a.textContent = 'İndir'; a.className = 'download-btn'; extra.appendChild(a);
    delete chatUI.fileEls[id];
  }
}