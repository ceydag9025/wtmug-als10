console.log('%cmobile.js v9 — ' + new Date().toISOString(), 'color:#22c55e;font-weight:bold');

const statusEl     = document.getElementById('status');
const connectEl    = document.getElementById('connect');
const chatEl       = document.getElementById('chat');
const messagesEl   = document.getElementById('messages');
const scanBtn      = document.getElementById('scanBtn');
const scannerEl    = document.getElementById('scanner');
const manualLinkEl = document.getElementById('manualLink');
const connectBtn   = document.getElementById('connectManualBtn');
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

function extractPeerId(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/peer=([^&]+)/);
  if (m) return decodeURIComponent(m[1]);
  return s;
}

function connectTo(peerId) {
  if (!peerId) return;
  setStatus('Sunucuya bağlanılıyor...', 'waiting');

  if (typeof Peer === 'undefined') {
    setStatus('PeerJS yüklenemedi (CDN engelli)', 'error');
    return;
  }

  peer = new Peer(undefined, PEER_CONFIG);

  const timeout = setTimeout(() => {
    if (peer && !peer.open) {
      setStatus('❌ Sunucuya ulaşılamıyor (ağ engelli?)', 'error');
      alert('PeerJS sunucusuna bağlanılamadı.\n\n' +
            'Çözüm: Wi-Fi kapatıp mobil veriyle dene, ya da VPN kapat.');
    }
  }, 12000);

  peer.on('open', () => {
    clearTimeout(timeout);
    console.log('[Mobile] Peer açıldı, hedefe bağlanılıyor:', peerId);
    setStatus('Hedefe bağlanılıyor...', 'waiting');

    const c = peer.connect(peerId, { reliable: true });
    conn = c;

    const connTimeout = setTimeout(() => {
      if (!c.open) {
        console.warn('[Mobile] Bağlantı timeout');
        setStatus('❌ Hedef cevap vermiyor', 'error');
        alert('Bağlantı kurulamadı.\n\n' +
              'Muhtemel nedenler:\n' +
              '1. Bilgisayar sayfası yenilenmiş olabilir (yeni ID üretti)\n' +
              '2. Bilgisayar PeerJS sunucusuna bağlanamamış\n' +
              '3. Farklı ağlar arası NAT geçilemiyor\n\n' +
              'Öneri: Bilgisayardaki QR\'ı TEKRAR okut.');
      }
    }, 15000);

    c.on('open', () => {
      clearTimeout(connTimeout);
      console.log('[Mobile] ✅ Bağlantı kuruldu');
      setStatus('Bağlı: ' + peerId, 'connected');
      connectEl.classList.add('hidden');
      chatEl.classList.remove('hidden');
      chatUI.system('Bağlantı kuruldu.');
    });
    c.on('data', (data) => {
      if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) chatUI.handleBinary(data);
      else if (data && typeof data === 'object') chatUI.handleMeta(data);
    });
    c.on('close', () => {
      clearTimeout(connTimeout);
      setStatus('Bağlantı kapandı', 'error');
      connectEl.classList.remove('hidden');
      chatEl.classList.add('hidden');
    });
    c.on('error', (e) => {
      clearTimeout(connTimeout);
      console.error('[Mobile] Conn hata:', e);
    });
  });

  peer.on('error', (err) => {
    clearTimeout(timeout);
    console.error('[Mobile] Peer hata:', err.type, err);
    if (err.type === 'peer-unavailable') {
      setStatus('❌ Bu ID ile kimse yok (QR eski olabilir)', 'error');
      alert('Bu Peer ID şu an çevrimiçi değil.\n\n' +
            'Muhtemelen bilgisayardaki sayfa yenilenmiş ve yeni ID üretmiş.\n' +
            'Bilgisayardaki QR\'ı TEKRAR okutun.');
    } else if (['network','server-error','socket-error'].includes(err.type)) {
      setStatus('❌ Sunucuya ulaşılamıyor', 'error');
      alert('PeerJS sunucusuna ulaşılamıyor.\nMobil veriyle veya farklı Wi-Fi ile deneyin.');
    } else {
      setStatus('Hata: ' + err.type, 'error');
    }
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

connectBtn.addEventListener('click', () => {
  const id = extractPeerId(manualLinkEl.value);
  if (id) connectTo(id);
});

scanBtn.addEventListener('click', async () => {
  if (typeof Html5Qrcode === 'undefined') {
    alert('QR okuyucu yüklenemedi. Linki elle yapıştırın.');
    return;
  }
  scannerEl.classList.remove('hidden');
  const scanner = new Html5Qrcode('scanner');
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (text) => {
        scanner.stop().then(() => { scanner.clear(); scannerEl.classList.add('hidden'); });
        const id = extractPeerId(text);
        if (id) { manualLinkEl.value = id; connectTo(id); }
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
  manualLinkEl.value = id;
  connectTo(id);
}