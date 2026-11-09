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

const chatUI = new ChatUI(messagesEl);
let peer = null, conn = null;

function setStatus(txt, cls) { statusEl.textContent = txt; statusEl.className = 'status ' + (cls || ''); }

function init() {
  const id = 'w-' + Math.random().toString(36).slice(2, 10);
  peer = new Peer(id, { debug: 1 });

  peer.on('open', (peerId) => {
    setStatus('Bekleniyor — QR kodu okutun', 'waiting');
    const url = new URL('mobile.html', location.href.replace(/[^/]*$/, ''));
    url.hash = 'peer=' + peerId;
    peerLinkEl.value = url.toString();
    QRCode.toCanvas(document.getElementById('qrcode'), url.toString(),
      { width: 260, margin: 1 }, err => err && console.error(err));
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
copyBtn.addEventListener('click', () => {
  peerLinkEl.select(); navigator.clipboard.writeText(peerLinkEl.value).catch(()=>{});
});

init();