/**
 * Telegram MTProto Client wrapper using GramJS.
 * Runs entirely in the browser - connections via WebSocket.
 * Authenticates as a bot using bot token.
 * Downloads files with NO size limit (unlike Bot API's 20MB cap).
 */

// polyfills.js must be imported before this file
import { TelegramClient, Api } from 'telegram';

const CREDENTIALS_KEY = 'tg_credentials';

export class TGDownloader {
  constructor(onLog, onProgress) {
    this.client = null;
    this.onLog = onLog || (() => {});
    this.onProgress = onProgress || (() => {});
    this.connected = false;
  }

  /**
   * Connect to Telegram using bot token via MTProto.
   * Requires API ID & Hash from https://my.telegram.org
   */
  async connect(apiId, apiHash, botToken) {
    try {
      this.onLog('info', 'Initializing MTProto connection...');
      
      // Pass string to TelegramClient - it creates StoreSession internally
      this.client = new TelegramClient('tg_bot', parseInt(apiId), apiHash, {
        connectionRetries: 5,
        useWSS: true, // WebSocket Secure for browser
      });

      this.onLog('info', 'Connecting to Telegram servers...');
      
      await this.client.start({
        botAuthToken: botToken,
      });

      // Save credentials for auto-fill on next visit
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ apiId, apiHash, botToken }));
      
      this.connected = true;
      
      // Get bot info
      const me = await this.client.getMe();
      this.onLog('success', `Connected as @${me.username} (${me.firstName})`);
      this.onLog('dim', `Session saved in localStorage. Will reconnect faster next time.`);
      
      return { success: true, botInfo: me };
    } catch (error) {
      this.connected = false;
      this.onLog('error', `Connection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Disconnect the client
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {}
      this.client = null;
      this.connected = false;
      this.onLog('info', 'Disconnected from Telegram.');
    }
  }

  /**
   * Try to restore a saved session
   */
  getSavedCredentials() {
    try {
      const saved = localStorage.getItem(CREDENTIALS_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  /**
   * Clear all saved session data
   */
  clearSession() {
    localStorage.removeItem(CREDENTIALS_KEY);
    // Clear StoreSession keys
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tg_bot:')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }

  /**
   * Fetch a message from a chat/channel by its ID.
   * Works for both public usernames and private channel IDs.
   */
  async getMessage(chatIdentifier, messageId) {
    if (!this.client || !this.connected) {
      throw new Error('Not connected. Please connect first.');
    }

    this.onLog('info', `Fetching message #${messageId}...`);

    let entity;
    
    if (typeof chatIdentifier === 'string' && !chatIdentifier.startsWith('-')) {
      // Public username
      this.onLog('dim', `Resolving @${chatIdentifier}...`);
      entity = await this.client.getEntity(chatIdentifier);
    } else {
      // Private channel ID (e.g., -1002113604672)
      const id = typeof chatIdentifier === 'bigint' ? chatIdentifier : BigInt(chatIdentifier);
      this.onLog('dim', `Resolving channel ID ${id}...`);
      entity = await this.client.getEntity(id);
    }

    const result = await this.client.getMessages(entity, { ids: [messageId] });
    
    if (!result || result.length === 0 || !result[0]) {
      throw new Error(`Message #${messageId} not found. Make sure the bot has access to this chat.`);
    }

    const message = result[0];
    this.onLog('success', `Message found!`);
    
    return { message, entity };
  }

  /**
   * Extract file info from a message
   */
  getFileInfo(message) {
    const media = message.media;
    if (!media) {
      return null;
    }

    let fileName = 'unknown';
    let fileSize = 0;
    let mimeType = '';

    // Document (most files - includes video, audio, etc.)
    if (media.document) {
      const doc = media.document;
      fileSize = Number(doc.size);
      mimeType = doc.mimeType || '';
      
      // Get filename from attributes
      for (const attr of doc.attributes || []) {
        if (attr.className === 'DocumentAttributeFilename') {
          fileName = attr.fileName;
        }
      }
      
      if (fileName === 'unknown' && mimeType) {
        const ext = mimeType.split('/')[1] || 'bin';
        fileName = `file_${message.id}.${ext}`;
      }
    }
    // Photo
    else if (media.photo) {
      fileName = `photo_${message.id}.jpg`;
      mimeType = 'image/jpeg';
      const sizes = media.photo.sizes || [];
      const largest = sizes[sizes.length - 1];
      if (largest && largest.size) {
        fileSize = Number(largest.size);
      }
    }

    return {
      fileName,
      fileSize,
      mimeType,
      hasMedia: true,
    };
  }

  /**
   * Download file from a message with progress tracking.
   * Uses GramJS's internal chunked download (512KB chunks via MTProto).
   * 
   * NOTE on parallel downloads:
   * True multi-connection parallel downloads (like IDM/1DM) are NOT possible here because:
   * 1. Telegram MTProto doesn't support HTTP-style range requests
   * 2. GramJS downloads sequentially through a single DC sender connection
   * 3. Creating multiple TelegramClient instances could trigger flood waits
   * 
   * GramJS already uses optimal 512KB chunks and auto-retries.
   * Telegram server-side is the speed bottleneck, not the client.
   */
  async downloadFile(message) {
    if (!this.client || !this.connected) {
      throw new Error('Not connected. Please connect first.');
    }

    const fileInfo = this.getFileInfo(message);
    if (!fileInfo) {
      throw new Error('This message does not contain any downloadable media.');
    }

    this.onLog('info', `Downloading: ${fileInfo.fileName} (${this._formatSize(fileInfo.fileSize)})`);

    const startTime = Date.now();
    let lastUpdate = 0;

    const buffer = await this.client.downloadMedia(message, {
      progressCallback: (downloaded, total) => {
        const now = Date.now();
        if (now - lastUpdate < 200 && downloaded < total) return;
        lastUpdate = now;
        
        const elapsed = (now - startTime) / 1000;
        const speed = Number(downloaded) / (elapsed || 1);
        const percent = Number(total) > 0 ? (Number(downloaded) / Number(total)) * 100 : 0;
        const remaining = speed > 0 ? (Number(total) - Number(downloaded)) / speed : 0;
        
        this.onProgress({
          downloaded: Number(downloaded),
          total: Number(total),
          percent: Math.min(percent, 100),
          speed,
          elapsed,
          remaining,
        });
      },
    });

    if (!buffer) throw new Error('Download returned empty data.');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgSpeed = this._formatSize(fileInfo.fileSize / (parseFloat(elapsed) || 1));
    this.onLog('success', `Download complete! (${elapsed}s, avg ${avgSpeed}/s)`);

    const blob = new Blob([buffer], { type: fileInfo.mimeType || 'application/octet-stream' });
    return { blob, fileInfo };
  }

  /**
   * Trigger a browser "Save As" dialog for a blob
   */
  saveBlobAs(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Revoke after a delay to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    
    this.onLog('success', `💾 File saved: ${fileName}`);
  }

  /**
   * Get a direct HTTP download URL via Bot API (for download managers like 1DM).
   * Only works for files under 20MB (Telegram Bot API limit).
   */
  async getDirectHttpLink(message, botToken) {
    const fileInfo = this.getFileInfo(message);
    if (!fileInfo) throw new Error('No media in this message.');

    // Use Bot API getFile to get file_path
    // We need the file_id which we can get from the message
    const media = message.media;
    let fileId;

    if (media.document) {
      // GramJS stores file reference info, but for Bot API we need the bot API file_id
      // We'll use the Bot API directly via HTTP
      this.onLog('info', 'Fetching Bot API file info...');
      
      // Forward approach: use the bot token to call getFile via Bot API
      // But we need the Bot API file_id, not the MTProto one
      // The workaround: use MTProto to get the message, then use Bot API
    }

    // Alternative: use the Telegram Bot API directly
    // First call getUpdates or use the chat_id + message_id
    const chatId = message.peerId?.channelId 
      ? `-100${message.peerId.channelId}` 
      : message.peerId?.chatId 
        ? `-${message.peerId.chatId}` 
        : message.peerId?.userId?.toString();

    if (!chatId) throw new Error('Could not determine chat ID for Bot API.');

    // Copy message to get Bot API file_id  
    const apiUrl = `https://api.telegram.org/bot${botToken}`;
    
    // Forward the message to self to get file_id via Bot API
    // Actually, we can use copyMessage or just try to get the file directly
    // Simplest: use /getChat + /forwardMessage to self, but bots can't message themselves
    
    // Better approach: just provide the file via our own blob URL
    this.onLog('warn', '⚠️ Direct HTTP links require Bot API (limited to 20MB files).');
    this.onLog('info', 'For files > 20MB, use the built-in browser download instead.');
    
    return null;
  }

  _formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
  }
}
