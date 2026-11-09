const statusEl   = document.getElementById('status');
const waitingEl  = document.getElementById('waiting');
const chatEl     = document.getElementById('chat');
const messagesEl = document.getElementById('messages');
const peerLinkEl = document.getElementById('peerLink');
const copyBtn    = document.getElementById('copyBtn');
const textInput  = document.getElementById('textInput');
const sendBtn    = document.getElementById('sendBtn');
const attachBtn  = document.getElementById('attachBtn');
const fileInput  = document.getElementById('fileInput');
const qrHolder   = document.getElementById('qrHolder');

const chatUI = new ChatUI(messagesEl);
let peer = null, conn = null;

function setStatus(txt, cls) {
  statusEl.textContent = txt;
  statusEl.className = 'status ' + (cls || '');
}

/* ---------------- QR Yardımcıları ---------------- */
function renderQR(text) {
  if (typeof QRCode === 'undefined') {
    console.error('QRCode kütüphanesi yüklenmedi!');
    setStatus('QR kütüphanesi yüklenemedi (CDN engelli olabilir)', 'error');
    const fb = document.createElement('div');
    fb.className = 'muted';
    fb.style.cssText = 'padding:12px;border:1px dashed var(--border);border-radius:8px;word-break:break-all;';
    fb.textContent = 'QR üretilemedi. Aşağıdaki bağlantıyı telefona elle yapıştırın: ' + text;
    qrHolder.innerHTML = '';
    qrHolder.appendChild(fb);
    return;
  }
  // 1) canvas ile dene
  const canvas = qrHolder.querySelector('canvas') || (() => {
    const c = document.createElement('canvas');
    qrHolder.innerHTML = '';
    qrHolder.appendChild(c);
    return c;
  })();
  try {
    QRCode.toCanvas(canvas, text, { width: 260, margin: 1 }, (err) => {
      if (err) {
        console.error('toCanvas hata:', err);
        // 2) dataURL + <img> fallback
        QRCode.toDataURL(text, { width: 260, margin: 1 }, (err2, url) => {
          if (err2) {
            console.error('toDataURL hata:', err2);
            setStatus('QR üretilemedi', 'error');
            return;
          }
          const img = new Image();
          img.src = url;
          img.alt = 'QR Kod';
          img.style.cssText = 'background:#fff;border-radius:8px;padding:8px;width:260px;height:260px;';
          qrHolder.innerHTML = '';
          qrHolder.appendChild(img);
        });
      }
    });
  } catch (e) {
    console.error('QR exception:', e);
    setStatus('QR üretilemedi: ' + e.message, 'error');
  }
}

/* ---------------- Başlatma ---------------- */
function init() {
  const id = 'w-' + Math.random().toString(36).slice(2, 10);

  // 1) URL'i HEMEN hazırla + QR'ı HEMEN göster (peer.on('open') beklemeden!)
  const url = new URL('mobile.html', location.href.replace(/[^/]*$/, ''));
  url.hash = 'peer=' + id;
  const link = url.toString();
  peerLinkEl.value = link;
  renderQR(link);
  setStatus('Sunucuya bağlanılıyor...', 'waiting');

  // 2) Peer oluştur
  if (typeof Peer === 'undefined') {
    setStatus('PeerJS kütüphanesi yüklenemedi', 'error');
    return;
  }
  peer = new Peer(id, { debug: 2 });

  peer.on('open', (peerId) => {
    setStatus('Hazır — QR kodu okutun (' + peerId + ')', 'waiting');
    console.log('Peer opened:', peerId);
  });

  peer.on('error', (err) => {
    console.error('Peer error:', err);
    let msg = 'Peer hatası: ' + err.type;
    if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
      msg = 'Sunucuya ulaşılamıyor — bağlantı kurulamayabilir';
    } else if (err.type === 'unavailable-id') {
      msg = 'ID çakışması — sayfayı yenileyin';
    }
    setStatus(msg, 'error');
  });

  peer.on('disconnected', () => {
    console.warn('Peer disconnected, reconnecting...');
    setStatus('Bağlantı koptu, yeniden bağlanıyor...', 'waiting');
    try { peer.reconnect(); } catch (e) {}
  });

  peer.on('connection', (c) => {
    if (conn && conn.open) { c.on('open', () => c.close()); return; }
    conn = c;
    c.on('open', () => {
      setStatus('Bağlı: ' + c.peer, 'connected');
      waitingEl.classList.add('hidden');
      chatEl.classList.remove('hidden');
      chatUI.system('Bağlantı kuruldu.');
    });
    c.on('data', (data) => {
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) chatUI.handleBinary(data);
      else if (data && typeof data === 'object') chatUI.handleMeta(data);
    });
    c.on('close', () => {
      setStatus('Bağlantı kapandı', 'error');
      chatUI.system('Bağlantı kapandı.');
      waitingEl.classList.remove('hidden');
      chatEl.classList.add('hidden');
      conn = null;
    });
    c.on('error', console.error);
  });

  // 10 sn sonra hala açılmadıysa kullanıcıya bilgi ver
  setTimeout(() => {
    if (peer && !peer.open && statusEl.classList.contains('waiting')) {
      setStatus('Sunucu yavaş yanıt veriyor — QR kodu yine de taranabilir', 'waiting');
    }
  }, 10000);
}

/* ---------------- Mesaj & dosya ---------------- */
function sendChat() {
  const text = textInput.value.trim();
  if (!text || !conn || !conn.open) return;
  textInput.value = '';
  chatUI.message('out', text);
  conn.send({ type: 'chat', text });
}
sendBtn.addEventListener('click', sendChat);
textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  for (const f of fileInput.files) await sendFile(conn, f, chatUI);
  fileInput.value = '';
});
copyBtn.addEventListener('click', () => {
  peerLinkEl.select(); navigator.clipboard.writeText(peerLinkEl.value).catch(() => {});
});

init();