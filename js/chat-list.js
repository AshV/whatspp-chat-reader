/**
 * WhatsApp Chat Reader — Chat List
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};
  var Utils = WaReader.Utils;
  var Store = WaReader.Store;

  var container = null;
  var searchWrap = null;
  var searchInput = null;
  var onChatSelect = null;
  var onDeleteChat = null;
  var onChangeParticipant = null;
  var contextMenu = null;
  var filterQuery = '';

  function init(options) {
    container = document.getElementById('chat-list-items');
    searchWrap = document.querySelector('.chat-list-search-wrap');
    searchInput = document.getElementById('chat-list-search-input');
    onChatSelect = options.onChatSelect || function () {};
    onDeleteChat = options.onDeleteChat || function () {};
    onChangeParticipant = options.onChangeParticipant || function () {};

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        filterQuery = searchInput.value.trim().toLowerCase();
        render();
      });
    }

    // Close context menu on click outside
    document.addEventListener('click', function () {
      closeContextMenu();
    });
  }

  function render() {
    if (!container) return;

    var sessions = Store.getChatSessions();

    // Filter
    if (filterQuery) {
      sessions = sessions.filter(function (s) {
        return s.name.toLowerCase().indexOf(filterQuery) >= 0;
      });
    }

    // Sort by lastMessageTime descending
    sessions.sort(function (a, b) {
      var ta = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      var tb = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return tb - ta;
    });

    if (sessions.length === 0 && !filterQuery) {
      container.innerHTML = renderEmptyState();
      return;
    }

    if (sessions.length === 0 && filterQuery) {
      container.innerHTML = '<div class="empty-state"><p class="empty-state-text">No chats match your search</p></div>';
      return;
    }

    var html = '';
    for (var i = 0; i < sessions.length; i++) {
      html += renderChatItem(sessions[i]);
    }
    container.innerHTML = html;

    // Attach click handlers via delegation
    var items = container.querySelectorAll('.chat-item');
    for (var j = 0; j < items.length; j++) {
      (function (item) {
        item.addEventListener('click', function (e) {
          if (e.button !== 0) return;
          var sessionId = item.getAttribute('data-session-id');
          if (!sessionId) return;

          // Check if clicked the delete button right on the card
          var deleteBtn = e.target.closest('[data-action="delete"]');
          if (deleteBtn) {
            e.stopPropagation();
            showDeleteConfirm(sessionId);
            return;
          }

          // Otherwise open the chat
          onChatSelect(sessionId);
        });

        item.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          var sessionId = item.getAttribute('data-session-id');
          showContextMenu(e.clientX, e.clientY, sessionId);
        });
      })(items[j]);
    }

    // After painting, compute real media blob sizes from IndexedDB and patch the size badge in-place
    patchMediaSizes(sessions);
  }

  /**
   * For each session that has media, read the real blob bytes directly from IndexedDB
   * (the only authoritative source) and update the size badge without re-rendering.
   */
  function patchMediaSizes(sessions) {
    for (var i = 0; i < sessions.length; i++) {
      (function (session) {
        Store.getSessionMediaBytes(session.id).then(function (mediaBytes) {
          if (mediaBytes <= 0) return;
          var textBytes = (session.textBytes !== undefined) ? session.textBytes : (session.storageBytes || 0);
          var totalBytes = textBytes + mediaBytes;

          if (totalBytes !== session.storageBytes || session.textBytes === undefined) {
            session.textBytes = textBytes;
            session.storageBytes = totalBytes;
            Store.updateSessionStorageBytes(session.id, totalBytes);
          }

          var card = container && container.querySelector('[data-session-id="' + session.id + '"]');
          if (!card) return;
          var sizeBadge = card.querySelector('.size-badge');
          if (sizeBadge) {
            sizeBadge.textContent = Utils.formatFileSize(totalBytes);
          }
        });
      })(sessions[i]);
    }
  }

  function renderChatItem(session) {
    var initials = Utils.getInitials(session.name);
    var color = Utils.assignParticipantColor(session.name);
    var time = Utils.formatChatListDate(session.lastMessageTime);
    var lastMsg = session.lastMessage || 'No messages yet';
    if (lastMsg.length > 70) lastMsg = lastMsg.substring(0, 70) + '…';

    // Message count badge
    var countBadge = '<span class="chat-badge count-badge">' +
      '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" fill="currentColor"/></svg>' +
      ' ' + (session.totalMessages || 0).toLocaleString() + ' msgs' +
      '</span>';

    // Size badge — text bytes from metadata, media patched async by patchMediaSizes()
    var displayBytes = session.storageBytes || 0;
    var sizeBadge = '<span class="chat-badge size-badge-pill">' +
      '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M20 6h-2.18c.07-.44.18-.86.18-1.3C18 2.12 15.88 0 13.3 0c-1.4 0-2.69.56-3.63 1.47L8 3.14 6.33 1.47C5.39.56 4.1 0 2.7 0 1.12 0-.0 1.12 0 2.7c0 .44.11.86.18 1.3H0v14h20V6zm-8.5 11H4V8h8v9zm8 0h-6V8h6v9z" fill="currentColor"/></svg>' +
      ' <span class="size-badge">' + (displayBytes > 0 ? Utils.formatFileSize(displayBytes) : '…') + '</span>' +
      '</span>';

    return '<div class="chat-item dashboard-card" data-session-id="' + session.id + '">' +
      '<div class="chat-card-left">' +
        '<div class="chat-avatar squircle" style="background-color:' + color + '">' + Utils.sanitizeHTML(initials) + '</div>' +
        '<div class="chat-info">' +
          '<div class="chat-info-top">' +
            '<span class="chat-name truncate">' + Utils.sanitizeHTML(session.name) + '</span>' +
            '<span class="chat-time">' + Utils.sanitizeHTML(time) + '</span>' +
          '</div>' +
          '<div class="chat-preview truncate">' + Utils.sanitizeHTML(lastMsg) + '</div>' +
          '<div class="chat-meta-pills">' +
            countBadge +
            sizeBadge +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="chat-card-actions">' +
        '<button class="chat-action-btn open-btn" data-action="open" title="Open Conversation">' +
          '<span>Open</span>' +
          '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/></svg>' +
        '</button>' +
        '<button class="chat-action-btn delete-btn" data-action="delete" title="Delete chat" aria-label="Delete chat">' +
          '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  }


  function renderEmptyState() {
    return '<div class="empty-state">' +
      '<div class="empty-state-icon">' +
        '<svg viewBox="0 0 303 172" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M229.565 160.229c32.647-20.165 50.726-54.989 46.903-92.572C272.839 28.46 234.143-4.452 187.205.906 166.744 3.493 148.665 12.626 134.837 26.18 121.014 12.626 102.93 3.493 82.474.906 35.536-4.452-3.16 28.46-6.789 67.657c-3.823 37.583 14.26 72.407 46.903 92.572L134.837 172l94.728-11.771z" opacity=".08"/>' +
        '</svg>' +
      '</div>' +
      '<h3 class="empty-state-title">No chats yet</h3>' +
      '<p class="empty-state-text">Upload your first WhatsApp chat export to get started. Tap the green button below.</p>' +
    '</div>';
  }



  function showContextMenu(x, y, sessionId) {
    closeContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML =
      '<button class="context-menu-item" data-action="change-participant">Change participant</button>' +
      '<button class="context-menu-item danger" data-action="delete">Delete chat</button>';

    // Position
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';

    document.body.appendChild(contextMenu);

    // Adjust if off-screen
    var rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    }

    contextMenu.addEventListener('click', function (e) {
      e.stopPropagation();
      var btn = e.target.closest('.context-menu-item');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      closeContextMenu();

      if (action === 'delete') {
        showDeleteConfirm(sessionId);
      } else if (action === 'change-participant') {
        onChangeParticipant(sessionId);
      }
    });
  }

  function closeContextMenu() {
    if (contextMenu && contextMenu.parentNode) {
      contextMenu.parentNode.removeChild(contextMenu);
      contextMenu = null;
    }
  }

  function showDeleteConfirm(sessionId) {
    var session = Store.getSessionById(sessionId);
    var name = session ? session.name : 'this chat';

    var overlay = document.createElement('div');
    overlay.className = 'confirm-dialog-overlay';
    overlay.innerHTML =
      '<div class="confirm-dialog">' +
        '<div class="confirm-dialog-title">Delete chat</div>' +
        '<div class="confirm-dialog-message">Are you sure you want to delete "' + Utils.sanitizeHTML(name) + '"? This cannot be undone.</div>' +
        '<div class="confirm-dialog-actions">' +
          '<button class="btn btn-secondary" data-action="cancel">Cancel</button>' +
          '<button class="btn btn-primary" style="background-color:var(--danger)" data-action="confirm">Delete</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      var action = e.target.getAttribute('data-action');
      if (action === 'cancel' || e.target === overlay) {
        document.body.removeChild(overlay);
      } else if (action === 'confirm') {
        document.body.removeChild(overlay);
        Store.deleteChatSession(sessionId).then(function () {
          render();
          onDeleteChat(sessionId);
        });
      }
    });
  }

  // Export
  WaReader.ChatList = {
    init: init,
    render: render,
  };
})();
