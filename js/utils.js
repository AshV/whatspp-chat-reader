/**
 * WhatsApp Chat Reader — Utility Functions
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};

  /**
   * Format an ISO datetime string to time string (e.g. '9:14 AM' or '21:14')
   */
  function formatTime(isoString) {
    if (!isoString) return '';
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      var hours = d.getHours();
      var minutes = d.getMinutes();
      var ampm = hours >= 12 ? 'PM' : 'AM';
      var h12 = hours % 12 || 12;
      return h12 + ':' + (minutes < 10 ? '0' : '') + minutes + ' ' + ampm;
    } catch (e) {
      return '';
    }
  }

  /**
   * Format an ISO datetime to date string for date separators
   */
  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      if (target.getTime() === today.getTime()) return 'TODAY';
      if (target.getTime() === yesterday.getTime()) return 'YESTERDAY';

      var dd = d.getDate();
      var mm = d.getMonth() + 1;
      var yyyy = d.getFullYear();
      return (mm < 10 ? '0' : '') + mm + '/' + (dd < 10 ? '0' : '') + dd + '/' + yyyy;
    } catch (e) {
      return '';
    }
  }

  /**
   * Format date for chat list items
   */
  function formatChatListDate(isoString) {
    if (!isoString) return '';
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      if (target.getTime() === today.getTime()) return formatTime(isoString);
      if (target.getTime() === yesterday.getTime()) return 'Yesterday';

      var dd = d.getDate();
      var mm = d.getMonth() + 1;
      var yy = String(d.getFullYear()).slice(-2);
      return (mm < 10 ? '0' : '') + mm + '/' + (dd < 10 ? '0' : '') + dd + '/' + yy;
    } catch (e) {
      return '';
    }
  }

  /**
   * Assign a consistent HSL color from a string hash using WhatsApp-like palette
   */
  function assignParticipantColor(name) {
    if (!name) return WaReader.CONFIG.SENDER_COLORS[0];
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    var index = Math.abs(hash) % WaReader.CONFIG.SENDER_COLORS.length;
    return WaReader.CONFIG.SENDER_COLORS[index];
  }

  /**
   * Detect messages containing only emoji characters (no text)
   */
  function isEmojiOnly(text) {
    if (!text || typeof text !== 'string') return false;
    var stripped = text.replace(/\s/g, '');
    if (stripped.length === 0) return false;
    // Match emoji sequences including flags, skin tones, ZWJ sequences
    var emojiPattern = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3|[\u{1F1E0}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|\u{E0061}-\u{E007A}|\u{E007F})+$/u;
    try {
      return emojiPattern.test(stripped);
    } catch (e) {
      // Fallback for older browsers
      var fallback = /^(?:[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{1F1E0}-\u{1F1FF}]|\s)+$/u;
      try {
        return fallback.test(stripped);
      } catch (e2) {
        return false;
      }
    }
  }

  /**
   * Sanitize HTML to prevent XSS
   */
  function sanitizeHTML(text) {
    if (!text) return '';
    var map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (c) { return map[c]; });
  }

  /**
   * Convert URLs in text to clickable <a> tags
   */
  function linkify(text) {
    if (!text) return '';
    var urlPattern = /((https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)}\]"'])/gi;
    return text.replace(urlPattern, function (url) {
      var href = url;
      if (!/^https?:\/\//i.test(url)) {
        href = 'https://' + url;
      }
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
  }

  /**
   * Debounce a function
   */
  function debounce(fn, ms) {
    var timer;
    return function () {
      var context = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, ms);
    };
  }

  /**
   * Throttle a function
   */
  function throttle(fn, ms) {
    var lastCall = 0;
    var timer;
    return function () {
      var now = Date.now();
      var context = this;
      var args = arguments;
      var remaining = ms - (now - lastCall);
      clearTimeout(timer);
      if (remaining <= 0) {
        lastCall = now;
        fn.apply(context, args);
      } else {
        timer = setTimeout(function () {
          lastCall = Date.now();
          fn.apply(context, args);
        }, remaining);
      }
    };
  }

  /**
   * Generate a unique ID string
   */
  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Get initials from a name (e.g. 'John Doe' → 'JD')
   */
  function getInitials(name) {
    if (!name) return '?';
    var parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      // Could be a phone number
      if (/^[\+\d\s\-\(\)]+$/.test(parts[0])) {
        return parts[0].slice(-2);
      }
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Format file size in human-readable form
   */
  function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes === 0) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    var size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return (i === 0 ? size : size.toFixed(1)) + ' ' + units[i];
  }

  /**
   * Get date key from ISO string (for date separator grouping)
   */
  function getDateKey(isoString) {
    if (!isoString) return '';
    try {
      var d = new Date(isoString);
      return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    } catch (e) {
      return '';
    }
  }

  /**
   * Get display name for a session — if only 2 members, show member's name as chat name
   */
  function getChatDisplayName(session) {
    if (!session) return 'WhatsApp Chat';
    if (session.participants && session.participants.length === 2) {
      var p0 = session.participants[0].name || session.participants[0].phone || 'Member 1';
      var p1 = session.participants[1].name || session.participants[1].phone || 'Member 2';
      return p0 + ' & ' + p1;
    }
    return session.name || session.groupName || 'WhatsApp Chat';
  }

  /**
   * Format added on date (e.g. '16 Jul' or '16 Jul 24')
   */
  function formatAddedOnDate(isoString) {
    if (!isoString) return 'Today';
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Today';
      var now = new Date();
      var isSameYear = d.getFullYear() === now.getFullYear();
      return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: isSameYear ? undefined : '2-digit' });
    } catch (e) {
      return 'Today';
    }
  }

  // Export
  WaReader.Utils = {
    formatTime: formatTime,
    formatDate: formatDate,
    formatChatListDate: formatChatListDate,
    assignParticipantColor: assignParticipantColor,
    isEmojiOnly: isEmojiOnly,
    sanitizeHTML: sanitizeHTML,
    linkify: linkify,
    debounce: debounce,
    throttle: throttle,
    generateId: generateId,
    getInitials: getInitials,
    formatFileSize: formatFileSize,
    getDateKey: getDateKey,
    getChatDisplayName: getChatDisplayName,
    formatAddedOnDate: formatAddedOnDate,
  };
})();
