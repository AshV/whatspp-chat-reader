/**
 * WhatsApp Chat Reader — Virtual Scroll
 * Handles 40,000+ messages without lag using DOM recycling
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};
  var CONFIG = WaReader.CONFIG;
  var Utils = WaReader.Utils;

  /**
   * @constructor
   * @param {HTMLElement} viewport - The scrollable container
   * @param {Array} items - All items (messages + date separators)
   * @param {Function} renderFn - Function(item, index) → HTMLElement
   * @param {Object} options - { buffer, onScrollChange }
   */
  function VirtualScroll(viewport, items, renderFn, options) {
    this.viewport = viewport;
    this.items = items || [];
    this.renderFn = renderFn;
    this.buffer = (options && options.buffer) || CONFIG.VIRTUAL_SCROLL_BUFFER;
    this.onScrollChange = (options && options.onScrollChange) || null;

    // Height cache: measured actual heights
    this.heightCache = {};
    // Total estimated height
    this.totalHeight = 0;
    // Offset cache for each item
    this.offsetCache = [];

    // Current rendered range
    this.startIndex = 0;
    this.endIndex = 0;

    // DOM elements
    this.spacer = null;
    this.content = null;

    // Rendered nodes map: index → DOM node
    this.renderedNodes = {};

    // Scroll tracking
    this._scrollRAF = null;
    this._bound_onScroll = this._onScroll.bind(this);
    this._isDestroyed = false;

    this._init();
  }

  VirtualScroll.prototype._estimateHeight = function (item) {
    if (!item) return CONFIG.VIRTUAL_SCROLL_ITEM_HEIGHT;

    var type = item._type || item.type || 'text';

    switch (type) {
      case 'date_separator':
        return 36;
      case 'system':
        return 42;
      case 'image':
      case 'gif':
        return 280;
      case 'video':
        return 280;
      case 'audio':
        return 65;
      case 'audio_note':
      case 'ptt':
        return 65;
      case 'video_note':
        return 220;
      case 'document':
        return 75;
      default: // text
        var text = item.text || item.body || '';
        var base = 52;
        if (text.length > 100) {
          base += Math.ceil((text.length - 100) / 60) * 20;
        }
        return Math.min(base, 400); // cap
    }
  };

  VirtualScroll.prototype._computeOffsets = function () {
    this.offsetCache = new Array(this.items.length);
    var offset = 0;
    for (var i = 0; i < this.items.length; i++) {
      this.offsetCache[i] = Math.round(offset);
      var h = this.heightCache[i];
      if (h === undefined) {
        h = this._estimateHeight(this.items[i]);
      }
      offset += Math.round(h);
    }
    this.totalHeight = Math.round(offset);
  };

  VirtualScroll.prototype._init = function () {
    // Create spacer div
    this.spacer = document.createElement('div');
    this.spacer.className = 'virtual-scroll-spacer';

    // Create content container
    this.content = document.createElement('div');
    this.content.className = 'virtual-scroll-content';

    this.spacer.appendChild(this.content);
    this.viewport.appendChild(this.spacer);

    // Compute initial offsets
    this._computeOffsets();
    this.spacer.style.height = this.totalHeight + 'px';

    // Listen to scroll
    this.viewport.addEventListener('scroll', this._bound_onScroll, { passive: true });

    // Initial render
    this._renderVisible();
  };

  VirtualScroll.prototype._onScroll = function () {
    if (this._isDestroyed) return;

    if (this._scrollRAF) {
      cancelAnimationFrame(this._scrollRAF);
    }

    var self = this;
    this._scrollRAF = requestAnimationFrame(function () {
      self._renderVisible();

      // Notify scroll position
      if (self.onScrollChange) {
        var scrollTop = self.viewport.scrollTop;
        var viewportHeight = self.viewport.clientHeight;
        var scrollBottom = self.totalHeight - scrollTop - viewportHeight;
        self.onScrollChange({
          scrollTop: scrollTop,
          scrollBottom: scrollBottom,
          isAtBottom: scrollBottom < 100,
          totalHeight: self.totalHeight,
        });
      }
    });
  };

  VirtualScroll.prototype._findStartIndex = function (scrollTop) {
    // Binary search for the first item visible
    var low = 0;
    var high = this.items.length - 1;

    while (low <= high) {
      var mid = (low + high) >>> 1;
      var offset = this.offsetCache[mid];
      var h = this.heightCache[mid] || this._estimateHeight(this.items[mid]);

      if (offset + h <= scrollTop) {
        low = mid + 1;
      } else if (offset > scrollTop) {
        high = mid - 1;
      } else {
        return mid;
      }
    }

    return Math.max(0, low);
  };

  VirtualScroll.prototype._renderVisible = function () {
    if (this._isDestroyed || this.items.length === 0) return;

    var scrollTop = this.viewport.scrollTop;
    var viewportHeight = this.viewport.clientHeight;

    // Find visible range
    var visibleStart = this._findStartIndex(scrollTop);
    var newStart = Math.max(0, visibleStart - this.buffer);

    var visibleEnd = visibleStart;
    var accum = this.offsetCache[visibleStart] || 0;
    while (visibleEnd < this.items.length && accum < scrollTop + viewportHeight) {
      var h = this.heightCache[visibleEnd] || this._estimateHeight(this.items[visibleEnd]);
      accum += h;
      visibleEnd++;
    }

    var newEnd = Math.min(this.items.length - 1, visibleEnd + this.buffer);

    // Skip if range hasn't changed
    if (newStart === this.startIndex && newEnd === this.endIndex && Object.keys(this.renderedNodes).length > 0) {
      return;
    }

    // Remove out-of-range nodes
    var existingKeys = Object.keys(this.renderedNodes);
    for (var k = 0; k < existingKeys.length; k++) {
      var idx = parseInt(existingKeys[k], 10);
      if (idx < newStart || idx > newEnd) {
        var node = this.renderedNodes[idx];
        if (node && node.parentNode) {
          node.parentNode.removeChild(node);
        }
        delete this.renderedNodes[idx];
      }
    }

    // Add new nodes
    var fragment = document.createDocumentFragment();
    var needsReflow = false;

    for (var i = newStart; i <= newEnd; i++) {
      if (!this.renderedNodes[i]) {
        var el = this.renderFn(this.items[i], i);
        if (el) {
          el.setAttribute('data-vs-index', i);
          el.style.position = 'absolute';
          el.style.left = '0';
          el.style.right = '0';
          el.style.top = Math.round(this.offsetCache[i]) + 'px';
          this.renderedNodes[i] = el;
          fragment.appendChild(el);
          needsReflow = true;
        }
      } else {
        // Update position in case offsets changed
        this.renderedNodes[i].style.top = Math.round(this.offsetCache[i]) + 'px';
      }
    }

    if (fragment.childNodes.length > 0) {
      this.content.appendChild(fragment);
    }

    this.startIndex = newStart;
    this.endIndex = newEnd;

    // Measure actual heights after render
    if (needsReflow) {
      this._measureAndCorrect();
    }
  };

  VirtualScroll.prototype._measureAndCorrect = function () {
    var changed = false;
    var keys = Object.keys(this.renderedNodes);

    for (var k = 0; k < keys.length; k++) {
      var idx = parseInt(keys[k], 10);
      var node = this.renderedNodes[idx];
      if (!node) continue;

      var rect = node.getBoundingClientRect();
      var actualHeight = Math.round(rect.height || node.offsetHeight);
      if (actualHeight > 0 && this.heightCache[idx] !== actualHeight) {
        this.heightCache[idx] = actualHeight;
        changed = true;
      }
    }

    if (changed) {
      this._computeOffsets();
      this.spacer.style.height = this.totalHeight + 'px';

      // Re-position rendered nodes
      for (var j = 0; j < keys.length; j++) {
        var i = parseInt(keys[j], 10);
        if (this.renderedNodes[i]) {
          this.renderedNodes[i].style.top = Math.round(this.offsetCache[i]) + 'px';
        }
      }
    }
  };

  /**
   * Scroll to a specific item by index
   */
  VirtualScroll.prototype.scrollToIndex = function (index, behavior) {
    if (index < 0 || index >= this.items.length) return;

    var offset = this.offsetCache[index] || 0;
    this.viewport.scrollTo({
      top: offset,
      behavior: behavior || 'auto',
    });
  };

  /**
   * Scroll to a specific message by ID
   */
  VirtualScroll.prototype.scrollToMessage = function (messageId) {
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].id === messageId) {
        this.scrollToIndex(i, 'smooth');
        return i;
      }
    }
    return -1;
  };

  /**
   * Scroll to the bottom of all content
   */
  VirtualScroll.prototype.scrollToBottom = function (smooth) {
    this.viewport.scrollTo({
      top: this.totalHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  /**
   * Get the rendered DOM node for an item index
   */
  VirtualScroll.prototype.getRenderedNode = function (index) {
    return this.renderedNodes[index] || null;
  };

  /**
   * Update items and re-render
   */
  VirtualScroll.prototype.setItems = function (newItems) {
    this.items = newItems || [];
    this.heightCache = {};
    this.renderedNodes = {};
    this.content.innerHTML = '';
    this._computeOffsets();
    this.spacer.style.height = this.totalHeight + 'px';
    this._renderVisible();
  };

  /**
   * Force re-render of currently visible items
   */
  VirtualScroll.prototype.refresh = function () {
    // Clear rendered
    var keys = Object.keys(this.renderedNodes);
    for (var k = 0; k < keys.length; k++) {
      var node = this.renderedNodes[keys[k]];
      if (node && node.parentNode) node.parentNode.removeChild(node);
    }
    this.renderedNodes = {};
    this.startIndex = 0;
    this.endIndex = 0;
    this._renderVisible();
  };

  /**
   * Destroy and clean up
   */
  VirtualScroll.prototype.destroy = function () {
    this._isDestroyed = true;

    if (this._scrollRAF) {
      cancelAnimationFrame(this._scrollRAF);
    }

    this.viewport.removeEventListener('scroll', this._bound_onScroll);

    if (this.spacer && this.spacer.parentNode) {
      this.spacer.parentNode.removeChild(this.spacer);
    }

    this.renderedNodes = {};
    this.heightCache = {};
    this.items = [];
    this.spacer = null;
    this.content = null;
  };

  // Export
  WaReader.VirtualScroll = VirtualScroll;
})();
