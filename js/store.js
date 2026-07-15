/**
 * WhatsApp Chat Reader — Store (localStorage + IndexedDB)
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};
  var CONFIG = WaReader.CONFIG;
  var db = null;

  /**
   * Open / create the IndexedDB database
   */
  function initDB() {
    return new Promise(function (resolve, reject) {
      if (db) {
        resolve(db);
        return;
      }

      var request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

      request.onupgradeneeded = function (event) {
        var database = event.target.result;
        if (!database.objectStoreNames.contains(CONFIG.STORE_NAME)) {
          database.createObjectStore(CONFIG.STORE_NAME, { keyPath: 'sessionId' });
        }
        if (CONFIG.MEDIA_STORE_NAME && !database.objectStoreNames.contains(CONFIG.MEDIA_STORE_NAME)) {
          var mediaStore = database.createObjectStore(CONFIG.MEDIA_STORE_NAME, { keyPath: 'key' });
          mediaStore.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };

      request.onsuccess = function (event) {
        db = event.target.result;

        db.onversionchange = function () {
          db.close();
          db = null;
        };

        resolve(db);
      };

      request.onerror = function (event) {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Get all chat sessions from localStorage
   */
  function getChatSessions() {
    try {
      var raw = localStorage.getItem(CONFIG.SESSIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to read sessions:', e);
      return [];
    }
  }

  /**
   * Save sessions list to localStorage
   */
  function _saveSessions(sessions) {
    try {
      localStorage.setItem(CONFIG.SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error('Failed to save sessions:', e);
    }
  }

  /**
   * Save a complete chat session (metadata to localStorage, messages to IndexedDB)
   */
  function saveChatSession(session) {
    return initDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        // Save messages to IndexedDB
        var tx = database.transaction(CONFIG.STORE_NAME, 'readwrite');
        var store = tx.objectStore(CONFIG.STORE_NAME);

        var record = {
          sessionId: session.id,
          messages: session.messages || [],
        };

        var req = store.put(record);

        req.onsuccess = function () {
          // Estimate storage size of message data
          var messagesJson = '';
          try { messagesJson = JSON.stringify(session.messages || []); } catch (e) {}
          var textBytes = messagesJson.length * 2; // JS strings are UTF-16 (2 bytes/char approx)

          // Save metadata to localStorage (without messages)
          var sessions = getChatSessions();
          var metadata = {
            id: session.id,
            name: session.name || 'Unnamed Chat',
            chatType: session.chatType || 'private',
            participants: session.participants || [],
            selectedParticipant: session.selectedParticipant || null,
            totalMessages: session.totalMessages || 0,
            dateRange: session.dateRange || null,
            lastMessage: session.lastMessage || '',
            lastMessageTime: session.lastMessageTime || null,
            hasMedia: session.hasMedia || false,
            mediaBaseUrl: session.mediaBaseUrl || '',
            createdAt: session.createdAt || new Date().toISOString(),
            textBytes: (session.textBytes !== undefined) ? session.textBytes : textBytes,
            storageBytes: (session.storageBytes !== undefined) ? session.storageBytes : textBytes,
          };

          // Replace existing or add new
          var existingIdx = -1;
          for (var i = 0; i < sessions.length; i++) {
            if (sessions[i].id === session.id) {
              existingIdx = i;
              break;
            }
          }

          if (existingIdx >= 0) {
            sessions[existingIdx] = metadata;
          } else {
            sessions.push(metadata);
          }

          _saveSessions(sessions);
          resolve(metadata);
        };

        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  /**
   * Get messages for a specific chat session from IndexedDB
   */
  function getChatMessages(sessionId) {
    return initDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        var tx = database.transaction(CONFIG.STORE_NAME, 'readonly');
        var store = tx.objectStore(CONFIG.STORE_NAME);
        var req = store.get(sessionId);

        req.onsuccess = function () {
          var result = req.result;
          resolve(result ? result.messages : []);
        };

        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  /**
   * Save a media blob to IndexedDB
   */
  function saveMediaBlob(sessionId, filename, blob) {
    if (!sessionId || !filename || !blob) return Promise.resolve();
    return initDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        if (!database.objectStoreNames.contains(CONFIG.MEDIA_STORE_NAME)) {
          resolve();
          return;
        }
        var tx = database.transaction(CONFIG.MEDIA_STORE_NAME, 'readwrite');
        var store = tx.objectStore(CONFIG.MEDIA_STORE_NAME);
        var record = {
          key: sessionId + '/' + filename,
          sessionId: sessionId,
          filename: filename,
          blob: blob
        };
        var req = store.put(record);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  /**
   * Save multiple media blobs in a single atomic transaction without lock contention.
   * items is an array of objects: { filename: string, blob: Blob }
   */
  function saveMediaBlobsBatch(sessionId, items) {
    return initDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        if (!database.objectStoreNames.contains(CONFIG.MEDIA_STORE_NAME) || !items || items.length === 0) {
          resolve();
          return;
        }
        var tx = database.transaction(CONFIG.MEDIA_STORE_NAME, 'readwrite');
        var store = tx.objectStore(CONFIG.MEDIA_STORE_NAME);

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item && item.filename && item.blob) {
            store.put({
              key: sessionId + '/' + item.filename,
              sessionId: sessionId,
              filename: item.filename,
              blob: item.blob
            });
          }
        }

        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /**
   * Get all cached media blobs for a session as an object map: { filename: ObjectURL }
   * Keys include exact filename, basename, decoded, encoded, and lowercase variants for 100% robust lookup.
   */
  function getSessionMediaMap(sessionId) {
    return initDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        if (!database.objectStoreNames.contains(CONFIG.MEDIA_STORE_NAME)) {
          resolve({});
          return;
        }
        var tx = database.transaction(CONFIG.MEDIA_STORE_NAME, 'readonly');
        var store = tx.objectStore(CONFIG.MEDIA_STORE_NAME);
        var index = store.index('sessionId');
        var req = index.getAll(sessionId);

        req.onsuccess = function () {
          var records = req.result || [];
          var map = {};
          for (var i = 0; i < records.length; i++) {
            var rec = records[i];
            if (rec.blob && rec.filename) {
              try {
                var objectUrl = URL.createObjectURL(rec.blob);
                var fname = rec.filename;
                var basename = fname.split('/').pop().split('\\').pop();

                function addVariant(k) {
                  if (!k) return;
                  map[k] = objectUrl;
                  map[k.toLowerCase()] = objectUrl;
                  try {
                    var dec = decodeURIComponent(k);
                    map[dec] = objectUrl;
                    map[dec.toLowerCase()] = objectUrl;
                  } catch(e) {}
                  try {
                    var enc = encodeURIComponent(k);
                    map[enc] = objectUrl;
                    map[enc.toLowerCase()] = objectUrl;
                  } catch(e) {}
                }

                addVariant(fname);
                if (basename !== fname) addVariant(basename);
              } catch (e) {
                console.error('Failed to create object URL for ' + rec.filename, e);
              }
            }
          }
          resolve(map);
        };
        req.onerror = function () {
          console.warn('Failed to load session media map:', req.error);
          resolve({});
        };
      });
    });
  }

  /**
   * Delete all media blobs associated with a session
   */
  function deleteSessionMedia(sessionId) {
    return initDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        if (!database.objectStoreNames.contains(CONFIG.MEDIA_STORE_NAME)) {
          resolve();
          return;
        }
        var tx = database.transaction(CONFIG.MEDIA_STORE_NAME, 'readwrite');
        var store = tx.objectStore(CONFIG.MEDIA_STORE_NAME);
        var index = store.index('sessionId');
        var req = index.openCursor(IDBKeyRange.only(sessionId));

        req.onsuccess = function (event) {
          var cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = function () {
          resolve();
        };
      });
    });
  }

  /**
   * Delete a chat session from both localStorage and IndexedDB
   */
  function deleteChatSession(sessionId) {
    return initDB().then(function (database) {
      return new Promise(function (resolve, reject) {
        // Remove from IndexedDB
        var tx = database.transaction(CONFIG.STORE_NAME, 'readwrite');
        var store = tx.objectStore(CONFIG.STORE_NAME);
        var req = store.delete(sessionId);

        req.onsuccess = function () {
          // Also delete cached media blobs
          deleteSessionMedia(sessionId).then(function () {
            // Remove from localStorage
            var sessions = getChatSessions();
            var filtered = sessions.filter(function (s) { return s.id !== sessionId; });
            _saveSessions(filtered);
            resolve();
          });
        };

        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  /**
   * Update the selected participant for a session
   */
  function updateSessionParticipant(sessionId, participantName) {
    var sessions = getChatSessions();
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === sessionId) {
        sessions[i].selectedParticipant = participantName;
        if (sessions[i].participants && sessions[i].participants.length === 2) {
          var p0 = sessions[i].participants[0].name || sessions[i].participants[0].phone || 'Member 1';
          var p1 = sessions[i].participants[1].name || sessions[i].participants[1].phone || 'Member 2';
          sessions[i].name = p0 + ' & ' + p1;
        }
        break;
      }
    }
    _saveSessions(sessions);
  }

  /**
   * Update the name for a session
   */
  function updateSessionName(sessionId, newName) {
    var sessions = getChatSessions();
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === sessionId) {
        sessions[i].name = newName;
        break;
      }
    }
    _saveSessions(sessions);
  }

  /**
   * Get app settings
   */
  function getSettings() {
    try {
      var raw = localStorage.getItem(CONFIG.SETTINGS_KEY);
      var defaults = { theme: 'light' };
      if (raw) {
        var parsed = JSON.parse(raw);
        return Object.assign(defaults, parsed);
      }
      return defaults;
    } catch (e) {
      return { theme: 'light' };
    }
  }

  /**
   * Save app settings
   */
  function saveSettings(settings) {
    try {
      localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  /**
   * Get a specific session by ID from localStorage
   */
  function getSessionById(sessionId) {
    var sessions = getChatSessions();
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === sessionId) {
        return sessions[i];
      }
    }
    return null;
  }

  /**
   * Update the storageBytes field on a session (text + media combined)
   */
  function updateSessionStorageBytes(sessionId, totalBytes) {
    var sessions = getChatSessions();
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === sessionId) {
        if (sessions[i].textBytes === undefined) {
          sessions[i].textBytes = sessions[i].storageBytes || 0;
        }
        sessions[i].storageBytes = totalBytes;
        break;
      }
    }
    _saveSessions(sessions);
  }

  /**
   * Sum the real binary sizes of all cached media blobs for a session.
   * Returns a Promise<number> — the total bytes stored in the chat-media IndexedDB store.
   */
  function getSessionMediaBytes(sessionId) {
    return initDB().then(function (database) {
      return new Promise(function (resolve) {
        if (!database.objectStoreNames.contains(CONFIG.MEDIA_STORE_NAME)) {
          resolve(0);
          return;
        }
        var tx = database.transaction(CONFIG.MEDIA_STORE_NAME, 'readonly');
        var store = tx.objectStore(CONFIG.MEDIA_STORE_NAME);
        var index = store.index('sessionId');
        var req = index.openCursor(IDBKeyRange.only(sessionId));
        var total = 0;

        req.onsuccess = function (event) {
          var cursor = event.target.result;
          if (cursor) {
            if (cursor.value && cursor.value.blob) {
              total += cursor.value.blob.size || 0;
            }
            cursor.continue();
          } else {
            resolve(total);
          }
        };
        req.onerror = function () { resolve(0); };
      });
    });
  }

  function updateSessionMediaBaseUrl(sessionId, url) {
    var sessions = getChatSessions();
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === sessionId) {
        sessions[i].mediaBaseUrl = url;
        break;
      }
    }
    _saveSessions(sessions);
  }

  // Export
  WaReader.Store = {
    initDB: initDB,
    getChatSessions: getChatSessions,
    saveChatSession: saveChatSession,
    getChatMessages: getChatMessages,
    deleteChatSession: deleteChatSession,
    updateSessionParticipant: updateSessionParticipant,
    updateSessionName: updateSessionName,
    updateSessionStorageBytes: updateSessionStorageBytes,
    updateSessionMediaBaseUrl: updateSessionMediaBaseUrl,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getSessionById: getSessionById,
    saveMediaBlob: saveMediaBlob,
    saveMediaBlobsBatch: saveMediaBlobsBatch,
    getSessionMediaBytes: getSessionMediaBytes,
    getSessionMediaMap: getSessionMediaMap,
    deleteSessionMedia: deleteSessionMedia,
  };
})();
