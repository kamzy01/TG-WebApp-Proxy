/**
 * Parse Telegram message links into channel/chat ID and message ID.
 * 
 * Supported formats:
 *   - https://t.me/c/CHANNEL_ID/MESSAGE_ID          (private channel)
 *   - https://t.me/USERNAME/MESSAGE_ID               (public channel/group)
 *   - https://t.me/b/BOT_USERNAME/MESSAGE_ID         (bot channel)
 *   - tg://privatepost?channel=CHANNEL_ID&msg_id=ID  (tg:// protocol)
 */

export function parseTelegramLink(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  url = url.trim();

  // Handle tg:// protocol links
  if (url.startsWith('tg://')) {
    return parseTgProtocol(url);
  }

  // Handle https://t.me/ links
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    
    if (!['t.me', 'telegram.me', 'telegram.dog'].includes(host)) {
      return null;
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    
    // https://t.me/c/CHANNEL_ID/MESSAGE_ID (private channel/supergroup)
    if (pathParts[0] === 'c' && pathParts.length >= 3) {
      const channelId = parseInt(pathParts[1], 10);
      const messageId = parseInt(pathParts[2], 10);
      
      if (isNaN(channelId) || isNaN(messageId)) return null;
      
      return {
        type: 'private',
        channelId: channelId,
        // Convert to full Telegram internal ID: -100 prefix
        fullChannelId: BigInt('-100' + channelId.toString()),
        messageId: messageId,
        originalUrl: url,
      };
    }
    
    // https://t.me/USERNAME/MESSAGE_ID (public channel/group)
    if (pathParts.length >= 2) {
      const username = pathParts[0];
      const messageId = parseInt(pathParts[pathParts.length - 1], 10);
      
      if (isNaN(messageId)) return null;
      
      // Skip known telegram paths
      if (['joinchat', 'addstickers', 'setlanguage', 'share'].includes(username)) {
        return null;
      }
      
      return {
        type: 'public',
        username: username,
        messageId: messageId,
        originalUrl: url,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function parseTgProtocol(url) {
  try {
    // tg://privatepost?channel=CHANNEL_ID&msg_id=MESSAGE_ID
    const match = url.match(/tg:\/\/privatepost\?channel=(\d+)&msg_id=(\d+)/);
    if (match) {
      const channelId = parseInt(match[1], 10);
      const messageId = parseInt(match[2], 10);
      return {
        type: 'private',
        channelId,
        fullChannelId: BigInt('-100' + channelId.toString()),
        messageId,
        originalUrl: url,
      };
    }
    
    // tg://resolve?domain=USERNAME&post=MESSAGE_ID
    const resolveMatch = url.match(/tg:\/\/resolve\?domain=([^&]+)&post=(\d+)/);
    if (resolveMatch) {
      return {
        type: 'public',
        username: resolveMatch[1],
        messageId: parseInt(resolveMatch[2], 10),
        originalUrl: url,
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get a human-readable description of the parsed link
 */
export function describeParsedLink(parsed) {
  if (!parsed) return 'Invalid link';
  
  if (parsed.type === 'private') {
    return `Private Channel (${parsed.channelId}) → Message #${parsed.messageId}`;
  }
  
  return `@${parsed.username} → Message #${parsed.messageId}`;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 2 : 0) + ' ' + units[i];
}

/**
 * Get file type icon emoji based on MIME type or extension
 */
export function getFileIcon(mimeType, fileName) {
  if (!mimeType && !fileName) return '📄';
  
  const mime = (mimeType || '').toLowerCase();
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  
  if (mime.startsWith('video/') || ['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return '🎬';
  if (mime.startsWith('audio/') || ['mp3', 'flac', 'ogg', 'wav', 'aac', 'm4a'].includes(ext)) return '🎵';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return '🖼️';
  if (mime === 'application/pdf' || ext === 'pdf') return '📕';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
  if (mime.includes('text') || ['txt', 'log', 'md', 'csv'].includes(ext)) return '📝';
  if (['exe', 'msi', 'dmg', 'apk'].includes(ext)) return '⚙️';
  if (['srt', 'ass', 'vtt'].includes(ext)) return '💬';
  
  return '📄';
}
