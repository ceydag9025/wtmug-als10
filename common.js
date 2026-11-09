// ---- Sabitler ----
const CHUNK_SIZE = 16 * 1024;             // 16 KB
const BACKPRESSURE_LIMIT = 1024 * 1024;   // 1 MB tampon eşiği

// ---- Yardımcılar ----
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

// ---- Sohbet + dosya UI + transfer mantığı ----
class ChatUI {
  constructor(messagesEl) {
    this.messagesEl = messagesEl;
    this.incoming = {};      // id -> parça tamponu (ALICI tarafı)
    this.fileEls = {};       // id -> DOM elemanı (hem alıcı hem gönderici)
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
    d.innerHTML = `
      <div class="file-name">📄 ${escapeHtml(name)}</div>
      <div class="file-size">${formatSize(size)}</div>
      <div class="progress"><div class="bar" style="width:0%"></div></div>
      <div class="file-status">${label}</div>
      <div class="file-extra"></div>`;
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

  // Gelen metadata
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

  // Gelen binary chunk
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

// ---- Gönderim ----
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