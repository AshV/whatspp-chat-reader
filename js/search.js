/**
 * WhatsApp Chat Reader — In-Chat Search
 * WhatsApp-style search bar with result navigation and highlighting
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};
  var Utils = WaReader.Utils;

  var searchBar = null;
  var searchInput = null;
  var resultCounter = null;
  var prevBtn = null;
  var nextBtn = null;

  var messages = [];
  var matchIndices = [];
  var currentMatchIdx = -1;
  var virtualScroll = null;
  var query = '';

  function init(options) {
    searchBar = document.getElementById('chat-search-bar');
    searchInput = document.getElementById('chat-search-input');
    resultCounter = document.getElementById('search-result-counter');
    prevBtn = document.getElementById('search-prev-btn');
    nextBtn = document.getElementById('search-next-btn');

    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(function () {
        query = searchInput.value.trim().toLowerCase();
        performSearch();
      }, 200));

      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) {
            navigateResult(-1);
          } else {
            navigateResult(1);
          }
        }
        if (e.key === 'Escape') {
          close();
        }
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () { navigateResult(-1); });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { navigateResult(1); });
    }
  }

  function setMessages(msgs) {
    messages = msgs || [];
  }

  function setVirtualScroll(vs) {
    virtualScroll = vs;
  }

  function open() {
    if (searchBar) {
      searchBar.classList.add('active');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
      query = '';
      matchIndices = [];
      currentMatchIdx = -1;
      updateCounter();
    }
  }

  function close() {
    if (searchBar) {
      searchBar.classList.remove('active');
    }
    query = '';
    matchIndices = [];
    currentMatchIdx = -1;
    clearHighlights();
    updateCounter();
  }

  function isActive() {
    return searchBar && searchBar.classList.contains('active');
  }

  function performSearch() {
    matchIndices = [];
    currentMatchIdx = -1;
    clearHighlights();

    if (!query || query.length < 2) {
      updateCounter();
      return;
    }

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      if (msg._type === 'date_separator' || msg.type === 'date_separator') continue;
      if (msg.isSystemMessage || msg.type === 'system') continue;

      var text = (msg.content || msg.text || msg.body || '').toLowerCase();
      var sender = (msg.sender || '').toLowerCase();

      if (text.indexOf(query) >= 0 || sender.indexOf(query) >= 0) {
        matchIndices.push(i);
      }
    }

    if (matchIndices.length > 0) {
      currentMatchIdx = 0;
      scrollToCurrentMatch();
    }

    updateCounter();
  }

  function navigateResult(direction) {
    if (matchIndices.length === 0) return;

    currentMatchIdx += direction;

    if (currentMatchIdx < 0) {
      currentMatchIdx = matchIndices.length - 1;
    } else if (currentMatchIdx >= matchIndices.length) {
      currentMatchIdx = 0;
    }

    scrollToCurrentMatch();
    updateCounter();
  }

  function scrollToCurrentMatch() {
    if (currentMatchIdx < 0 || currentMatchIdx >= matchIndices.length) return;

    var messageIndex = matchIndices[currentMatchIdx];

    if (virtualScroll) {
      virtualScroll.scrollToIndex(messageIndex, 'smooth');

      // Highlight after scroll settles
      setTimeout(function () {
        highlightCurrentMatch(messageIndex);
      }, 300);
    }
  }

  function highlightCurrentMatch(messageIndex) {
    clearHighlights();

    if (!virtualScroll) return;

    var node = virtualScroll.getRenderedNode(messageIndex);
    if (!node) return;

    // Add highlight class to the message row
    node.classList.add('search-highlight');

    // Highlight matching text within the bubble
    if (query) {
      var textEls = node.querySelectorAll('.message-text, .sender-name');
      for (var i = 0; i < textEls.length; i++) {
        highlightTextInElement(textEls[i], query);
      }
    }

    // Remove highlight after 3 seconds
    setTimeout(function () {
      node.classList.remove('search-highlight');
      removeHighlightMarks(node);
    }, 3000);
  }

  function highlightTextInElement(el, searchTerm) {
    if (!el || !searchTerm) return;

    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var nodesToReplace = [];

    while (walker.nextNode()) {
      var textNode = walker.currentNode;
      var text = textNode.nodeValue;
      var lowerText = text.toLowerCase();
      var idx = lowerText.indexOf(searchTerm);

      if (idx >= 0) {
        nodesToReplace.push({ node: textNode, index: idx });
      }
    }

    // Process in reverse to maintain node references
    for (var i = nodesToReplace.length - 1; i >= 0; i--) {
      var info = nodesToReplace[i];
      var node = info.node;
      var text = node.nodeValue;
      var before = text.substring(0, info.index);
      var match = text.substring(info.index, info.index + searchTerm.length);
      var after = text.substring(info.index + searchTerm.length);

      var fragment = document.createDocumentFragment();

      if (before) {
        fragment.appendChild(document.createTextNode(before));
      }

      var mark = document.createElement('mark');
      mark.className = 'search-match';
      mark.textContent = match;
      fragment.appendChild(mark);

      if (after) {
        fragment.appendChild(document.createTextNode(after));
      }

      node.parentNode.replaceChild(fragment, node);
    }
  }

  function clearHighlights() {
    // Remove all search-highlight classes
    var highlighted = document.querySelectorAll('.search-highlight');
    for (var i = 0; i < highlighted.length; i++) {
      highlighted[i].classList.remove('search-highlight');
      removeHighlightMarks(highlighted[i]);
    }
  }

  function removeHighlightMarks(container) {
    if (!container) return;
    var marks = container.querySelectorAll('mark.search-match');
    for (var i = 0; i < marks.length; i++) {
      var parent = marks[i].parentNode;
      parent.replaceChild(document.createTextNode(marks[i].textContent), marks[i]);
      parent.normalize();
    }
  }

  function updateCounter() {
    if (resultCounter) {
      if (matchIndices.length === 0) {
        if (query && query.length >= 2) {
          resultCounter.textContent = 'No results';
        } else {
          resultCounter.textContent = '';
        }
      } else {
        resultCounter.textContent = (currentMatchIdx + 1) + ' of ' + matchIndices.length;
      }
    }
  }

  // Export
  WaReader.Search = {
    init: init,
    setMessages: setMessages,
    setVirtualScroll: setVirtualScroll,
    open: open,
    close: close,
    isActive: isActive,
  };
})();
