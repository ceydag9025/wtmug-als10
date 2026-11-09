console.log('%cweb.js v5 — ' + new Date().toISOString(), 'color:#22c55e;font-weight:bold');

const statusEl     = document.getElementById('status');
const waitingEl    = document.getElementById('waiting');
const chatEl       = document.getElementById('chat');
const messagesEl   = document.getElementById('messages');
const peerLinkEl   = document.getElementById('peerLink');
const peerIdView   = document.getElementById('peerIdView');
const qrHolder     = document.getElementById('qrHolder');
const copyBtn      = document.getElementById('copyBtn');
const textInput    = document.getElementById('textInput');
const sendBtn      = document.getElementById('sendBtn');
const attachBtn    = document.getElementById('attachBtn');
const fileInput    = document.getElementById('fileInput');

const chatUI = new ChatUI(messagesEl);
let peer = null, conn = null;

function setStatus(txt, cls) {
  statusEl.textContent = txt;
  statusEl.className = 'status ' + (cls || '');
}

function init() {
  // 1) Peer ID'yi ŞİMDİ belirle
  const id = 'w-' + Math.random().toString(36).slice(2, 10);
  peerIdView.textContent = id;

  // 2) URL'i ŞİMDİ oluştur
  const url = new URL('mobile.html', location.href.replace(/[^/]*$/, ''));
  url.hash = 'peer=' + id;
  const link = url.toString();
  peerLinkEl.value = link;

  // 3) QR'ı ŞİMDİ çiz (PeerJS bekleme YOK!)
  renderQR(qrHolder, link);
  setStatus('Sunucuya bağlanılıyor...', 'waiting');

  // 4) PeerJS başlat
  if (typeof Peer === 'undefined') {
    setStatus('PeerJS yüklenemedi (CDN engelli olabilir)', 'error');
    console.error('Peer tanımsız');
    return;
  }
  peer = new Peer(id, { debug: 2 });

  peer.on('open', (pid) => {
    setStatus('Hazır — QR okutun (' + pid + ')', 'waiting');
    console.log('✅ Peer açıldı:', pid);
  });

  peer.on('error', (err) => {
    console.error('Peer hata:', err);
    let msg = 'Peer hatası: ' + err.type;
    if (['network','server-error','socket-error','socket-closed'].includes(err.type)) {
      msg = 'PeerJS sunucusuna ulaşılamıyor (ağ engelli olabilir)';
    } else if (err.type === 'unavailable-id') {
      msg = 'ID çakışması — sayfayı yenileyin';
    }
    setStatus(msg, 'error');
  });

  peer.on('disconnected', () => {
    setStatus('Bağlantı koptu, yeniden deneniyor...', 'waiting');
    try { peer.reconnect(); } catch(e){}
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
}

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
  peerLinkEl.select(); navigator.clipboard.writeText(peerLinkEl.value).catch(()=>{});
});

init();