/**
 * IndexedDB persistence layer for messages, files, and chats.
 * Survives page refreshes. Data tied to the bot session.
 */

const DB_NAME = 'tgcf_dl';
const DB_VERSION = 1;

let db = null;

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Incoming messages (text + media)
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('date', 'date', { unique: false });
      }

      // Incoming files (media only, with download state)
      if (!db.objectStoreNames.contains('files')) {
        const fileStore = db.createObjectStore('files', { keyPath: 'id' });
        fileStore.createIndex('date', 'date', { unique: false });
      }

      // Chat conversations (for reply history)
      if (!db.objectStoreNames.contains('chats')) {
        const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// ===== Messages =====

export async function saveMessage(msgData) {
  if (!db) return;
  const tx = db.transaction('messages', 'readwrite');
  // Store only serializable data (no GramJS objects)
  const serializable = {
    id: msgData.id,
    text: msgData.text || '',
    senderType: msgData.senderType,
    senderName: msgData.senderName,
    senderId: msgData.senderId,
    hasMedia: msgData.hasMedia,
    date: msgData.date instanceof Date ? msgData.date.toISOString() : msgData.date,
    // Store peer info for replies
    chatPeerType: msgData.chatPeer?.channelId ? 'channel' : msgData.chatPeer?.chatId ? 'chat' : 'user',
    chatPeerId: msgData.chatPeer?.channelId?.toString() || msgData.chatPeer?.chatId?.toString() || msgData.chatPeer?.userId?.toString() || '',
  };
  tx.objectStore('messages').put(serializable);
  return tx.complete;
}

export async function getAllMessages(limit = 100) {
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result || [];
      // Sort by date descending, limit
      results.sort((a, b) => new Date(b.date) - new Date(a.date));
      resolve(results.slice(0, limit));
    };
    request.onerror = () => resolve([]);
  });
}

// ===== Files =====

export async function saveFile(fileData) {
  if (!db) return;
  const tx = db.transaction('files', 'readwrite');
  const serializable = {
    id: `file_${fileData.messageId || fileData.id || Date.now()}`,
    fileName: fileData.fileName,
    fileSize: fileData.fileSize,
    mimeType: fileData.mimeType,
    chatName: fileData.chatName || '',
    dcId: fileData.dcId,
    date: fileData.date instanceof Date ? fileData.date.toISOString() : (fileData.date || new Date().toISOString()),
    downloaded: false,
  };
  tx.objectStore('files').put(serializable);
  return tx.complete;
}

export async function getAllFiles(limit = 100) {
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction('files', 'readonly');
    const store = tx.objectStore('files');
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result || [];
      results.sort((a, b) => new Date(b.date) - new Date(a.date));
      resolve(results.slice(0, limit));
    };
    request.onerror = () => resolve([]);
  });
}

export async function markFileDownloaded(id) {
  if (!db) return;
  const tx = db.transaction('files', 'readwrite');
  const store = tx.objectStore('files');
  const request = store.get(id);
  request.onsuccess = () => {
    const file = request.result;
    if (file) {
      file.downloaded = true;
      store.put(file);
    }
  };
}

// ===== Chats (reply history) =====

export async function saveChat(chatId, messages) {
  if (!db) return;
  const tx = db.transaction('chats', 'readwrite');
  tx.objectStore('chats').put({ id: chatId, messages, updatedAt: new Date().toISOString() });
  return tx.complete;
}

export async function getChat(chatId) {
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction('chats', 'readonly');
    const request = tx.objectStore('chats').get(chatId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

// ===== Clear all =====

export async function clearAllData() {
  if (!db) return;
  const tx = db.transaction(['messages', 'files', 'chats'], 'readwrite');
  tx.objectStore('messages').clear();
  tx.objectStore('files').clear();
  tx.objectStore('chats').clear();
}
