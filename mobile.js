const statusEl    = document.getElementById('status');
const connectEl   = document.getElementById('connect');
const chatEl      = document.getElementById('chat');
const messagesEl  = document.getElementById('messages');
const scanBtn     = document.getElementById('scanBtn');
const scannerEl   = document.getElementById('scanner');
const manualLinkEl= document.getElementById('manualLink');
const connectBtn  = document.getElementById('connectManualBtn');
const textInput   = document.getElementById('textInput');
const sendBtn     = document.getElementById('sendBtn');
const attachBtn   = document.getElementById('attachBtn');
const fileInput   = document.getElementById('fileInput');

const chatUI = new ChatUI(messagesEl);
let peer = null, conn = null;

function setStatus(txt, cls) { statusEl.textContent = txt; statusEl.className = 'status ' + (cls || ''); }

function connectTo(peerId) {
  setStatus('Bağlanıyor...', 'waiting');
  peer = new Peer(undefined, { debug: 1 });
  peer.on('open', () => {
    const c = peer.connect(peerId, { reliable: true });
    conn = c;
    c.on('open', () => {
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
      setStatus('Bağlantı kapandı', 'error');
      connectEl.classList.remove('hidden');
      chatEl.classList.add('hidden');
    });
    c.on('error', console.error);
  });
  peer.on('error', err => { console.error(err); setStatus('Hata: ' + err.type, 'error'); });
}

function sendChat() {
  const text = textInput.value.trim();
  if (!text || !conn || !conn.open) return;
  textInput.value = '';
  chatUI.message('out', text);
  conn.send({ type: 'chat', text });
}
sendBtn.addEventListener('click', sendChat);
textInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  for (const f of fileInput.files) await sendFile(conn, f, chatUI);
  fileInput.value = '';
});

connectBtn.addEventListener('click', () => {
  const val = manualLinkEl.value.trim();
  if (!val) return;
  const m = val.match(/peer=([^&]+)/);
  connectTo(m ? decodeURIComponent(m[1]) : val);
});

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
        connectTo(m ? decodeURIComponent(m[1]) : text.trim());
      },
      () => {}
    );
  } catch (e) {
    alert('Kamera hatası: ' + e.message);
    scannerEl.classList.add('hidden');
  }
});

// URL hash ile otomatik bağlan (#peer=XXXX)
const m = location.hash.match(/peer=([^&]+)/);
if (m) connectTo(decodeURIComponent(m[1]));