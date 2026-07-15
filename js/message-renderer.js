/**
 * WhatsApp Chat Reader — Message Renderer
 * Creates DOM elements for each message type
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};
  var Utils = WaReader.Utils;

  // SVG icon templates
  var ICONS = {
    singleTick: '<svg viewBox="0 0 16 11"><path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.46.46 0 0 0-.327-.14.458.458 0 0 0-.33.137.535.535 0 0 0 0 .724l2.445 2.543a.443.443 0 0 0 .666-.015l6.588-8.136a.505.505 0 0 0-.156-.73z" fill="currentColor"/></svg>',
    doubleTick: '<svg viewBox="0 0 16 11"><path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.46.46 0 0 0-.327-.14.458.458 0 0 0-.33.137.535.535 0 0 0 0 .724l2.445 2.543a.443.443 0 0 0 .666-.015l6.588-8.136a.505.505 0 0 0-.156-.73z" fill="currentColor"/><path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.249-.656.81 1.514 1.574a.443.443 0 0 0 .666-.015l6.588-8.136a.505.505 0 0 0-.037-.696z" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" fill="currentColor"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" fill="currentColor"/></svg>',
    document: '<svg viewBox="0 0 34 44"><path d="M2 0C.9 0 0 .9 0 2v40c0 1.1.9 2 2 2h30c1.1 0 2-.9 2-2V14L20 0H2z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M20 0v12h14" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 24h18M8 30h18M8 36h10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
    person: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg>',
  };

  var selectedParticipant = '';
  var isGroup = false;
  var mediaBaseUrl = '';
  var lastSender = null;
  var sessionMediaMap = null;

  function configure(options) {
    selectedParticipant = options.selectedParticipant || '';
    isGroup = options.isGroup || false;
    mediaBaseUrl = options.mediaBaseUrl || '';
    sessionMediaMap = options.mediaMap || null;
    lastSender = null;
  }

  function resetSenderTracking() {
    lastSender = null;
  }

  /**
   * Main render function — creates a DOM element for a single item
   */
  function renderMessage(item, index) {
    if (!item) return null;

    var type = item._type || item.type || 'text';

    // Date separator
    if (type === 'date_separator') {
      lastSender = null;
      return createDateSeparator(item);
    }

    // System message
    if (type === 'system') {
      lastSender = null;
      return createSystemMessage(item);
    }

    // Regular message
    return createMessageRow(item, index);
  }

  function createDateSeparator(item) {
    var el = document.createElement('div');
    el.className = 'date-separator';
    el.innerHTML = '<div class="date-pill">' + Utils.sanitizeHTML(item.dateLabel || item.text || '') + '</div>';
    return el;
  }

  function createSystemMessage(item) {
    var el = document.createElement('div');
    el.className = 'system-message';
    var text = item.text || item.body || '';
    el.innerHTML = '<div class="system-bubble">' + Utils.sanitizeHTML(text) + '</div>';
    return el;
  }

  function createMessageRow(item, index) {
    var sender = item.sender || '';
    var isSent = sender === selectedParticipant;
    var direction = isSent ? 'sent' : 'received';

    // Determine if this is a new sender group
    var isNewGroup = (sender !== lastSender);
    lastSender = sender;

    var row = document.createElement('div');
    row.className = 'message-row ' + direction;
    if (isNewGroup) row.classList.add('first-in-group');

    var type = item.type || 'text';

    // Check for special message types
    var isDeleted = item.is_deleted || false;
    var isMediaOmitted = item.media_omitted || false;
    var isLocation = type === 'location';
    var isContact = type === 'contact';
    var isEmojiMsg = type === 'text' && !isDeleted && !isMediaOmitted && Utils.isEmojiOnly(item.text || item.body || '');

    if (isEmojiMsg) {
      row.classList.add('emoji-only');
    }

    if (isDeleted) {
      row.classList.add('deleted-message');
    }

    // Build bubble
    var bubble = document.createElement('div');
    bubble.className = 'message-bubble ' + direction;
    if (isNewGroup) bubble.classList.add('tail');

    // Sender label for group chats (received messages only)
    if (isGroup && !isSent && isNewGroup) {
      var senderLabel = document.createElement('div');
      senderLabel.className = 'sender-label';
      var color = Utils.assignParticipantColor(sender);
      var senderName = document.createElement('span');
      senderName.className = 'sender-name';
      senderName.style.color = color;

      // Parse sender: could be "Name" or "~Name" or "+1 234 567 8901"
      var displayName = sender;
      var displayPhone = '';
      if (item.sender_phone && item.sender_phone !== sender) {
        displayPhone = item.sender_phone;
      }
      senderName.textContent = displayName.replace(/^~/, '');
      senderLabel.appendChild(senderName);

      if (displayPhone) {
        var phone = document.createElement('span');
        phone.className = 'sender-phone';
        phone.textContent = displayPhone;
        senderLabel.appendChild(phone);
      }

      bubble.appendChild(senderLabel);
    }

    // Message body
    if (isDeleted) {
      buildDeletedBody(bubble, item, isSent);
    } else if (isMediaOmitted) {
      buildMediaOmittedBody(bubble, item);
    } else if (isLocation) {
      buildLocationBody(bubble, item);
    } else if (isContact) {
      buildContactBody(bubble, item);
    } else {
      switch (type) {
        case 'image':
          buildImageBody(bubble, item);
          break;
        case 'gif':
          buildGifBody(bubble, item);
          break;
        case 'video':
          buildVideoBody(bubble, item);
          break;
        case 'audio':
          buildAudioBody(bubble, item);
          break;
        case 'audio_note':
        case 'ptt':
          buildAudioNoteBody(bubble, item, isSent);
          break;
        case 'video_note':
          buildVideoNoteBody(bubble, item);
          break;
        case 'document':
          buildDocumentBody(bubble, item);
          break;
        default:
          buildTextBody(bubble, item, isEmojiMsg);
          break;
      }
    }

    // Add message meta (time + ticks)
    var meta = buildMeta(item, isSent);
    bubble.appendChild(meta);

    row.appendChild(bubble);
    return row;
  }

  var currentAudio = null;
  var currentAudioBtn = null;

  function playAudio(src, btnEl) {
    if (!src) return;
    if (currentAudio) {
      currentAudio.pause();
      if (currentAudioBtn) {
        currentAudioBtn.innerHTML = ICONS.play;
      }
      if (currentAudio._src === src) {
        currentAudio = null;
        currentAudioBtn = null;
        return;
      }
    }
    currentAudio = new Audio(src);
    currentAudio._src = src;
    currentAudioBtn = btnEl;
    if (btnEl) btnEl.innerHTML = ICONS.pause;
    currentAudio.play().catch(function (err) {
      console.error('Audio play failed:', err);
      if (btnEl) btnEl.innerHTML = ICONS.play;
    });
    currentAudio.onended = function () {
      if (btnEl) btnEl.innerHTML = ICONS.play;
      currentAudio = null;
      currentAudioBtn = null;
    };
  }

  function buildLinkPreviewCard(bubble, urlStr) {
    try {
      var urlObj = new URL(urlStr);
      var domain = urlObj.hostname.replace(/^www\./i, '').toUpperCase();
      var path = urlObj.pathname !== '/' ? urlObj.pathname : '';
      var title = domain + (path ? ' - ' + path.replace(/[\/\-_]/g, ' ').trim() : '');

      var card = document.createElement('a');
      card.href = urlStr;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.className = 'link-preview-card';

      card.innerHTML = '<div class="link-preview-thumb"><span>🔗</span></div>' +
        '<div class="link-preview-content">' +
          '<div class="link-preview-domain">' + Utils.sanitizeHTML(domain) + '</div>' +
          '<div class="link-preview-title">' + Utils.sanitizeHTML(title) + '</div>' +
          '<div class="link-preview-desc">' + Utils.sanitizeHTML(urlStr) + '</div>' +
        '</div>';

      bubble.appendChild(card);
    } catch (e) {
      // If URL parsing fails, ignore link preview
    }
  }

  function buildTextBody(bubble, item, isEmoji) {
    var text = item.text || item.body || item.content || '';
    var textEl = document.createElement('span');
    textEl.className = 'message-text';

    if (isEmoji) {
      textEl.textContent = text;
    } else {
      textEl.innerHTML = Utils.linkify(Utils.sanitizeHTML(text));
      // Check for URL to build rich Link Preview card
      var urlMatch = text.match(/(https?:\/\/[^\s()<>"]+|www\.[^\s()<>"]+)/i);
      if (urlMatch) {
        var previewUrl = urlMatch[0].startsWith('http') ? urlMatch[0] : 'https://' + urlMatch[0];
        buildLinkPreviewCard(bubble, previewUrl);
      }
    }
    bubble.appendChild(textEl);
  }

  function buildDeletedBody(bubble, item, isSent) {
    var textEl = document.createElement('span');
    textEl.className = 'message-text';
    textEl.innerHTML = '<span class="delete-icon">🚫</span>' +
      (isSent ? 'You deleted this message' : 'This message was deleted');
    bubble.appendChild(textEl);
  }

  function buildMediaOmittedBody(bubble, item) {
    var wrap = document.createElement('div');
    wrap.className = 'media-omitted';
    wrap.innerHTML = '<span class="media-omitted-icon">📎</span><span class="message-text">' +
      Utils.sanitizeHTML(item.text || item.content || 'Media omitted') + '</span>';
    bubble.appendChild(wrap);
  }

  function buildLocationBody(bubble, item) {
    var wrap = document.createElement('div');
    wrap.className = 'media-location';
    var text = item.text || item.body || item.content || 'Location shared';
    var lat = item.latitude || '';
    var lng = item.longitude || '';
    var url = item.url || (lat && lng ? 'https://maps.google.com/?q=' + lat + ',' + lng : '#');

    wrap.innerHTML = '<span>📍</span><a href="' + Utils.sanitizeHTML(url) +
      '" target="_blank" rel="noopener noreferrer">' + Utils.sanitizeHTML(text) + '</a>';
    bubble.appendChild(wrap);
  }

  function buildContactBody(bubble, item) {
    var wrap = document.createElement('div');
    wrap.className = 'media-contact';
    var name = item.contact_name || item.text || item.content || 'Contact';
    wrap.innerHTML = '<div class="contact-avatar-small">' + ICONS.person + '</div>' +
      '<span class="contact-name">' + Utils.sanitizeHTML(name) + '</span>';
    bubble.appendChild(wrap);
  }

  function buildImageBody(bubble, item) {
    var container = document.createElement('div');
    container.className = 'media-image-container';

    var img = document.createElement('img');
    img.className = 'media-image';
    img.loading = 'lazy';

    var filename = item.mediaFile || item.media_file || item.file;
    var src = resolveMediaUrl(filename);
    if (src) {
      img.src = src;
      img.alt = item.caption || item.text || 'Image';
      img.onerror = function () {
        img.style.display = 'none';
        container.innerHTML = '<div class="media-omitted"><span class="media-omitted-icon">🖼️</span><span>Image unavailable (' + Utils.sanitizeHTML(filename || '') + ')</span></div>';
      };
    } else {
      container.innerHTML = '<div class="media-omitted"><span class="media-omitted-icon">🖼️</span><span>Image</span></div>';
    }

    container.appendChild(img);
    bubble.appendChild(container);

    // Caption
    if (item.caption || item.text || (item.content && item.content !== filename)) {
      var caption = document.createElement('span');
      caption.className = 'message-text';
      var capText = item.caption || item.text || item.content || '';
      caption.innerHTML = Utils.linkify(Utils.sanitizeHTML(capText));
      bubble.appendChild(caption);
    }

    // Click to open in media viewer
    container.addEventListener('click', function () {
      if (WaReader.MediaViewer && src) {
        WaReader.MediaViewer.open(src, 'image');
      }
    });
  }

  function buildGifBody(bubble, item) {
    var container = document.createElement('div');
    container.className = 'media-gif-container';

    var filename = item.mediaFile || item.media_file || item.file;
    var src = resolveMediaUrl(filename);
    if (src) {
      var img = document.createElement('img');
      img.className = 'media-gif';
      img.loading = 'lazy';
      img.src = src;
      img.alt = 'GIF';
      container.appendChild(img);

      var badge = document.createElement('span');
      badge.className = 'gif-badge';
      badge.textContent = 'GIF';
      container.appendChild(badge);
    } else {
      container.innerHTML = '<div class="media-omitted"><span class="media-omitted-icon">🎞️</span><span>GIF</span></div>';
    }

    bubble.appendChild(container);

    if (item.caption || item.text) {
      var caption = document.createElement('span');
      caption.className = 'message-text';
      caption.innerHTML = Utils.linkify(Utils.sanitizeHTML(item.caption || item.text || ''));
      bubble.appendChild(caption);
    }

    container.addEventListener('click', function () {
      if (WaReader.MediaViewer && src) {
        WaReader.MediaViewer.open(src, 'image');
      }
    });
  }

  function buildVideoBody(bubble, item) {
    var container = document.createElement('div');
    container.className = 'media-video-container';

    var filename = item.mediaFile || item.media_file || item.file;
    var src = resolveMediaUrl(filename);
    var thumbnail = resolveMediaUrl(item.thumbnail || filename);

    if (thumbnail) {
      var img = document.createElement('img');
      img.className = 'media-image';
      img.loading = 'lazy';
      img.src = thumbnail;
      img.alt = 'Video';
      img.onerror = function() {
        img.style.display = 'none';
      };
      container.appendChild(img);
    }

    // Play overlay
    var overlay = document.createElement('div');
    overlay.className = 'video-play-overlay';
    overlay.innerHTML = ICONS.play;
    container.appendChild(overlay);

    // Duration
    if (item.duration) {
      var dur = document.createElement('span');
      dur.className = 'video-duration-badge';
      dur.textContent = formatDuration(item.duration);
      container.appendChild(dur);
    }

    bubble.appendChild(container);

    if (item.caption || item.text || (item.content && item.content !== filename)) {
      var caption = document.createElement('span');
      caption.className = 'message-text';
      var capText = item.caption || item.text || item.content || '';
      caption.innerHTML = Utils.linkify(Utils.sanitizeHTML(capText));
      bubble.appendChild(caption);
    }

    container.addEventListener('click', function () {
      if (WaReader.MediaViewer && src) {
        WaReader.MediaViewer.open(src, 'video');
      }
    });
  }

  function buildAudioBody(bubble, item) {
    var wrap = document.createElement('div');
    wrap.className = 'media-audio';

    var filename = item.mediaFile || item.media_file || item.file;
    var src = resolveMediaUrl(filename);

    var playBtn = document.createElement('button');
    playBtn.className = 'audio-play-btn';
    playBtn.innerHTML = ICONS.play;
    wrap.appendChild(playBtn);

    playBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      playAudio(src, playBtn);
    });

    // Waveform
    var waveform = document.createElement('div');
    waveform.className = 'audio-waveform';
    var bars = generateWaveformBars(28);
    for (var i = 0; i < bars.length; i++) {
      var bar = document.createElement('div');
      bar.className = 'audio-waveform-bar';
      bar.style.height = bars[i] + 'px';
      waveform.appendChild(bar);
    }
    wrap.appendChild(waveform);

    var dur = document.createElement('span');
    dur.className = 'audio-duration';
    dur.textContent = item.duration ? formatDuration(item.duration) : '0:00';
    wrap.appendChild(dur);

    bubble.appendChild(wrap);
  }

  function buildAudioNoteBody(bubble, item, isSent) {
    var wrap = document.createElement('div');
    wrap.className = 'media-audio-note';

    var filename = item.mediaFile || item.media_file || item.file;
    var src = resolveMediaUrl(filename);

    // PTT avatar
    var avatar = document.createElement('div');
    avatar.className = 'ptt-avatar';
    avatar.innerHTML = ICONS.mic;
    var playOverlay = document.createElement('div');
    playOverlay.className = 'ptt-play-btn';
    playOverlay.innerHTML = ICONS.play;
    avatar.appendChild(playOverlay);
    wrap.appendChild(avatar);

    avatar.addEventListener('click', function (e) {
      e.stopPropagation();
      playAudio(src, playOverlay);
    });

    // Waveform
    var waveform = document.createElement('div');
    waveform.className = 'ptt-waveform';
    var bars = generateWaveformBars(35);
    for (var i = 0; i < bars.length; i++) {
      var bar = document.createElement('div');
      bar.className = 'ptt-waveform-bar';
      bar.style.height = bars[i] + 'px';
      waveform.appendChild(bar);
    }
    wrap.appendChild(waveform);

    var dur = document.createElement('span');
    dur.className = 'audio-duration';
    dur.textContent = item.duration ? formatDuration(item.duration) : '0:00';
    wrap.appendChild(dur);

    bubble.appendChild(wrap);
  }

  function buildVideoNoteBody(bubble, item) {
    var container = document.createElement('div');
    container.className = 'media-video-note';

    var filename = item.mediaFile || item.media_file || item.file;
    var src = resolveMediaUrl(filename);
    var thumbnail = resolveMediaUrl(item.thumbnail || filename);

    if (thumbnail) {
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.src = thumbnail;
      img.alt = 'Video note';
      img.onerror = function() { img.style.display = 'none'; };
      container.appendChild(img);
    }

    var overlay = document.createElement('div');
    overlay.className = 'video-play-overlay';
    overlay.innerHTML = ICONS.play;
    container.appendChild(overlay);

    bubble.appendChild(container);

    container.addEventListener('click', function () {
      if (WaReader.MediaViewer && src) {
        WaReader.MediaViewer.open(src, 'video');
      }
    });
  }

  function buildDocumentBody(bubble, item) {
    var wrap = document.createElement('div');
    wrap.className = 'media-document';

    var filename = item.mediaFile || item.media_file || item.file;
    var src = resolveMediaUrl(filename);

    var iconDiv = document.createElement('div');
    iconDiv.className = 'document-icon';
    iconDiv.innerHTML = ICONS.document;
    wrap.appendChild(iconDiv);

    var info = document.createElement('div');
    info.className = 'document-info';

    var name = document.createElement('div');
    name.className = 'document-name';
    name.textContent = item.file_name || filename || 'Document';
    info.appendChild(name);

    var details = document.createElement('div');
    details.className = 'document-details';
    var detailParts = [];
    if (item.file_size) detailParts.push(Utils.formatFileSize(item.file_size));
    if (item.file_type) detailParts.push(item.file_type.toUpperCase());
    details.textContent = detailParts.join(' · ') || 'Document';
    info.appendChild(details);

    wrap.appendChild(info);
    bubble.appendChild(wrap);

    if (item.caption || item.text) {
      var caption = document.createElement('span');
      caption.className = 'message-text';
      caption.innerHTML = Utils.linkify(Utils.sanitizeHTML(item.caption || item.text || ''));
      bubble.appendChild(caption);
    }

    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', function () {
      if (src) window.open(src, '_blank');
    });
  }

  function buildMeta(item, isSent) {
    var meta = document.createElement('span');
    meta.className = 'message-meta';

    var time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = Utils.formatTime(item.timestamp || item.datetime);
    meta.appendChild(time);

    if (isSent) {
      var ticks = document.createElement('span');
      ticks.className = 'message-ticks';
      ticks.style.color = 'var(--tick-read)';
      ticks.innerHTML = ICONS.doubleTick;
      meta.appendChild(ticks);
    }

    return meta;
  }

  function resolveMediaUrl(filename) {
    if (!filename) return '';

    // Already a full URL or blob URL — use as-is
    if (filename.startsWith('http://') || filename.startsWith('https://') ||
        filename.startsWith('data:') || filename.startsWith('blob:')) {
      return filename;
    }

    var basename = filename.split('/').pop().split('\\').pop();

    // 1. Check local offline IndexedDB blob object URL — try exact, basename, decoded, encoded, and lowercase
    if (sessionMediaMap) {
      var candidates = [
        filename,
        basename,
        filename.toLowerCase(),
        basename.toLowerCase()
      ];
      try { candidates.push(decodeURIComponent(filename)); } catch(e) {}
      try { candidates.push(decodeURIComponent(basename)); } catch(e) {}
      try { candidates.push(encodeURIComponent(filename)); } catch(e) {}
      try { candidates.push(encodeURIComponent(basename)); } catch(e) {}

      for (var c = 0; c < candidates.length; c++) {
        if (candidates[c] && sessionMediaMap[candidates[c]]) {
          return sessionMediaMap[candidates[c]];
        }
      }

      // Case-insensitive fallback across all stored keys
      var lc = filename.toLowerCase();
      var lcBase = basename.toLowerCase();
      var keys = Object.keys(sessionMediaMap);
      for (var k = 0; k < keys.length; k++) {
        var kl = keys[k].toLowerCase();
        if (kl === lc || kl === lcBase) return sessionMediaMap[keys[k]];
      }
    }

    // 2. Fall back to server URL (server may be running, or files may not have been purged yet)
    var encodedName = encodeURIComponent(basename);
    var base = mediaBaseUrl || '';
    if (base && !base.startsWith('http://') && !base.startsWith('https://') &&
        window.WaReader && window.WaReader.CONFIG && window.WaReader.CONFIG.API_BASE_URL) {
      base = window.WaReader.CONFIG.API_BASE_URL.replace(/\/$/, '') + '/' + base.replace(/^\//, '');
    }
    if (base) {
      return base.replace(/\/$/, '') + '/' + encodedName;
    }
    return '';
  }

  function generateWaveformBars(count) {
    var bars = [];
    for (var i = 0; i < count; i++) {
      bars.push(4 + Math.floor(Math.random() * 20));
    }
    return bars;
  }

  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '0:00';
    var s = Math.floor(seconds);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // Export
  WaReader.MessageRenderer = {
    configure: configure,
    renderMessage: renderMessage,
    resetSenderTracking: resetSenderTracking,
  };
})();
