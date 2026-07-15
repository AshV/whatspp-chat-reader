/**
 * WhatsApp Chat Reader — Configuration
 */
(function () {
  'use strict';

  window.WaReader = window.WaReader || {};

  window.WaReader.CONFIG = Object.freeze({
    API_BASE_URL: window.WA_READER_API_URL || ((window.location.origin === 'http://localhost:8000' || window.location.origin === 'http://127.0.0.1:8000') ? '' : 'http://localhost:8000'),
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50 MB
    VIRTUAL_SCROLL_BUFFER: 20,
    VIRTUAL_SCROLL_ITEM_HEIGHT: 65,
    DB_NAME: 'wa-reader-db',
    DB_VERSION: 2,
    STORE_NAME: 'chat-messages',
    MEDIA_STORE_NAME: 'chat-media',
    SESSIONS_KEY: 'wa-reader-sessions',
    SETTINGS_KEY: 'wa-reader-settings',
    ACCEPTED_FILE_TYPES: ['.txt', '.zip'],
    ACCEPTED_MIME_TYPES: ['text/plain', 'application/zip', 'application/x-zip-compressed'],
    SENDER_COLORS: [
      '#FF6B6B', '#E8A317', '#25D366', '#34B7F1',
      '#D4A5FF', '#FF8C42', '#06D6A0', '#118AB2',
      '#EF476F', '#73D2DE'
    ],
  });
})();
