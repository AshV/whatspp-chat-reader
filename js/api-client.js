/**
 * WhatsApp Chat Reader — API Client
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};
  var CONFIG = WaReader.CONFIG;

  /**
   * Upload a chat file to the backend API
   * @param {File} file - The file to upload (.txt or .zip)
   * @param {Function} onProgress - Progress callback (0-100)
   * @returns {Promise<Object>} Parsed API response
   */
  function uploadChat(file, onProgress) {
    return new Promise(function (resolve, reject) {
      // Client-side validation
      if (!file) {
        reject({
          type: 'VALIDATION_ERROR',
          title: 'No file selected',
          message: 'Please select a file to upload.',
          hint: 'Choose a .txt or .zip WhatsApp chat export file.'
        });
        return;
      }

      if (file.size > CONFIG.MAX_FILE_SIZE) {
        reject({
          type: 'VALIDATION_ERROR',
          title: 'File too large',
          message: 'The file is ' + WaReader.Utils.formatFileSize(file.size) + ', which exceeds the maximum allowed size of ' + WaReader.Utils.formatFileSize(CONFIG.MAX_FILE_SIZE) + '.',
          hint: 'Try exporting the chat without media or splitting it into smaller parts.'
        });
        return;
      }

      var ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'txt' && ext !== 'zip') {
        reject({
          type: 'VALIDATION_ERROR',
          title: 'Unsupported file type',
          message: 'Only .txt and .zip files are supported. You selected a .' + ext + ' file.',
          hint: 'Export your chat from WhatsApp and upload the .txt or .zip file.'
        });
        return;
      }

      var xhr = new XMLHttpRequest();
      var formData = new FormData();
      formData.append('file', file);

      xhr.open('POST', CONFIG.API_BASE_URL + '/parse', true);

      // Progress tracking
      xhr.upload.onprogress = function (event) {
        if (event.lengthComputable && typeof onProgress === 'function') {
          var percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (e) {
            reject({
              type: 'PARSE_ERROR',
              title: 'Invalid server response',
              message: 'The server returned an invalid response that could not be parsed.',
              hint: 'This might be a server issue. Please try again later.'
            });
          }
        } else if (xhr.status === 413) {
          reject({
            type: 'SERVER_ERROR',
            title: 'File too large',
            message: 'The server rejected the file because it exceeds the size limit.',
            hint: 'Try exporting the chat without media.'
          });
        } else if (xhr.status === 422) {
          try {
            var errBody = JSON.parse(xhr.responseText);
            reject({
              type: 'VALIDATION_ERROR',
              title: errBody.title || 'Invalid chat file',
              message: errBody.detail || errBody.message || 'The file could not be parsed as a WhatsApp chat export.',
              hint: errBody.hint || 'Make sure you exported the chat correctly from WhatsApp.'
            });
          } catch (e) {
            reject({
              type: 'SERVER_ERROR',
              title: 'Processing failed',
              message: 'The server could not process this file.',
              hint: 'Ensure the file is a valid WhatsApp chat export.'
            });
          }
        } else {
          reject({
            type: 'SERVER_ERROR',
            title: 'Server error',
            message: 'Server returned status ' + xhr.status + '.',
            hint: 'Make sure the backend server is running at ' + CONFIG.API_BASE_URL
          });
        }
      };

      xhr.onerror = function () {
        reject({
          type: 'NETWORK_ERROR',
          title: 'Connection failed',
          message: 'Could not connect to the server.',
          hint: 'Make sure the backend is running at ' + CONFIG.API_BASE_URL + ' and check your network connection.'
        });
      };

      xhr.ontimeout = function () {
        reject({
          type: 'TIMEOUT_ERROR',
          title: 'Request timed out',
          message: 'The upload took too long and was cancelled.',
          hint: 'Try uploading a smaller file or check your connection speed.'
        });
      };

      xhr.timeout = 120000; // 2 minutes
      xhr.send(formData);
    });
  }

  // Export
  WaReader.ApiClient = {
    uploadChat: uploadChat,
  };
})();
