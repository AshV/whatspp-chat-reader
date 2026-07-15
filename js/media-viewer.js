/**
 * WhatsApp Chat Reader — Media Viewer
 * Full-screen overlay for images and videos with zoom, swipe, and keyboard nav
 */
(function () {
  'use strict';

  var WaReader = window.WaReader = window.WaReader || {};

  var overlay = null;
  var mediaContainer = null;
  var counterEl = null;

  var allMedia = [];
  var currentIndex = 0;
  var currentScale = 1;
  var startX = 0;
  var startY = 0;
  var isDragging = false;
  var translateX = 0;
  var translateY = 0;

  // Touch pinch state
  var initialPinchDistance = 0;
  var initialScale = 1;

  function createOverlay() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'media-viewer';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Media viewer');
    overlay.innerHTML =
      '<div class="media-viewer-header">' +
        '<span class="media-viewer-counter"></span>' +
        '<button class="media-viewer-close" aria-label="Close">' +
          '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="white"/></svg>' +
        '</button>' +
      '</div>' +
      '<button class="media-viewer-nav media-viewer-prev" aria-label="Previous">' +
        '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="white"/></svg>' +
      '</button>' +
      '<div class="media-viewer-content"></div>' +
      '<button class="media-viewer-nav media-viewer-next" aria-label="Next">' +
        '<svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="white"/></svg>' +
      '</button>';

    var closeBtn = overlay.querySelector('.media-viewer-close');
    mediaContainer = overlay.querySelector('.media-viewer-content');
    counterEl = overlay.querySelector('.media-viewer-counter');

    var prevBtn = overlay.querySelector('.media-viewer-prev');
    var nextBtn = overlay.querySelector('.media-viewer-next');

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function () { navigate(-1); });
    nextBtn.addEventListener('click', function () { navigate(1); });

    // Click backdrop to close
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target === mediaContainer) {
        close();
      }
    });

    // Keyboard controls
    document.addEventListener('keydown', function (e) {
      if (!overlay || overlay.style.display !== 'flex') return;
      switch (e.key) {
        case 'Escape': close(); break;
        case 'ArrowLeft': navigate(-1); break;
        case 'ArrowRight': navigate(1); break;
      }
    });

    // Mouse wheel zoom
    mediaContainer.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.15 : 0.15;
      currentScale = Math.max(0.5, Math.min(5, currentScale + delta));
      applyTransform();
    }, { passive: false });

    // Touch events for swipe and pinch
    mediaContainer.addEventListener('touchstart', onTouchStart, { passive: false });
    mediaContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    mediaContainer.addEventListener('touchend', onTouchEnd);

    // Mouse drag for panning when zoomed
    mediaContainer.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    document.body.appendChild(overlay);
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      initialPinchDistance = getPinchDistance(e.touches);
      initialScale = currentScale;
    } else if (e.touches.length === 1) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 2) {
      var dist = getPinchDistance(e.touches);
      currentScale = Math.max(0.5, Math.min(5, initialScale * (dist / initialPinchDistance)));
      applyTransform();
    } else if (e.touches.length === 1 && isDragging) {
      if (currentScale > 1) {
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        translateX += dx;
        translateY += dy;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        applyTransform();
      }
    }
  }

  function onTouchEnd(e) {
    if (isDragging && currentScale <= 1 && e.changedTouches.length === 1) {
      var endX = e.changedTouches[0].clientX;
      var dx = endX - startX;
      if (Math.abs(dx) > 60) {
        navigate(dx > 0 ? -1 : 1);
      }
    }
    isDragging = false;
  }

  function onMouseDown(e) {
    if (currentScale > 1) {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    }
  }

  function onMouseMove(e) {
    if (isDragging && currentScale > 1) {
      translateX += e.clientX - startX;
      translateY += e.clientY - startY;
      startX = e.clientX;
      startY = e.clientY;
      applyTransform();
    }
  }

  function onMouseUp() {
    isDragging = false;
  }

  function getPinchDistance(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function applyTransform() {
    var el = mediaContainer.querySelector('img, video');
    if (el) {
      el.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + currentScale + ')';
      if (currentScale > 1) {
        el.classList.add('zoomed');
      } else {
        el.classList.remove('zoomed');
      }
    }
  }

  function resetTransform() {
    currentScale = 1;
    translateX = 0;
    translateY = 0;
  }

  /**
   * Open the media viewer
   */
  function open(url, type, mediaList, startIndex) {
    createOverlay();

    if (mediaList && mediaList.length > 0) {
      allMedia = mediaList;
      currentIndex = startIndex || 0;
    } else {
      allMedia = [{ url: url, type: type || 'image' }];
      currentIndex = 0;
    }

    showMedia(currentIndex);
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function () {
      overlay.classList.add('active');
    });
  }

  function showMedia(index) {
    if (index < 0 || index >= allMedia.length) return;

    currentIndex = index;
    resetTransform();
    mediaContainer.innerHTML = '';

    var item = allMedia[index];
    var el;

    if (item.type === 'video') {
      el = document.createElement('video');
      el.src = item.url;
      el.controls = true;
      el.autoplay = true;
      el.playsInline = true;
    } else {
      el = document.createElement('img');
      el.src = item.url;
      el.alt = 'Media ' + (index + 1);
      el.draggable = false;

      el.addEventListener('dblclick', function () {
        if (currentScale > 1) {
          resetTransform();
        } else {
          currentScale = 2.5;
        }
        applyTransform();
      });
    }

    mediaContainer.appendChild(el);
    updateCounter();
    updateNavVisibility();
  }

  function navigate(direction) {
    var newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < allMedia.length) {
      showMedia(newIndex);
    }
  }

  function updateCounter() {
    if (counterEl) {
      if (allMedia.length > 1) {
        counterEl.textContent = (currentIndex + 1) + ' of ' + allMedia.length;
        counterEl.style.display = 'inline';
      } else {
        counterEl.style.display = 'none';
      }
    }
  }

  function updateNavVisibility() {
    var prevBtn = overlay.querySelector('.media-viewer-prev');
    var nextBtn = overlay.querySelector('.media-viewer-next');
    if (prevBtn) prevBtn.style.display = allMedia.length > 1 && currentIndex > 0 ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = allMedia.length > 1 && currentIndex < allMedia.length - 1 ? 'flex' : 'none';
  }

  function close() {
    if (!overlay) return;

    var video = overlay.querySelector('video');
    if (video) {
      video.pause();
      video.src = '';
    }

    overlay.classList.remove('active');
    setTimeout(function () {
      overlay.style.display = 'none';
      mediaContainer.innerHTML = '';
      document.body.style.overflow = '';
      allMedia = [];
      currentIndex = 0;
      resetTransform();
    }, 200);
  }

  function isOpen() {
    return overlay && overlay.style.display === 'flex';
  }

  // Export
  WaReader.MediaViewer = {
    open: open,
    close: close,
    isOpen: isOpen,
  };
})();
