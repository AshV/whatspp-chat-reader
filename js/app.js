/**
 * WhatsApp Chat Reader — Main Application Controller
 * Orchestrates all screens, state transitions, and module initialization
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};
  var CONFIG = WaReader.CONFIG;
  var Utils = WaReader.Utils;
  var Store = WaReader.Store;
  var ApiClient = WaReader.ApiClient;
  var ChatList = WaReader.ChatList;
  var VirtualScroll = WaReader.VirtualScroll;
  var MessageRenderer = WaReader.MessageRenderer;
  var MediaViewer = WaReader.MediaViewer;
  var Search = WaReader.Search;

  // State
  var currentScreen = 'chat-list';
  var currentSessionId = null;
  var currentVirtualScroll = null;
  var pendingApiData = null;
  var screens = {};

  // ---- Initialization ----

  function init() {
    // Cache screen elements
    var screenIds = ['chat-list-screen', 'upload-screen', 'loading-screen', 'participant-screen', 'chat-screen', 'error-screen'];
    for (var i = 0; i < screenIds.length; i++) {
      var el = document.getElementById(screenIds[i]);
      if (el) screens[screenIds[i].replace('-screen', '')] = el;
    }

    // Apply saved theme
    var settings = Store.getSettings();
    applyTheme(settings.theme || 'light');

    // Initialize Store's IndexedDB
    Store.initDB().catch(function (e) {
      console.error('Failed to init IndexedDB:', e);
    });

    // Initialize ChatList
    ChatList.init({
      onChatSelect: openChat,
      onDeleteChat: function () { /* re-render handled by ChatList */ },
      onChangeParticipant: function (sessionId) {
        openParticipantScreen(sessionId);
      },
    });

    // Initialize Search
    Search.init({});

    // Bind UI events
    bindEvents();

    // Show initial screen
    showScreen('chat-list');
    ChatList.render();

    // Register service worker
    registerServiceWorker();

    // Periodic server cleanup ping: ensures any sessions older than 60s
    // on the backend are wiped cleanly even if a UI crashed earlier
    function pingServerCleanup() {
      var apiBase = (window.WaReader && window.WaReader.CONFIG && window.WaReader.CONFIG.API_BASE_URL)
        ? window.WaReader.CONFIG.API_BASE_URL.replace(/\/$/, '')
        : '';
      if (!apiBase) return;
      fetch(apiBase + '/health', { method: 'GET', keepalive: true }).catch(function () {});
    }
    pingServerCleanup();
    setInterval(pingServerCleanup, 30000);
  }

  // ---- Screen Management ----

  function showScreen(name) {
    var keys = Object.keys(screens);
    for (var i = 0; i < keys.length; i++) {
      var screenEl = screens[keys[i]];
      if (keys[i] === name) {
        screenEl.classList.add('active');
      } else {
        screenEl.classList.remove('active');
      }
    }

    currentScreen = name;

    // Manage history
    var state = { screen: name, sessionId: currentSessionId };
    if (name === 'chat') {
      history.pushState(state, '', '#chat/' + (currentSessionId || ''));
    } else if (name === 'upload') {
      history.pushState(state, '', '#upload');
    } else if (name === 'participant') {
      history.pushState(state, '', '#participant');
    } else {
      history.replaceState(state, '', '#');
    }
  }

  // ---- Event Binding ----

  function bindEvents() {
    // FAB - open upload
    var fab = document.getElementById('fab-add-chat');
    if (fab) {
      fab.addEventListener('click', function () {
        showScreen('upload');
        resetUploadScreen();
      });
    }

    // Upload back button
    var uploadBack = document.getElementById('upload-back-btn');
    if (uploadBack) {
      uploadBack.addEventListener('click', function () {
        showScreen('chat-list');
      });
    }

    // File input
    var fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) {
          handleFileUpload(e.target.files[0]);
        }
      });
    }

    // Drag and drop
    var uploadZone = document.getElementById('upload-zone');
    if (uploadZone) {
      uploadZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add('drag-over');
      });

      uploadZone.addEventListener('dragleave', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('drag-over');
      });

      uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFileUpload(e.dataTransfer.files[0]);
        }
      });

      uploadZone.addEventListener('click', function () {
        if (fileInput) fileInput.click();
      });
    }

    // Chat header back button
    var chatBack = document.getElementById('chat-back-btn');
    if (chatBack) {
      chatBack.addEventListener('click', function () {
        closeChatView();
        showScreen('chat-list');
        ChatList.render();
      });
    }

    // Chat search button
    var chatSearchBtn = document.getElementById('chat-search-btn');
    if (chatSearchBtn) {
      chatSearchBtn.addEventListener('click', function () {
        Search.open();
      });
    }

    // Chat search close
    var searchCloseBtn = document.getElementById('search-close-btn');
    if (searchCloseBtn) {
      searchCloseBtn.addEventListener('click', function () {
        Search.close();
      });
    }

    // Chat top bar delete button
    var chatDeleteTopBtn = document.getElementById('chat-delete-top-btn');
    if (chatDeleteTopBtn) {
      chatDeleteTopBtn.addEventListener('click', function () {
        if (currentSessionId) {
          var session = Store.getSessionById(currentSessionId);
          var name = session ? session.name : 'this chat';
          if (confirm('Are you sure you want to delete "' + name + '"? This action cannot be undone.')) {
            Store.deleteChatSession(currentSessionId).then(function () {
              closeChatView();
              showScreen('chat-list');
              ChatList.render();
            });
          }
        }
      });
    }

    // Rename chat header
    var chatRenameBtn = document.getElementById('chat-rename-btn');
    if (chatRenameBtn) {
      chatRenameBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        promptRenameChat();
      });
    }
    var chatHeaderInfoBox = document.getElementById('chat-header-info-box');
    if (chatHeaderInfoBox) {
      chatHeaderInfoBox.addEventListener('click', function () {
        promptRenameChat();
      });
    }

    // Change perspective (who are you?)
    var changeParticipantBtn = document.getElementById('chat-change-participant-btn');
    if (changeParticipantBtn) {
      changeParticipantBtn.addEventListener('click', function () {
        if (currentSessionId) {
          openParticipantScreen(currentSessionId);
        }
      });
    }

    // Theme toggles (Top right of home and top right of chat)
    function handleThemeToggleClick() {
      var settings = Store.getSettings();
      var newTheme = settings.theme === 'dark' ? 'light' : 'dark';
      settings.theme = newTheme;
      Store.saveSettings(settings);
      applyTheme(newTheme);
    }

    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', handleThemeToggleClick);
    }
    var chatThemeToggle = document.getElementById('chat-theme-toggle');
    if (chatThemeToggle) {
      chatThemeToggle.addEventListener('click', handleThemeToggleClick);
    }

    // Scroll to bottom button
    var scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    if (scrollBottomBtn) {
      scrollBottomBtn.addEventListener('click', function () {
        if (currentVirtualScroll) {
          currentVirtualScroll.scrollToBottom(true);
        }
      });
    }

    // Participant screen back
    var participantBack = document.getElementById('participant-back-btn');
    if (participantBack) {
      participantBack.addEventListener('click', function () {
        showScreen('chat-list');
        ChatList.render();
      });
    }

    // Error retry
    var retryBtn = document.getElementById('error-retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        showScreen('upload');
        resetUploadScreen();
      });
    }

    // Browser back button
    window.addEventListener('popstate', function (e) {
      if (MediaViewer.isOpen()) {
        MediaViewer.close();
        return;
      }
      if (Search.isActive()) {
        Search.close();
        return;
      }
      if (currentScreen === 'chat') {
        closeChatView();
        showScreen('chat-list');
        ChatList.render();
      } else if (currentScreen === 'upload' || currentScreen === 'participant' || currentScreen === 'error') {
        showScreen('chat-list');
        ChatList.render();
      }
    });
  }

  // ---- File Upload ----

  function handleFileUpload(file) {
    showScreen('loading');
    updateLoadingText('Processing your chat...');

    var uploadProgressWrap = document.getElementById('upload-progress-wrap');
    var loadingProgressWrap = document.getElementById('loading-progress-wrap');

    if (uploadProgressWrap) uploadProgressWrap.classList.remove('active');
    if (loadingProgressWrap) loadingProgressWrap.style.display = 'none';

    ApiClient.uploadChat(file, function (percent) {
      // Only show processing animation as requested
      updateLoadingText('Processing your chat...');
    }).then(function (response) {
      if (response.success && response.data) {
        pendingApiData = response.data;
        showParticipantSelection(response.data);
      } else {
        showError({
          title: (response.error && response.error.message) || 'Parse failed',
          message: (response.error && response.error.details && response.error.details.hint) || 'The file could not be parsed.',
          hint: 'Make sure you exported the chat correctly from WhatsApp.',
        });
      }
    }).catch(function (err) {
      showError({
        title: err.title || 'Upload failed',
        message: err.message || 'An unknown error occurred.',
        hint: err.hint || 'Please try again.',
      });
    });
  }

  function resetUploadScreen() {
    var fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
    var uploadProgressBar = document.getElementById('upload-progress-fill');
    var loadingProgressBar = document.getElementById('loading-progress-fill');
    if (uploadProgressBar) uploadProgressBar.style.width = '0%';
    if (loadingProgressBar) loadingProgressBar.style.width = '0%';
    var uploadProgressWrap = document.getElementById('upload-progress-wrap');
    if (uploadProgressWrap) uploadProgressWrap.classList.remove('active');
    var loadingProgressWrap = document.getElementById('loading-progress-wrap');
    if (loadingProgressWrap) loadingProgressWrap.style.display = 'none';
    var uploadZone = document.getElementById('upload-zone');
    if (uploadZone) uploadZone.classList.remove('drag-over');
  }

  function updateLoadingText(text) {
    var el = document.getElementById('loading-text');
    if (el) el.textContent = text;
  }

  // ---- Participant Selection ----

  function showParticipantSelection(apiData, existingSessionId) {
    var container = document.getElementById('participant-grid');
    if (!container) return;

    var participants = apiData.metadata.participants || [];
    var html = '';

    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      var displayName = p.name || p.phone || 'Unknown';
      var displayPhone = p.phone && p.name ? p.phone : '';
      var initials = Utils.getInitials(displayName);
      var color = Utils.assignParticipantColor(displayName);

      html +=
        '<div class="participant-card" data-name="' + Utils.sanitizeHTML(displayName) + '" data-phone="' + Utils.sanitizeHTML(displayPhone) + '">' +
          '<div class="participant-avatar" style="background-color:' + color + '">' + Utils.sanitizeHTML(initials) + '</div>' +
          '<div class="participant-info">' +
            '<div class="participant-name">' + Utils.sanitizeHTML(displayName) + '</div>' +
            (displayPhone ? '<div class="participant-phone">' + Utils.sanitizeHTML(displayPhone) + '</div>' : '') +
            '<div class="participant-count">' + (p.messageCount || 0) + ' messages</div>' +
          '</div>' +
        '</div>';
    }

    container.innerHTML = html;

    // Bind click handlers
    var cards = container.querySelectorAll('.participant-card');
    for (var j = 0; j < cards.length; j++) {
      (function (card) {
        card.addEventListener('click', function () {
          var name = card.getAttribute('data-name');

          // Handle existing session update
          if (existingSessionId) {
            Store.updateSessionParticipant(existingSessionId, name);
            openChat(existingSessionId);
            return;
          }

          // New session
          if (pendingApiData) {
            saveNewSession(pendingApiData, name);
          }
        });
      })(cards[j]);
    }

    showScreen('participant');
  }

  function openParticipantScreen(sessionId) {
    var session = Store.getSessionById(sessionId);
    if (!session) return;

    var container = document.getElementById('participant-grid');
    if (!container) return;

    var participants = session.participants || [];
    var html = '';

    for (var i = 0; i < participants.length; i++) {
      var p = participants[i];
      var displayName = p.name || p.phone || 'Unknown';
      var displayPhone = p.phone && p.name ? p.phone : '';
      var initials = Utils.getInitials(displayName);
      var color = Utils.assignParticipantColor(displayName);
      var isSelected = displayName === session.selectedParticipant;

      html +=
        '<div class="participant-card' + (isSelected ? ' selected' : '') + '" data-name="' + Utils.sanitizeHTML(displayName) + '">' +
          '<div class="participant-avatar" style="background-color:' + color + '">' + Utils.sanitizeHTML(initials) + '</div>' +
          '<div class="participant-info">' +
            '<div class="participant-name">' + Utils.sanitizeHTML(displayName) + '</div>' +
            (displayPhone ? '<div class="participant-phone">' + Utils.sanitizeHTML(displayPhone) + '</div>' : '') +
            '<div class="participant-count">' + (p.messageCount || 0) + ' messages</div>' +
          '</div>' +
          (isSelected ? '<div class="participant-check">✓</div>' : '') +
        '</div>';
    }

    container.innerHTML = html;

    var cards = container.querySelectorAll('.participant-card');
    for (var j = 0; j < cards.length; j++) {
      (function (card) {
        card.addEventListener('click', function () {
          var name = card.getAttribute('data-name');
          Store.updateSessionParticipant(sessionId, name);
          openChat(sessionId);
        });
      })(cards[j]);
    }

    showScreen('participant');
  }

  // ---- Session Management ----

  function saveNewSession(apiData, selectedParticipant) {
    var meta = apiData.metadata;
    var messages = apiData.messages || [];
    var lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;

    var chatName = meta.groupName || meta.chatName || '';
    if (meta.participants && meta.participants.length === 2) {
      var p0 = meta.participants[0].name || meta.participants[0].phone || 'Member 1';
      var p1 = meta.participants[1].name || meta.participants[1].phone || 'Member 2';
      chatName = p0 + ' & ' + p1;
    } else if (!chatName && meta.chatType === 'individual' && meta.participants) {
      for (var i = 0; i < meta.participants.length; i++) {
        var pName = meta.participants[i].name || meta.participants[i].phone || '';
        if (pName !== selectedParticipant) {
          chatName = pName;
          break;
        }
      }
    }
    if (!chatName) chatName = 'Chat';

    var sessionId = Utils.generateId();

    var session = {
      id: sessionId,
      name: chatName,
      chatType: meta.chatType || 'individual',
      participants: meta.participants || [],
      selectedParticipant: selectedParticipant,
      totalMessages: meta.totalMessages || messages.length,
      dateRange: meta.dateRange || null,
      lastMessage: lastMsg ? (lastMsg.content || lastMsg.text || '') : '',
      lastMessageTime: lastMsg ? lastMsg.timestamp : null,
      hasMedia: meta.hasMedia || false,
      mediaBaseUrl: meta.mediaBaseUrl || '',
      createdAt: new Date().toISOString(),
      messages: normalizeMessages(messages),
    };

    Store.saveChatSession(session).then(function () {
      var purged = false;
      function triggerPurge() {
        if (purged) return;
        purged = true;
        purgeServerSession(sessionId, apiData);
      }
      // Safety guarantee: automatically purge server session after 60s even if caching stalled or crashed
      var safetyTimer = setTimeout(triggerPurge, 60000);
      window.addEventListener('beforeunload', triggerPurge);

      // Cache all media blobs into IndexedDB for 100% offline stateless access
      cacheSessionMedia(sessionId, apiData).then(function () {
        clearTimeout(safetyTimer);
        window.removeEventListener('beforeunload', triggerPurge);
        triggerPurge();
        pendingApiData = null;
        openChat(sessionId);
      }).catch(function () {
        clearTimeout(safetyTimer);
        window.removeEventListener('beforeunload', triggerPurge);
        triggerPurge();
        pendingApiData = null;
        openChat(sessionId);
      });
    }).catch(function (e) {
      console.error('Failed to save session:', e);
      showError({
        title: 'Storage error',
        message: 'Failed to save the chat to local storage.',
        hint: 'Your browser may be running low on storage. Try clearing some data.',
      });
    });
  }

  function cacheSessionMedia(sessionId, apiData) {
    if (!apiData || !apiData.metadata || !apiData.metadata.hasMedia || !apiData.messages) {
      return Promise.resolve();
    }
    var mediaBase = apiData.metadata.mediaBaseUrl || ('/uploads/' + apiData.metadata.sessionId + '/');
    var distinctFiles = {};
    for (var i = 0; i < apiData.messages.length; i++) {
      var msg = apiData.messages[i];
      var fname = msg.mediaFile || msg.media_file || msg.file;
      if (fname) distinctFiles[fname] = true;
      if (msg.thumbnail) distinctFiles[msg.thumbnail] = true;
    }
    var filenames = Object.keys(distinctFiles);
    if (filenames.length === 0) return Promise.resolve();

    var fetchPromises = [];
    for (var j = 0; j < filenames.length; j++) {
      (function (fname) {
        var url = resolveMediaUrlWithBase(fname, mediaBase);
        var p = fetch(url)
          .then(function (res) {
            if (!res.ok) throw new Error('Status ' + res.status);
            return res.blob();
          })
          .then(function (blob) {
            return { filename: fname, blob: blob };
          })
          .catch(function (err) {
            console.warn('Could not fetch media for local caching:', fname, err);
            return null;
          });
        fetchPromises.push(p);
      })(filenames[j]);
    }

    return Promise.all(fetchPromises).then(function (results) {
      var validItems = [];
      var totalMediaBytes = 0;
      for (var k = 0; k < results.length; k++) {
        if (results[k] && results[k].blob) {
          validItems.push(results[k]);
          totalMediaBytes += results[k].blob.size || 0;
        }
      }

      var savePromise = (Store.saveMediaBlobsBatch)
        ? Store.saveMediaBlobsBatch(sessionId, validItems)
        : Promise.resolve();

      return savePromise.then(function () {
        var session = Store.getSessionById(sessionId);
        if (session) {
          var textBytes = (session.textBytes !== undefined) ? session.textBytes : (session.storageBytes || 0);
          Store.updateSessionStorageBytes(sessionId, textBytes + totalMediaBytes);
        }
        if (Store.updateSessionMediaBaseUrl) {
          Store.updateSessionMediaBaseUrl(sessionId, '');
        }
      });
    });
  }

  /**
   * Fire-and-forget: DELETE /session/{id} on the PHP server so it wipes
   * the uploads/{sessionId}/ directory once the client has everything cached.
   * Completely non-blocking — failure is just a console warning.
   *
   * Also called for text-only chats (no media) to clean up the chat.txt file.
   */
  function purgeServerSession(sessionId, apiData) {
    // Use the real server session ID from the API response (may differ from local sessionId)
    var serverSessionId = (apiData && apiData.metadata && apiData.metadata.sessionId)
      ? apiData.metadata.sessionId
      : sessionId;

    if (!serverSessionId) return;

    var apiBase = (window.WaReader && window.WaReader.CONFIG && window.WaReader.CONFIG.API_BASE_URL)
      ? window.WaReader.CONFIG.API_BASE_URL.replace(/\/$/, '')
      : '';

    if (!apiBase) return;

    fetch(apiBase + '/session/' + encodeURIComponent(serverSessionId), {
      method: 'DELETE',
    }).then(function (res) {
      if (res.ok) {
        console.info('[WA Reader] Server session purged:', serverSessionId);
      } else {
        console.warn('[WA Reader] Server session purge returned', res.status, 'for', serverSessionId);
      }
    }).catch(function (err) {
      // Server may be offline — that's fine, files expire automatically anyway
      console.warn('[WA Reader] Could not reach server to purge session files:', err);
    });
  }

  function resolveMediaUrlWithBase(filename, mediaBaseUrl) {
    if (!filename) return '';
    if (filename.startsWith('http://') || filename.startsWith('https://') || filename.startsWith('data:')) {
      return filename;
    }
    var cleanName = filename.split('/').pop().split('\\').pop();
    var encodedName = encodeURIComponent(cleanName);
    var base = mediaBaseUrl || '';
    if (base && !base.startsWith('http://') && !base.startsWith('https://') && window.WaReader && window.WaReader.CONFIG && window.WaReader.CONFIG.API_BASE_URL) {
      base = window.WaReader.CONFIG.API_BASE_URL.replace(/\/$/, '') + '/' + base.replace(/^\//, '');
    }
    if (base) {
      return base.replace(/\/$/, '') + '/' + encodedName;
    }
    return filename;
  }


  function normalizeMessages(messages) {
    var normalized = [];
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      normalized.push({
        id: msg.id || i + 1,
        timestamp: msg.timestamp || '',
        sender: msg.sender || null,
        senderPhone: msg.senderPhone || null,
        content: msg.content || msg.text || '',
        text: msg.content || msg.text || '',
        body: msg.content || msg.text || '',
        type: msg.type || 'text',
        mediaFile: msg.mediaFile || msg.media_file || null,
        media_file: msg.mediaFile || msg.media_file || null,
        isSystemMessage: msg.isSystemMessage || false,
        sender_phone: msg.senderPhone || null,
        is_deleted: msg.type === 'deleted',
        media_omitted: msg.type === 'media_omitted',
      });
    }
    return normalized;
  }

  // ---- Chat View ----

  function promptRenameChat() {
    if (!currentSessionId) return;
    var session = Store.getSessionById(currentSessionId);
    if (!session) return;
    var currentName = session.name || '';
    var newName = prompt('Enter new name for this chat:', currentName);
    if (newName && newName.trim() !== '' && newName.trim() !== currentName) {
      Store.updateSessionName(currentSessionId, newName.trim());
      var nameEl = document.getElementById('chat-header-name');
      if (nameEl) nameEl.textContent = newName.trim();
    }
  }

  function openChat(sessionId) {
    currentSessionId = sessionId;
    var session = Store.getSessionById(sessionId);
    if (!session) return;

    // Update header
    var displayName = Utils.getChatDisplayName ? Utils.getChatDisplayName(session) : session.name;
    var headerName = document.getElementById('chat-header-name');
    var headerAvatar = document.getElementById('chat-header-avatar');

    if (headerName) headerName.textContent = displayName;
    if (headerAvatar) {
      var color = Utils.assignParticipantColor(displayName);
      headerAvatar.style.backgroundColor = color;
      headerAvatar.textContent = Utils.getInitials(displayName);
    }

    showScreen('chat');

    // Load media map from IndexedDB first for 100% offline access, then load and render messages
    Store.getSessionMediaMap(sessionId).then(function (mediaMap) {
      Store.getChatMessages(sessionId).then(function (messages) {
        renderChatMessages(messages, session, mediaMap);
      }).catch(function (e) {
        console.error('Failed to load messages:', e);
      });
    }).catch(function (e) {
      console.error('Failed to load media map:', e);
    });
  }

  function renderChatMessages(messages, session, mediaMap) {
    var viewport = document.getElementById('messages-viewport');
    if (!viewport) return;

    // Destroy previous virtual scroll
    closeChatView();

    // Insert date separators
    var items = insertDateSeparators(messages);

    // Configure renderer
    MessageRenderer.configure({
      selectedParticipant: session.selectedParticipant || '',
      isGroup: session.chatType === 'group',
      mediaBaseUrl: session.mediaBaseUrl || '',
      mediaMap: mediaMap || {},
    });

    // Set search messages
    Search.setMessages(items);

    // Create virtual scroll
    currentVirtualScroll = new VirtualScroll(
      viewport,
      items,
      function (item, index) {
        MessageRenderer.resetSenderTracking();
        return MessageRenderer.renderMessage(item, index);
      },
      {
        buffer: CONFIG.VIRTUAL_SCROLL_BUFFER,
        onScrollChange: function (info) {
          var scrollBtn = document.getElementById('scroll-bottom-btn');
          if (scrollBtn) {
            scrollBtn.style.display = info.isAtBottom ? 'none' : 'flex';
          }
        },
      }
    );

    Search.setVirtualScroll(currentVirtualScroll);

    // Scroll to bottom initially (`scrollToBottom(false)` is instant without smooth jump)
    var scrollPasses = [50, 150, 350];
    for (var sp = 0; sp < scrollPasses.length; sp++) {
      setTimeout(function () {
        if (currentVirtualScroll) {
          currentVirtualScroll.scrollToBottom(false);
        }
      }, scrollPasses[sp]);
    }
  }

  function insertDateSeparators(messages) {
    if (!messages || messages.length === 0) return [];

    var items = [];
    var lastDateKey = '';

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var dateKey = Utils.getDateKey(msg.timestamp);

      if (dateKey && dateKey !== lastDateKey) {
        items.push({
          _type: 'date_separator',
          type: 'date_separator',
          dateLabel: Utils.formatDate(msg.timestamp),
          text: Utils.formatDate(msg.timestamp),
          timestamp: msg.timestamp,
        });
        lastDateKey = dateKey;
      }

      items.push(msg);
    }

    return items;
  }

  function closeChatView() {
    if (currentVirtualScroll) {
      currentVirtualScroll.destroy();
      currentVirtualScroll = null;
    }
    var viewport = document.getElementById('messages-viewport');
    if (viewport) viewport.innerHTML = '';
    Search.close();
  }

  // ---- Error Display ----

  function showError(err) {
    var titleEl = document.getElementById('error-title');
    var messageEl = document.getElementById('error-message');
    var hintEl = document.getElementById('error-hint');

    if (titleEl) titleEl.textContent = err.title || 'Error';
    if (messageEl) messageEl.textContent = err.message || 'An error occurred.';
    if (hintEl) hintEl.textContent = err.hint || '';

    showScreen('error');
  }

  // ---- Theme ----

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    var themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
      if (theme === 'light') {
        themeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 0 0-1.41 0 .996.996 0 0 0 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0a.996.996 0 0 0 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 0 0 0-1.41.996.996 0 0 0-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z" fill="currentColor"/></svg>';
      } else {
        themeIcon.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" fill="currentColor"/></svg>';
      }
    }

    // Update meta theme-color
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.content = theme === 'dark' ? '#202C33' : '#008069';
    }
  }

  // ---- Service Worker ----

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        console.log('Service Worker registered:', reg.scope);
      }).catch(function (err) {
        console.warn('Service Worker registration failed:', err);
      });
    }
  }

  // ---- Boot ----

  document.addEventListener('DOMContentLoaded', init);
})();
