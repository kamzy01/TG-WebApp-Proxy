/**
 * Telegram File Downloader - Client-Side MTProto
 * 
 * Runs entirely in the user's browser via GramJS (Telethon for JS).
 * Connects to Telegram's MTProto servers via WebSocket.
 * No file size limits. No server needed. Session stored locally.
 * 
 * Deploy as a static site on Cloudflare Pages.
 */

// MUST be first import - sets up Buffer/process globals before GramJS loads
import './polyfills.js';

import './style.css';
import { TGDownloader } from './telegram-client.js';
import { parseTelegramLink, describeParsedLink, formatFileSize, getFileIcon } from './link-parser.js';

// ===== State =====
let downloader = null;
let isConnected = false;
let isDownloading = false;

// ===== Initialize UI =====
function init() {
  const app = document.getElementById('app');
  app.innerHTML = renderApp();
  
  // Bind events
  bindEvents();
  
  // Try to restore saved credentials
  const tempDownloader = new TGDownloader(() => {}, () => {});
  const saved = tempDownloader.getSavedCredentials();
  if (saved) {
    document.getElementById('apiId').value = saved.apiId || '';
    document.getElementById('apiHash').value = saved.apiHash || '';
    document.getElementById('botToken').value = saved.botToken || '';
  }
  
  addLog('dim', 'Ready. Enter your credentials and connect.');
  addLog('dim', 'All processing happens in your browser. Nothing is sent to any server.');
  
  // Auto-reconnect if we have saved credentials
  if (saved && saved.apiId && saved.apiHash && saved.botToken) {
    addLog('info', 'Found saved session. Auto-reconnecting...');
    autoReconnect(saved);
  }
}

function renderApp() {
  return `
    <div class="header">
      <h1>📥 Telegram File Downloader</h1>
      <p>Client-side MTProto • No file size limits • Powered by GramJS</p>
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

      <div class="mt-16" style="display: flex; gap: 8px;">
        <button class="btn-primary" id="btnConnect" style="flex: 1;">
          ⚡ Connect
        </button>
        <button class="btn-outline btn-sm" id="btnClearSession" title="Clear saved session">
          🗑️
        </button>
      </div>
    </div>

    <!-- Download Card -->
    <div class="card" id="downloadCard">
      <h2><span class="icon">📥</span> Download File</h2>

      <div class="form-group">
        <label for="messageLink">Telegram Message Link</label>
        <input type="text" id="messageLink" placeholder="https://t.me/c/2113604672/730 or https://t.me/channel/123" />
      </div>

      <div id="parsedLinkInfo" class="hidden">
        <p class="text-dim" id="parsedLinkText"></p>
      </div>

      <button class="btn-success mt-12" id="btnDownload" disabled>
        📥 Fetch & Download
      </button>

      <!-- File Info (shown after fetch) -->
      <div id="fileInfoBox" class="hidden">
        <dl class="file-info" id="fileInfoContent"></dl>
      </div>

      <!-- Progress -->
      <div id="progressBox" class="hidden">
        <div class="progress-container">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="progressBar"></div>
          </div>
          <div class="progress-info">
            <span id="progressPercent">0%</span>
            <span id="progressSpeed">--</span>
            <span id="progressEta">--</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Log Card -->
    <div class="card">
      <div class="flex-between mb-8">
        <h2><span class="icon">📋</span> Log</h2>
        <button class="btn-outline btn-sm" id="btnClearLog">Clear</button>
      </div>
      <div class="log-container" id="logContainer"></div>
    </div>

    <!-- Download History -->
    <div class="card" id="historyCard">
      <h2><span class="icon">📜</span> Download History</h2>
      <div id="historyList">
        <p class="text-dim">No downloads yet.</p>
      </div>
    </div>

    <p style="text-align: center; margin-top: 24px; font-size: 0.75rem; color: var(--text-dim);">
      🔒 Everything runs in your browser. Credentials never leave your device.<br/>
      Built with <a href="https://gram.js.org" target="_blank" style="color: var(--primary)">GramJS</a> • 
      Deployed on <a href="https://pages.cloudflare.com" target="_blank" style="color: var(--primary)">Cloudflare Pages</a>
    </p>
  `;
}

// ===== Event Bindings =====
function bindEvents() {
  document.getElementById('btnConnect').addEventListener('click', handleConnect);
  document.getElementById('btnDownload').addEventListener('click', handleDownload);
  document.getElementById('btnClearLog').addEventListener('click', () => {
    document.getElementById('logContainer').innerHTML = '';
  });
  document.getElementById('btnClearSession').addEventListener('click', handleClearSession);
  
  // Live parse the link as user types
  document.getElementById('messageLink').addEventListener('input', (e) => {
    const parsed = parseTelegramLink(e.target.value);
    const infoEl = document.getElementById('parsedLinkInfo');
    const textEl = document.getElementById('parsedLinkText');
    
    if (parsed) {
      infoEl.classList.remove('hidden');
      textEl.textContent = '✅ ' + describeParsedLink(parsed);
      document.getElementById('btnDownload').disabled = !isConnected;
    } else if (e.target.value.trim()) {
      infoEl.classList.remove('hidden');
      textEl.textContent = '❌ Invalid Telegram link';
      document.getElementById('btnDownload').disabled = true;
    } else {
      infoEl.classList.add('hidden');
      document.getElementById('btnDownload').disabled = true;
    }
  });
}

// ===== Auto Reconnect =====
async function autoReconnect(saved) {
  const btn = document.getElementById('btnConnect');
  btn.disabled = true;
  btn.innerHTML = '⏳ Reconnecting...';
  setConnectionStatus('connecting');

  try {
    downloader = new TGDownloader(addLog, updateProgress);
    await downloader.connect(saved.apiId, saved.apiHash, saved.botToken);
    
    isConnected = true;
    setConnectionStatus('connected');
    btn.innerHTML = '🔌 Disconnect';
    btn.className = 'btn-danger';
    
    // Enable download if link is already entered
    const link = document.getElementById('messageLink').value.trim();
    if (parseTelegramLink(link)) {
      document.getElementById('btnDownload').disabled = false;
    }
  } catch (error) {
    setConnectionStatus('disconnected');
    btn.innerHTML = '⚡ Connect';
    addLog('warn', `Auto-reconnect failed. Click Connect to try manually.`);
  } finally {
    btn.disabled = false;
  }
}

// ===== Connection Handler =====
async function handleConnect() {
  const btn = document.getElementById('btnConnect');
  
  // If already connected, disconnect
  if (isConnected && downloader) {
    await downloader.disconnect();
    setConnectionStatus('disconnected');
    isConnected = false;
    btn.innerHTML = '⚡ Connect';
    btn.className = 'btn-primary';
    document.getElementById('btnDownload').disabled = true;
    return;
  }

  const apiId = document.getElementById('apiId').value.trim();
  const apiHash = document.getElementById('apiHash').value.trim();
  const botToken = document.getElementById('botToken').value.trim();

  if (!apiId || !apiHash || !botToken) {
    addLog('error', 'Please fill in all credentials (API ID, API Hash, Bot Token).');
    return;
  }

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
    
    // Enable download if link is already entered
    const link = document.getElementById('messageLink').value.trim();
    if (parseTelegramLink(link)) {
      document.getElementById('btnDownload').disabled = false;
    }
  } catch (error) {
    setConnectionStatus('disconnected');
    btn.innerHTML = '⚡ Connect';
    addLog('error', `Failed: ${error.message}`);
  } finally {
    btn.disabled = false;
  }
}

// ===== Download Handler =====
async function handleDownload() {
  if (!isConnected || !downloader || isDownloading) return;

  const linkInput = document.getElementById('messageLink').value.trim();
  const parsed = parseTelegramLink(linkInput);
  
  if (!parsed) {
    addLog('error', 'Invalid Telegram link.');
    return;
  }

  const btn = document.getElementById('btnDownload');
  const progressBox = document.getElementById('progressBox');
  const fileInfoBox = document.getElementById('fileInfoBox');
  
  btn.disabled = true;
  btn.innerHTML = '⏳ Downloading...';
  isDownloading = true;
  progressBox.classList.remove('hidden');
  fileInfoBox.classList.add('hidden');
  resetProgress();

  try {
    // Determine chat identifier
    let chatId;
    if (parsed.type === 'public') {
      chatId = parsed.username;
    } else {
      chatId = parsed.fullChannelId.toString();
    }

    // Fetch message
    addLog('info', `Resolving: ${describeParsedLink(parsed)}`);
    const { message } = await downloader.getMessage(chatId, parsed.messageId);

    // Get file info
    const fileInfo = downloader.getFileInfo(message);
    if (!fileInfo || !fileInfo.hasMedia) {
      throw new Error('This message does not contain any downloadable media.');
    }

    // Show file info
    showFileInfo(fileInfo);

    // Download
    const { blob } = await downloader.downloadFile(message);

    // Save to user's device
    downloader.saveBlobAs(blob, fileInfo.fileName);

    // Add to history
    addToHistory(fileInfo);

    btn.innerHTML = '✅ Done! Download Another?';
    setTimeout(() => {
      btn.innerHTML = '📥 Fetch & Download';
    }, 3000);
  } catch (error) {
    addLog('error', `Download failed: ${error.message}`);
    btn.innerHTML = '📥 Fetch & Download';
  } finally {
    btn.disabled = false;
    isDownloading = false;
  }
}

// ===== Clear Session =====
function handleClearSession() {
  const temp = new TGDownloader(() => {}, () => {});
  temp.clearSession();
  document.getElementById('apiId').value = '';
  document.getElementById('apiHash').value = '';
  document.getElementById('botToken').value = '';
  addLog('info', 'Session and credentials cleared.');
}

// ===== UI Helpers =====
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

function showFileInfo(fileInfo) {
  const box = document.getElementById('fileInfoBox');
  const content = document.getElementById('fileInfoContent');
  
  content.innerHTML = `
    <dt>📄 File</dt><dd>${fileInfo.fileName}</dd>
    <dt>📊 Size</dt><dd>${formatFileSize(fileInfo.fileSize)}</dd>
    <dt>📎 Type</dt><dd>${fileInfo.mimeType || 'Unknown'}</dd>
  `;
  
  box.classList.remove('hidden');
}

function addToHistory(fileInfo) {
  const list = document.getElementById('historyList');
  const icon = getFileIcon(fileInfo.mimeType, fileInfo.fileName);
  
  // Clear "no downloads" placeholder
  if (list.querySelector('.text-dim')) {
    list.innerHTML = '';
  }
  
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

// ===== Boot =====
document.addEventListener('DOMContentLoaded', init);

// Handle page unload - disconnect gracefully
window.addEventListener('beforeunload', () => {
  if (downloader && isConnected) {
    downloader.disconnect().catch(() => {});
  }
});
