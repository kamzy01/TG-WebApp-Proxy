/**
 * Telegram File Downloader - Client-Side MTProto
 * Two-step flow: Fetch file info (cached) → Download with parallel connections
 * + Incoming messages with reply popup
 */

import './polyfills.js';
import './style.css';
import { TGDownloader } from './telegram-client.js';
import { parseTelegramLink, describeParsedLink, formatFileSize, getFileIcon } from './link-parser.js';
import { initDB, saveMessage, getAllMessages, saveFile, getAllFiles, markFileDownloaded, clearAllData } from './db.js';

// ===== State =====
let downloader = null;
let isConnected = false;
let isDownloading = false;
let currentFileRef = null;

// ===== Initialize UI =====
async function init() {
  // Initialize IndexedDB
  await initDB();

  const app = document.getElementById('app');
  
  const tempDownloader = new TGDownloader(() => {}, () => {});
  const saved = tempDownloader.getSavedCredentials();
  const hasSavedCreds = saved && saved.apiId && saved.apiHash && saved.botToken;
  
  app.innerHTML = renderApp(hasSavedCreds);
  bindEvents();
  
  if (hasSavedCreds) {
    // Fill hidden fields (for manual connect if needed)
    document.getElementById('apiId').value = saved.apiId || '';
    document.getElementById('apiHash').value = saved.apiHash || '';
    document.getElementById('botToken').value = saved.botToken || '';
  }
  
  addLog('dim', 'All processing happens in your browser. Nothing is sent to any server.');
  
  // Restore saved data from IndexedDB
  await restoreFromDB();
  
  if (hasSavedCreds) {
    addLog('info', 'Found saved session. Auto-reconnecting...');
    autoReconnect(saved);
  } else {
    addLog('dim', 'Enter your credentials and connect.');
  }
}

function renderApp(hasSavedCreds) {
  return `
    <div class="header">
      <h1>📥 Telegram File Downloader</h1>
      <p>Client-side MTProto • No file size limits • Parallel downloads • Powered by GramJS</p>
    </div>

    <!-- Connection Card -->
    <div class="card" id="connectionCard">
      <div class="flex-between mb-8">
        <h2><span class="icon">🔌</span> Connection</h2>
        <span class="status-badge disconnected" id="statusBadge">
          <span class="status-dot"></span>
          <span id="statusText">Disconnected</span>
        </span>
      </div>
      ${hasSavedCreds ? `
        <!-- Creds saved — show minimal bar -->
        <div class="flex-between">
          <span class="text-dim">🔑 Credentials saved</span>
          <div style="display: flex; gap: 8px;">
            <button class="btn-outline btn-sm" id="btnShowCreds">Edit</button>
            <button class="btn-outline btn-sm" id="btnClearSession" title="Clear saved session">🗑️ Clear</button>
          </div>
        </div>
        <div id="credsForm" class="hidden mt-12">
      ` : `
        <div id="credsForm">
      `}
        <div class="form-row">
          <div class="form-group">
            <label for="apiId">API ID</label>
            <input type="text" id="apiId" placeholder="12345678" autocomplete="off" />
          </div>
          <div class="form-group">
            <label for="apiHash">API Hash</label>
            <input type="password" id="apiHash" placeholder="abc123def456..." autocomplete="off" />
          </div>
        </div>
        <div class="form-group">
          <label for="botToken">Bot Token</label>
          <input type="password" id="botToken" placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" autocomplete="off" />
        </div>
        <p class="hint">
          Get API ID & Hash from <a href="https://my.telegram.org" target="_blank" style="color: var(--primary)">my.telegram.org</a> → 
          API Development Tools. Bot token from <a href="https://t.me/BotFather" target="_blank" style="color: var(--primary)">@BotFather</a>.
        </p>
      </div>
      ${hasSavedCreds ? '' : `
      <div class="mt-16" style="display: flex; gap: 8px;">
        <button class="btn-primary" id="btnConnect" style="flex: 1;">⚡ Connect</button>
        <button class="btn-outline btn-sm" id="btnClearSession" title="Clear saved session">🗑️</button>
      </div>
      `}
    </div>

    <!-- Incoming Messages (first) -->
    <div class="card" id="messagesCard">
      <div class="flex-between mb-8">
        <h2><span class="icon">💬</span> Incoming Messages</h2>
        <span class="text-dim" id="msgListeningStatus">Not listening</span>
      </div>
      <p class="hint mb-8">Messages sent to your bot appear here. Click to reply.</p>
      <div id="messagesList">
        <p class="text-dim">No messages yet.</p>
      </div>
    </div>

    <!-- Incoming Files (second) -->
    <div class="card" id="incomingCard">
      <div class="flex-between mb-8">
        <h2><span class="icon">📨</span> Incoming Files</h2>
        <span class="text-dim" id="listeningStatus">Not listening</span>
      </div>
      <p class="hint mb-8">Send files to your bot — they appear here for download.</p>
      <div id="incomingList">
        <p class="text-dim">No incoming files yet.</p>
      </div>
    </div>

    <!-- Download Card (third) -->
    <div class="card" id="downloadCard">
      <h2><span class="icon">📥</span> Download File</h2>
      <div class="form-group">
        <label for="messageLink">Telegram Message Link</label>
        <input type="text" id="messageLink" placeholder="https://t.me/c/2113604672/730 or https://t.me/channel/123" />
      </div>
      <div id="parsedLinkInfo" class="hidden">
        <p class="text-dim" id="parsedLinkText"></p>
      </div>
      <button class="btn-primary mt-12" id="btnFetchInfo" disabled>🔍 Fetch File Info</button>
      <div id="fileInfoBox" class="hidden">
        <dl class="file-info" id="fileInfoContent"></dl>
        <div class="mt-16" style="display: flex; gap: 8px; align-items: center;">
          <div class="form-group" style="margin-bottom: 0; flex: 0 0 auto;">
            <label for="connections" style="margin-bottom: 4px;">Connections</label>
            <select id="connections" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; color: var(--text); font-size: 0.95rem; font-family: inherit;">
              <option value="1">1 (Standard)</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4" selected>4</option>
              <option value="6">6</option>
              <option value="8">8 (Max)</option>
            </select>
          </div>
          <button class="btn-success" id="btnDownload" style="flex: 1; margin-top: 18px;">📥 Download</button>
        </div>
      </div>
      <div id="progressBox" class="hidden">
        <div class="progress-container">
          <div class="progress-bar-bg"><div class="progress-bar-fill" id="progressBar"></div></div>
          <div class="progress-info">
            <span id="progressPercent">0%</span>
            <span id="progressSpeed">--</span>
            <span id="progressEta">--</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Log Card (fourth) -->
    <div class="card">
      <div class="flex-between mb-8">
        <h2><span class="icon">📋</span> Log</h2>
        <button class="btn-outline btn-sm" id="btnClearLog">Clear</button>
      </div>
      <div class="log-container" id="logContainer"></div>
    </div>

    <!-- Reply Popup Modal -->
    <div id="replyModal" class="modal-overlay hidden">
      <div class="modal">
        <div class="modal-header">
          <h3 id="replyModalTitle">💬 Reply</h3>
          <button class="btn-outline btn-sm" id="btnCloseModal">✕</button>
        </div>
        <div class="modal-body">
          <div id="replyOriginalMsg" class="reply-original"></div>
          <div id="replyConversation" class="reply-conversation"></div>
          <div class="reply-input-row">
            <input type="text" id="replyInput" placeholder="Type your reply..." />
            <button class="btn-primary btn-sm" id="btnSendReply">Send</button>
          </div>
        </div>
      </div>
    </div>

    <p style="text-align: center; margin-top: 24px; font-size: 0.75rem; color: var(--text-dim);">
      🔒 Everything runs in your browser. Credentials never leave your device.<br/>
      Built with <a href="https://gram.js.org" target="_blank" style="color: var(--primary)">GramJS</a> • 
      Deployed on <a href="https://pages.cloudflare.com" target="_blank" style="color: var(--primary)">Cloudflare Pages</a>
    </p>
  `;
}

// ===== Restore from IndexedDB =====
async function restoreFromDB() {
  try {
    // Restore messages
    const msgs = await getAllMessages(50);
    for (const msg of msgs.reverse()) {
      renderRestoredMessage(msg);
    }
    
    // Restore files
    const files = await getAllFiles(50);
    for (const file of files.reverse()) {
      renderRestoredFile(file);
    }
    
    if (msgs.length || files.length) {
      addLog('dim', `Restored ${msgs.length} messages and ${files.length} files from local storage.`);
    }
  } catch (e) {
    addLog('dim', 'Could not restore saved data.');
  }
}

function renderRestoredMessage(msg) {
  const list = document.getElementById('messagesList');
  if (!list) return;
  if (list.querySelector('.text-dim')) list.innerHTML = '';

  const typeIcons = { User: '👤', Channel: '📢', Group: '👥' };
  const typeIcon = typeIcons[msg.senderType] || '💬';
  const time = msg.date ? new Date(msg.date).toLocaleTimeString() : '';
  const preview = msg.text || (msg.hasMedia ? '📎 [Media]' : '[Empty]');

  const item = document.createElement('div');
  item.className = 'msg-item';
  item.innerHTML = `
    <div class="msg-sender">
      <span class="sender-badge sender-${(msg.senderType || 'user').toLowerCase()}">${typeIcon} ${msg.senderType || 'User'}</span>
      <span class="msg-sender-name">${escapeHtml(msg.senderName || 'Unknown')}</span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="msg-text">${escapeHtml(preview.length > 150 ? preview.slice(0, 150) + '...' : preview)}</div>
    ${msg.hasMedia ? '<div class="msg-media-badge">📎 Has attachment</div>' : ''}
  `;
  list.prepend(item);
}

function renderRestoredFile(file) {
  const list = document.getElementById('incomingList');
  if (!list) return;
  if (list.querySelector('.text-dim')) list.innerHTML = '';

  const icon = getFileIcon(file.mimeType, file.fileName);
  const time = file.date ? new Date(file.date).toLocaleTimeString() : '';

  const item = document.createElement('div');
  item.className = 'incoming-file-item';
  item.innerHTML = `
    <div class="incoming-file-header">
      <span class="file-icon">${icon}</span>
      <div class="file-details">
        <div class="file-name">${file.fileName}</div>
        <div class="file-meta">${formatFileSize(file.fileSize)} • ${file.mimeType || 'Unknown'} • ${file.chatName || ''} • ${time}</div>
      </div>
    </div>
    <div class="text-dim" style="margin-top:6px; font-size:0.78rem;">${file.downloaded ? '✅ Downloaded' : '⏳ Connect to download'}</div>
  `;
  list.prepend(item);
}

// ===== Event Bindings =====
function bindEvents() {
  const btnConnect = document.getElementById('btnConnect');
  if (btnConnect) btnConnect.addEventListener('click', handleConnect);
  document.getElementById('btnFetchInfo').addEventListener('click', handleFetchInfo);
  document.getElementById('btnDownload').addEventListener('click', handleDownload);
  document.getElementById('btnClearLog').addEventListener('click', () => {
    document.getElementById('logContainer').innerHTML = '';
  });
  document.getElementById('btnClearSession').addEventListener('click', handleClearSession);
  const btnShowCreds = document.getElementById('btnShowCreds');
  if (btnShowCreds) btnShowCreds.addEventListener('click', () => {
    document.getElementById('credsForm').classList.toggle('hidden');
  });
  document.getElementById('btnCloseModal').addEventListener('click', closeReplyModal);
  document.getElementById('btnSendReply').addEventListener('click', handleSendReply);
  document.getElementById('replyInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); }
  });
  document.getElementById('replyModal').addEventListener('click', (e) => {
    if (e.target.id === 'replyModal') closeReplyModal();
  });
  
  document.getElementById('messageLink').addEventListener('input', (e) => {
    const parsed = parseTelegramLink(e.target.value);
    const infoEl = document.getElementById('parsedLinkInfo');
    const textEl = document.getElementById('parsedLinkText');
    currentFileRef = null;
    document.getElementById('fileInfoBox').classList.add('hidden');
    document.getElementById('progressBox').classList.add('hidden');
    resetProgress();
    if (parsed) {
      infoEl.classList.remove('hidden');
      textEl.textContent = '✅ ' + describeParsedLink(parsed);
      document.getElementById('btnFetchInfo').disabled = !isConnected;
    } else if (e.target.value.trim()) {
      infoEl.classList.remove('hidden');
      textEl.textContent = '❌ Invalid Telegram link';
      document.getElementById('btnFetchInfo').disabled = true;
    } else {
      infoEl.classList.add('hidden');
      document.getElementById('btnFetchInfo').disabled = true;
    }
  });
}

// ===== Auto Reconnect =====
async function autoReconnect(saved) {
  setConnectionStatus('connecting');
  try {
    downloader = new TGDownloader(addLog, updateProgress);
    await downloader.connect(saved.apiId, saved.apiHash, saved.botToken);
    isConnected = true;
    setConnectionStatus('connected');
    startListeners();
    const link = document.getElementById('messageLink')?.value?.trim();
    if (link && parseTelegramLink(link)) {
      const btn = document.getElementById('btnFetchInfo');
      if (btn) btn.disabled = false;
    }
  } catch (error) {
    setConnectionStatus('disconnected');
    addLog('warn', `Auto-reconnect failed: ${error.message}`);
  }
}

// ===== Connection Handler =====
async function handleConnect() {
  const btn = document.getElementById('btnConnect');
  if (isConnected && downloader) {
    await downloader.disconnect();
    setConnectionStatus('disconnected');
    isConnected = false;
    btn.innerHTML = '⚡ Connect';
    btn.className = 'btn-primary';
    document.getElementById('btnFetchInfo').disabled = true;
    return;
  }
  const apiId = document.getElementById('apiId').value.trim();
  const apiHash = document.getElementById('apiHash').value.trim();
  const botToken = document.getElementById('botToken').value.trim();
  if (!apiId || !apiHash || !botToken) { addLog('error', 'Please fill in all credentials.'); return; }

  btn.disabled = true;
  btn.innerHTML = '⏳ Connecting...';
  setConnectionStatus('connecting');
  try {
    downloader = new TGDownloader(addLog, updateProgress);
    await downloader.connect(apiId, apiHash, botToken);
    isConnected = true;
    setConnectionStatus('connected');
    btn.innerHTML = '🔌 Disconnect';
    btn.className = 'btn-danger';
    startListeners();
    const link = document.getElementById('messageLink').value.trim();
    if (parseTelegramLink(link)) document.getElementById('btnFetchInfo').disabled = false;
  } catch (error) {
    setConnectionStatus('disconnected');
    btn.innerHTML = '⚡ Connect';
    addLog('error', `Failed: ${error.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ===== Listeners =====
let listenersStarted = false;

function startListeners() {
  if (listenersStarted || !downloader || !isConnected) return;
  listenersStarted = true;

  const fileStatus = document.getElementById('listeningStatus');
  const msgStatus = document.getElementById('msgListeningStatus');
  if (fileStatus) fileStatus.textContent = '🟢 Listening';
  if (msgStatus) msgStatus.textContent = '🟢 Listening';

  // File listener (media only)
  downloader.startListening((fileRef) => addIncomingFile(fileRef));

  // Message listener (all messages)
  downloader.startMessageListener((msgInfo) => addIncomingMessage(msgInfo));
}

// ===== Step 1: Fetch File Info =====
async function handleFetchInfo() {
  if (!isConnected || !downloader) return;
  const linkInput = document.getElementById('messageLink').value.trim();
  const parsed = parseTelegramLink(linkInput);
  if (!parsed) { addLog('error', 'Invalid Telegram link.'); return; }

  const btn = document.getElementById('btnFetchInfo');
  btn.disabled = true;
  btn.innerHTML = '⏳ Fetching...';
  try {
    const chatId = parsed.type === 'public' ? parsed.username : parsed.fullChannelId.toString();
    addLog('info', `Resolving: ${describeParsedLink(parsed)}`);
    currentFileRef = await downloader.fetchFileInfo(chatId, parsed.messageId, linkInput);
    showFileInfo(currentFileRef);
    btn.innerHTML = '✅ File info loaded';
    setTimeout(() => { btn.innerHTML = '🔍 Fetch File Info'; }, 2000);
  } catch (error) {
    addLog('error', `Fetch failed: ${error.message}`);
    btn.innerHTML = '🔍 Fetch File Info';
    currentFileRef = null;
  } finally {
    btn.disabled = false;
  }
}

// ===== Step 2: Download =====
async function handleDownload() {
  if (!isConnected || !downloader || isDownloading || !currentFileRef) return;
  const connections = parseInt(document.getElementById('connections').value) || 4;
  const btn = document.getElementById('btnDownload');
  const progressBox = document.getElementById('progressBox');
  btn.disabled = true;
  btn.innerHTML = '⏳ Downloading...';
  isDownloading = true;
  progressBox.classList.remove('hidden');
  resetProgress();
  try {
    const { blob, fileInfo } = await downloader.downloadFile(currentFileRef, connections);
    downloader.saveBlobAs(blob, fileInfo.fileName);
    addToHistory(fileInfo);
    btn.innerHTML = '✅ Done!';
    setTimeout(() => { btn.innerHTML = '📥 Download'; progressBox.classList.add('hidden'); resetProgress(); }, 3000);
  } catch (error) {
    addLog('error', `Download failed: ${error.message}`);
    btn.innerHTML = '📥 Download';
    progressBox.classList.add('hidden');
    resetProgress();
  } finally {
    btn.disabled = false;
    isDownloading = false;
  }
}

// ===== Incoming Files (fixed layout: download below) =====
let incomingCounter = 0;

function addIncomingFile(fileRef) {
  const list = document.getElementById('incomingList');
  if (!list) return;
  if (list.querySelector('.text-dim')) list.innerHTML = '';

  const id = `incoming_${incomingCounter++}`;
  const icon = getFileIcon(fileRef.mimeType, fileRef.fileName);
  const time = fileRef.date ? fileRef.date.toLocaleTimeString() : new Date().toLocaleTimeString();

  const item = document.createElement('div');
  item.className = 'incoming-file-item';
  item.id = id;
  item.innerHTML = `
    <div class="incoming-file-header">
      <span class="file-icon">${icon}</span>
      <div class="file-details">
        <div class="file-name">${fileRef.fileName}</div>
        <div class="file-meta">${formatFileSize(fileRef.fileSize)} • ${fileRef.mimeType || 'Unknown'} • ${fileRef.chatName || ''} • ${time}</div>
      </div>
    </div>
    <button class="btn-success btn-sm incoming-dl-btn">📥 Download</button>
  `;
  item.querySelector('button').addEventListener('click', () => handleIncomingDownload(item, fileRef));
  list.prepend(item);

  // Persist to IndexedDB
  saveFile(fileRef).catch(() => {});
}

async function handleIncomingDownload(itemEl, fileRef) {
  if (!isConnected || !downloader || isDownloading) {
    addLog('warn', 'Cannot download: busy or disconnected.');
    return;
  }
  const btn = itemEl.querySelector('button');
  const connections = parseInt(document.getElementById('connections')?.value) || 4;
  btn.disabled = true;
  btn.innerHTML = '⏳ ...';
  isDownloading = true;
  const progressBox = document.getElementById('progressBox');
  progressBox.classList.remove('hidden');
  resetProgress();
  try {
    const { blob, fileInfo } = await downloader.downloadFile(fileRef, connections);
    downloader.saveBlobAs(blob, fileInfo.fileName);
    addToHistory(fileInfo);
    btn.innerHTML = '✅ Done';
    btn.className = 'btn-outline btn-sm incoming-dl-btn';
    setTimeout(() => { progressBox.classList.add('hidden'); resetProgress(); }, 2000);
  } catch (error) {
    addLog('error', `Download failed: ${error.message}`);
    btn.innerHTML = '📥 Retry';
    btn.disabled = false;
    progressBox.classList.add('hidden');
    resetProgress();
  } finally {
    isDownloading = false;
  }
}

// ===== Incoming Messages =====
let msgCounter = 0;

function addIncomingMessage(msgInfo) {
  const list = document.getElementById('messagesList');
  if (!list) return;
  if (list.querySelector('.text-dim')) list.innerHTML = '';

  const id = `msg_${msgCounter++}`;
  const time = msgInfo.date ? msgInfo.date.toLocaleTimeString() : new Date().toLocaleTimeString();
  
  // Sender type badge
  const typeIcons = { User: '👤', Channel: '📢', Group: '👥' };
  const typeIcon = typeIcons[msgInfo.senderType] || '💬';
  const typeBadge = `<span class="sender-badge sender-${msgInfo.senderType.toLowerCase()}">${typeIcon} ${msgInfo.senderType}</span>`;
  
  // Message preview (truncate long text)
  const preview = msgInfo.text 
    ? (msgInfo.text.length > 150 ? msgInfo.text.slice(0, 150) + '...' : msgInfo.text)
    : (msgInfo.hasMedia ? '📎 [Media]' : '[Empty]');

  const item = document.createElement('div');
  item.className = 'msg-item';
  item.id = id;
  item.innerHTML = `
    <div class="msg-sender">
      ${typeBadge}
      <span class="msg-sender-name">${escapeHtml(msgInfo.senderName)}</span>
      <span class="msg-time">${time}</span>
    </div>
    <div class="msg-text">${escapeHtml(preview)}</div>
    ${msgInfo.hasMedia ? '<div class="msg-media-badge">📎 Has attachment</div>' : ''}
    <div class="msg-actions">
      <button class="btn-outline btn-sm msg-reply-btn">💬 Reply</button>
    </div>
  `;

  // Store msgInfo for reply
  item._msgInfo = msgInfo;
  item.querySelector('.msg-reply-btn').addEventListener('click', () => openReplyModal(msgInfo));

  list.prepend(item);

  // Persist to IndexedDB
  saveMessage(msgInfo).catch(() => {});
}

// ===== Reply Modal =====
let currentReplyTarget = null;

function openReplyModal(msgInfo) {
  currentReplyTarget = msgInfo;
  
  const modal = document.getElementById('replyModal');
  const title = document.getElementById('replyModalTitle');
  const original = document.getElementById('replyOriginalMsg');
  const conversation = document.getElementById('replyConversation');
  const input = document.getElementById('replyInput');

  title.textContent = `💬 Reply to ${msgInfo.senderName}`;
  
  const preview = msgInfo.text || (msgInfo.hasMedia ? '📎 [Media]' : '[Empty]');
  original.innerHTML = `
    <div class="reply-original-sender">${escapeHtml(msgInfo.senderName)}</div>
    <div class="reply-original-text">${escapeHtml(preview)}</div>
  `;

  conversation.innerHTML = ''; // Clear previous conversation
  input.value = '';
  modal.classList.remove('hidden');
  input.focus();
}

function closeReplyModal() {
  document.getElementById('replyModal').classList.add('hidden');
  currentReplyTarget = null;
}

async function handleSendReply() {
  if (!currentReplyTarget || !downloader || !isConnected) return;

  const input = document.getElementById('replyInput');
  const text = input.value.trim();
  if (!text) return;

  const btn = document.getElementById('btnSendReply');
  btn.disabled = true;
  btn.innerHTML = '⏳';

  try {
    await downloader.sendMessage(currentReplyTarget.chatPeer, text, currentReplyTarget.id);
    
    // Add sent message to conversation
    const conversation = document.getElementById('replyConversation');
    const sent = document.createElement('div');
    sent.className = 'reply-sent';
    sent.innerHTML = `
      <div class="reply-sent-text">${escapeHtml(text)}</div>
      <div class="reply-sent-time">${new Date().toLocaleTimeString()}</div>
    `;
    conversation.appendChild(sent);
    conversation.scrollTop = conversation.scrollHeight;

    input.value = '';
    input.focus();
  } catch (error) {
    addLog('error', `Reply failed: ${error.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Send';
  }
}

// ===== Clear Session =====
function handleClearSession() {
  const temp = new TGDownloader(() => {}, () => {});
  temp.clearSession();
  document.getElementById('apiId').value = '';
  document.getElementById('apiHash').value = '';
  document.getElementById('botToken').value = '';
  currentFileRef = null;
  addLog('info', 'Session and credentials cleared.');
}

// ===== UI Helpers =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setConnectionStatus(status) {
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('statusText');
  badge.className = `status-badge ${status}`;
  text.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

function addLog(type, message) {
  const container = document.getElementById('logContainer');
  if (!container) return;
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${time}] ${message}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function updateProgress(progress) {
  const bar = document.getElementById('progressBar');
  const percent = document.getElementById('progressPercent');
  const speed = document.getElementById('progressSpeed');
  const eta = document.getElementById('progressEta');
  if (!bar) return;
  bar.style.width = `${progress.percent.toFixed(1)}%`;
  percent.textContent = `${progress.percent.toFixed(1)}%`;
  speed.textContent = `${formatFileSize(progress.speed)}/s`;
  if (progress.remaining > 0 && progress.remaining < 86400) {
    const mins = Math.floor(progress.remaining / 60);
    const secs = Math.floor(progress.remaining % 60);
    eta.textContent = mins > 0 ? `${mins}m ${secs}s left` : `${secs}s left`;
  } else {
    eta.textContent = 'Calculating...';
  }
}

function resetProgress() {
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = '0%';
  document.getElementById('progressPercent').textContent = '0%';
  document.getElementById('progressSpeed').textContent = '--';
  document.getElementById('progressEta').textContent = '--';
}

function showFileInfo(fileRef) {
  const box = document.getElementById('fileInfoBox');
  const content = document.getElementById('fileInfoContent');
  content.innerHTML = `
    <dt>📄 File</dt><dd>${fileRef.fileName}</dd>
    <dt>📊 Size</dt><dd>${formatFileSize(fileRef.fileSize)}</dd>
    <dt>📎 Type</dt><dd>${fileRef.mimeType || 'Unknown'}</dd>
    <dt>🏢 DC</dt><dd>DC ${fileRef.dcId || '?'}</dd>
  `;
  box.classList.remove('hidden');
}

function addToHistory(fileInfo) {
  const list = document.getElementById('historyList');
  const icon = getFileIcon(fileInfo.mimeType, fileInfo.fileName);
  if (list.querySelector('.text-dim')) list.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'history-item';
  item.innerHTML = `
    <span class="file-icon">${icon}</span>
    <div class="file-details">
      <div class="file-name">${fileInfo.fileName}</div>
      <div class="file-meta">${formatFileSize(fileInfo.fileSize)} • ${fileInfo.mimeType || 'Unknown'} • ${new Date().toLocaleTimeString()}</div>
    </div>
  `;
  list.prepend(item);
}

// ===== Internet / Connection Recovery =====
let reconnectTimer = null;

function startConnectionWatcher() {
  window.addEventListener('online', () => {
    addLog('info', '🌐 Internet restored. Reconnecting in 5s...');
    scheduleReconnect(5000);
  });
  window.addEventListener('offline', () => {
    addLog('warn', '📡 Internet lost. Waiting for connection...');
    setConnectionStatus('disconnected');
    isConnected = false;
    const btn = document.getElementById('btnConnect');
    if (btn) { btn.innerHTML = '⚡ Connect'; btn.className = 'btn-primary'; }
  });
  setInterval(async () => {
    if (!downloader || !navigator.onLine) return;
    if (isConnected && downloader.connected) return;
    if (navigator.onLine && downloader._credentials) {
      addLog('info', '🔄 Periodic check: reconnecting...');
      try {
        await downloader.reconnect();
        isConnected = true;
        setConnectionStatus('connected');
        const btn = document.getElementById('btnConnect');
        if (btn) { btn.innerHTML = '🔌 Disconnect'; btn.className = 'btn-danger'; }
        startListeners();
        addLog('success', '✅ Auto-reconnected successfully!');
      } catch { addLog('dim', 'Reconnect attempt failed. Will retry in 60s.'); }
    }
  }, 60000);
}

function scheduleReconnect(delayMs) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    if (!downloader || isConnected) return;
    try {
      setConnectionStatus('connecting');
      await downloader.reconnect();
      isConnected = true;
      setConnectionStatus('connected');
      const btn = document.getElementById('btnConnect');
      if (btn) { btn.innerHTML = '🔌 Disconnect'; btn.className = 'btn-danger'; }
      startListeners();
      addLog('success', '✅ Reconnected after internet restored!');
    } catch (e) {
      addLog('warn', `Reconnect failed: ${e.message}. Retrying in 30s...`);
      scheduleReconnect(30000);
    }
  }, delayMs);
}

// ===== Boot =====
document.addEventListener('DOMContentLoaded', () => {
  init();
  startConnectionWatcher();
});
window.addEventListener('beforeunload', () => {
  if (downloader && isConnected) downloader.disconnect().catch(() => {});
});
