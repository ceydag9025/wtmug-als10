console.log('%cweb.js v9 — ' + new Date().toISOString(), 'color:#22c55e;font-weight:bold');

const statusEl   = document.getElementById('status');
const waitingEl  = document.getElementById('waiting');
const chatEl     = document.getElementById('chat');
const messagesEl = document.getElementById('messages');
const peerLinkEl = document.getElementById('peerLink');
const peerIdView = document.getElementById('peerIdView');
const qrHolder   = document.getElementById('qrHolder');
const copyBtn    = document.getElementById('copyBtn');
const textInput  = document.getElementById('textInput');
const sendBtn    = document.getElementById('sendBtn');
const attachBtn  = document.getElementById('attachBtn');
const fileInput  = document.getElementById('fileInput');

const chatUI = new ChatUI(messagesEl);
let peer = null, conn = null;

function setStatus(txt, cls) {
  statusEl.textContent = txt;
  statusEl.className = 'status ' + (cls || '');
}

function init() {
  const id = makePeerId('w');
  peerIdView.textContent = id;

  const url = new URL('mobile.html', location.href.replace(/[^/]*$/, ''));
  url.hash = 'peer=' + id;
  const link = url.toString();
  peerLinkEl.value = link;

  // QR HENÜZ ÇİZİLMİYOR — peer.on('open') bekleniyor
  qrHolder.innerHTML = '<div class="qr-diag">Sunucuya bağlanılıyor...</div>';
  setStatus('PeerJS sunucusuna bağlanılıyor...', 'waiting');

  if (typeof Peer === 'undefined') {
    setStatus('PeerJS yüklenemedi (CDN engelli)', 'error');
    qrHolder.innerHTML = '<div class="qr-fallback"><strong>PeerJS kütüphanesi yüklenemedi.</strong><br>Sayfayı yenileyin veya farklı ağ deneyin.</div>';
    return;
  }

  peer = new Peer(id, PEER_CONFIG);

  // 12 sn sonra hâlâ açılmadıysa bilgi ver
  const timeout = setTimeout(() => {
    if (peer && !peer.open) {
      setStatus('❌ Sunucuya ulaşılamıyor (ağ engelli?)', 'error');
      qrHolder.innerHTML =
        '<div class="qr-fallback">' +
        '<strong>PeerJS sunucusuna bağlanılamadı.</strong><br><br>' +
        'Muhtemel nedenler:<br>' +
        '• Kurumsal/üniversite Wi-Fi\'si WebSocket\'i engelliyor<br>' +
        '• VPN veya güvenlik duvarı<br><br>' +
        '<strong>Çözüm:</strong> Telefonun <b>mobil verisini</b> aç, ya da farklı bir Wi-Fi dene.' +
        '</div>';
    }
  }, 12000);

  peer.on('open', (pid) => {
    clearTimeout(timeout);
    console.log('✅ Peer açıldı:', pid);
    // ŞİMDİ QR çiz — ID sunucuda kayıtlı
    renderQR(qrHolder, link);
    setStatus('Hazır — QR okutun (' + pid + ')', 'waiting');
  });

  peer.on('error', (err) => {
    clearTimeout(timeout);
    console.error('Peer hata:', err.type, err);
    let msg = 'Peer hatası: ' + err.type;
    if (['network','server-error','socket-error','socket-closed','browser-incompatible'].includes(err.type)) {
      msg = '❌ Sunucuya ulaşılamıyor — ağ engelli olabilir';
    } else if (err.type === 'unavailable-id') {
      msg = 'ID çakışması — sayfayı yenileyin';
    }
    setStatus(msg, 'error');
  });

  peer.on('disconnected', () => {
    setStatus('Bağlantı koptu, yeniden deneniyor...', 'waiting');
    try { peer.reconnect(); } catch (e) {}
  });

  peer.on('connection', (c) => {
    console.log('📥 Gelen bağlantı:', c.peer);
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
    c.on('error', (e) => console.error('Conn hata:', e));
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