// ============================================================
// AO3 Works — landing hero chat loop (iMessage → WhatsApp → Snapchat → Instagram)
// ------------------------------------------------------------
// iMessage: "you still up?" + draft + "unfortunately" send.
// WhatsApp / Snapchat: same thread, medium crossfades, workskin builders.
// prefers-reduced-motion: static iMessage, no loop.
// ============================================================

(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  var MSG1_HOLD_MS = 900;
  var DRAFT_CHAR_MS = 58;
  var DRAFT_HOLD_MS = 450;
  var MSG2_HOLD_MS = 2200;
  var WA_TYPING_HOLD_MS = 900;
  var TYPING_RESOLVE_MS = 240;
  var WA_AFTER_CALL_MS = 900;
  var TIME_PASSAGE_HOLD_MS = 1900;
  var INCOMING_CALL_MS = 2600;
  var INCOMING_CALL_FADE_MS = 90;
  var WHATSAPP_HOLD_MS = 2400;
  var SNAP_OPEN_MS = 550;
  var SNAP_DRAFT_WHY = 'why did you';
  var SNAP_DELETE_CHAR_MS = 42;
  var SNAP_AFTER_DELETE_MS = 400;
  var SNAP_END_HOLD_MS = 2000;
  var SNAP_CAN_I_SEE_HOLD_MS = 2400;
  var SNAP_955_HOLD_MS = 2800;
  var SNAP_OUTSIDE_TEXT_HOLD_MS = 1900;
  var SNAP_IMAGE_CLOSED_HOLD_MS = 2300;
  var SNAP_IMAGE_OPEN_HOLD_MS = 3400;
  var INSTAGRAM_HOLD_MS = 4200;
  var MEDIUM_CROSSFADE_MS = 70;
  var LOOP_PAUSE_MS = 400;

  var MEDIUMS = {
    imessage: {
      build: 'buildIosPhoneHTML',
      phase: 'imessage',
      label: 'iMessage',
      bodyScrollMode: 'expand',
      draftSelector: '.ios-draft-text',
      bubbleSelector: '.ios-body .ios-msg-block'
    },
    whatsapp: {
      build: 'buildWhatsAppHTML',
      phase: 'whatsapp',
      label: 'WhatsApp',
      bodyScrollMode: 'expand',
      draftSelector: '.wa-draft-text',
      bubbleSelector: '.wa-body .wa-msg'
    },
    snapchat: {
      build: 'buildSnapchatHTML',
      phase: 'snapchat',
      label: 'Snapchat',
      bodyScrollMode: 'scroll',
      draftSelector: '.sc-draft-text',
      bubbleSelector: '.sc-body .sc-msg.sc-text-row'
    },
    instagram: {
      build: 'buildInstagramHTML',
      phase: 'instagram',
      label: 'Instagram'
    }
  };

  function prefersReducedMotion() {
    try {
      return window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function getWorkskin(frame) {
    return frame.querySelector('#workskin');
  }

  function setMediumLabel(frame, text) {
    var label = frame.querySelector('[data-medium-label]');
    if (!label) return;
    if (text) {
      label.textContent = text;
      label.hidden = false;
      label.classList.add('is-visible');
    } else {
      label.textContent = '';
      label.hidden = true;
      label.classList.remove('is-visible');
    }
  }

  function heroCounts() {
    var fic = window.LANDING_FIC;
    var c = fic && fic.heroMessageCounts;
    return {
      imessage: { opener: 1, afterReply: 2 },
      whatsapp: { crossfade: 2, afterCallQuestion: 3, afterRegret: 4 },
      snapchat: { crossfade: 4, afterOk: 5, canISee: 6, outside: 7 },
      snap: c && c.snapchat ? c.snapchat : { crossfade: 4, afterOk: 5, canISee: 6, outside: 7 },
      wa: c && c.whatsapp ? c.whatsapp : { crossfade: 2, afterCallQuestion: 3, afterRegret: 4 }
    };
  }

  function heroReplyText() {
    var fic = window.LANDING_FIC;
    if (fic && fic.messages && fic.messages[1]) {
      return String(fic.messages[1].text || 'unfortunately');
    }
    return 'unfortunately';
  }

  function heroWaExtras(overrides) {
    var fic = window.LANDING_FIC;
    var base = {
      timeBreakLabel: (fic && fic.heroWaTimeBreak) || '9:14 AM'
    };
    overrides = overrides || {};
    var out = {};
    var k;
    for (k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    }
    for (k in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) out[k] = overrides[k];
    }
    return out;
  }

  function loopIsRunning(frame) {
    return frame.isConnected && frame.dataset.heroLoop === 'running';
  }

  function getBubbleNodes(workskin, mediumKey) {
    var cfg = MEDIUMS[mediumKey];
    if (!cfg) return [];
    var nodes = workskin.querySelectorAll(cfg.bubbleSelector);
    if (mediumKey !== 'whatsapp') {
      return Array.prototype.slice.call(nodes);
    }
    return Array.prototype.filter.call(nodes, function (el) {
      return el.querySelector('.wa-bubble') && !el.querySelector('.wa-typing-bubble');
    });
  }

  function renderInstagram(frame, workskin) {
    var fic = window.LANDING_FIC;
    var cfg = MEDIUMS.instagram;
    if (!cfg || !fic || !workskin) return false;
    var builder = window[cfg.build];
    if (typeof builder !== 'function') return false;
    var payload = typeof fic.buildInstagramPayload === 'function'
      ? fic.buildInstagramPayload()
      : fic.buildPayload('instagram', 0);
    if (!payload) return false;
    workskin.innerHTML = builder(payload);
    workskin.classList.add('hero-workskin--stable');
    frame.setAttribute('data-phase', cfg.phase);
    setMediumLabel(frame, cfg.label);
    return true;
  }

  function renderMedium(frame, mediumKey, messageCount, extras) {
    extras = extras || {};
    if (mediumKey === 'instagram') {
      return renderInstagram(frame, workskin);
    }
    var cfg = MEDIUMS[mediumKey];
    var fic = window.LANDING_FIC;
    var workskin = getWorkskin(frame);
    if (!cfg || !fic || !workskin) return false;

    var builder = window[cfg.build];
    if (typeof builder !== 'function') return false;

    var payload = fic.buildPayload(mediumKey, messageCount, extras);
    if (!payload) return false;

    if (cfg.bodyScrollMode) payload.bodyScrollMode = cfg.bodyScrollMode;

    workskin.innerHTML = builder(payload);
    workskin.classList.add('hero-workskin--stable');
    frame.setAttribute('data-phase', cfg.phase);
    setMediumLabel(frame, cfg.label);
    if (mediumKey === 'snapchat' && cfg.bodyScrollMode === 'scroll') {
      var scBody = workskin.querySelector('.snapchat-chat--body-scroll .sc-body');
      if (scBody) {
        if (extras.heroSnapPinBottom) {
          scBody.scrollTop = scBody.scrollHeight;
        } else if (!extras.heroSkipSnapScroll) {
          scBody.scrollTop = scBody.scrollHeight;
          scrollSnapBodyToEnd(workskin, { smooth: false });
        }
      }
    }
    return true;
  }

  function scrollSnapBodyToEnd(workskin, options) {
    options = options || {};
    if (!workskin) return;
    var body = workskin.querySelector('.snapchat-chat--body-scroll .sc-body');
    if (!body) return;

    var smooth = !!options.smooth && !prefersReducedMotion();
    var anchor = options.anchor || null;
    if (!anchor) {
      var nodes = body.querySelectorAll('.sc-msg, .sc-time-break');
      anchor = nodes.length ? nodes[nodes.length - 1] : null;
    }

    var run = function () {
      if (anchor && typeof anchor.scrollIntoView === 'function') {
        try {
          anchor.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' });
          return;
        } catch (_) { /* IE / old WebKit */ }
      }
      body.scrollTop = body.scrollHeight;
    };

    requestAnimationFrame(function () {
      requestAnimationFrame(run);
    });
  }

  function findTypingRow(workskin, mediumKey) {
    if (!workskin) return null;
    if (mediumKey === 'whatsapp') {
      var waDots = workskin.querySelector('.wa-typing-bubble');
      return waDots ? waDots.closest('.wa-msg') : null;
    }
    if (mediumKey === 'imessage') {
      var iosDots = workskin.querySelector('.ios-typing-bubble');
      return iosDots ? iosDots.closest('.ios-msg-block') : null;
    }
    if (mediumKey === 'snapchat') {
      var scDots = workskin.querySelector('.sc-typing-bubble');
      return scDots ? scDots.closest('.sc-msg') : null;
    }
    return null;
  }

  function entranceNewestBubble(workskin, mediumKey, messageCount, options) {
    options = options || {};
    if (!workskin || messageCount < 1) return;
    var blocks = getBubbleNodes(workskin, mediumKey);
    if (!blocks.length) return;

    var enterClass = options.fromTyping ? 'hero-bubble-resolve-enter' : 'hero-bubble-enter';

    blocks.forEach(function (block, i) {
      block.classList.remove(
        'hero-bubble-enter',
        'hero-bubble-resolve-enter',
        'hero-bubble-pending'
      );
      if (i < messageCount - 1) return;
      block.classList.add('hero-bubble-pending');
    });

    var target = blocks[messageCount - 1];
    if (!target) return;
    target.offsetHeight;
    target.classList.remove('hero-bubble-pending');
    target.classList.add(enterClass);
    if (mediumKey === 'snapchat' && !options.skipSnapScroll) {
      scrollSnapBodyToEnd(workskin, { anchor: target, smooth: true });
    }
  }

  function waWithTimeBreak(overrides) {
    return heroWaExtras(Object.assign({ timeBreakAfter: 3 }, overrides || {}));
  }

  function snapWithTimeBreak(overrides) {
    var fic = window.LANDING_FIC;
    var label914 = (fic && fic.heroWaTimeBreak) || '9:14 AM';
    return heroWaExtras(Object.assign({ timeBreaks: [{ after: 3, label: label914 }] }, overrides || {}));
  }

  function snapOutsideExtras(extraTurns, messageCount) {
    var fic = window.LANDING_FIC;
    var count = messageCount == null ? 7 : messageCount;
    var breaks = (fic && typeof fic.snapHeroTimeBreaks === 'function')
      ? fic.snapHeroTimeBreaks(count)
      : [{ after: 3, label: '9:14 AM' }, { after: count >= 7 ? 6 : count, label: '9:55' }];
    var out = { timeBreaks: breaks };
    if (extraTurns && extraTurns.length) out.extraTurns = extraTurns;
    return out;
  }

  function entranceTimeBreak(workskin, options) {
    options = options || {};
    if (!workskin) return;
    var selector = options.medium === 'snapchat' ? '.sc-time-break' : '.wa-time-break';
    var el = null;
    if (options.timeLabel) {
      var nodes = workskin.querySelectorAll(selector);
      for (var i = 0; i < nodes.length; i++) {
        if ((nodes[i].textContent || '').indexOf(options.timeLabel) >= 0) {
          el = nodes[i];
          break;
        }
      }
    } else if (options.last) {
      var list = workskin.querySelectorAll(selector);
      el = list.length ? list[list.length - 1] : null;
    } else {
      el = workskin.querySelector(selector);
    }
    if (!el) return;
    el.classList.remove('hero-time-break-enter', 'hero-time-break-theatrical');
    el.offsetHeight;
    el.classList.add(options.theatrical ? 'hero-time-break-theatrical' : 'hero-time-break-enter');
    if (options.medium === 'snapchat' && !options.skipSnapScroll) {
      scrollSnapBodyToEnd(workskin, { anchor: el, smooth: true });
    }
  }

  function entranceSnapStatus(workskin, options) {
    options = options || {};
    if (!workskin) return;
    var rows = workskin.querySelectorAll('.sc-body .sc-status.sc-in');
    if (!rows.length) return;
    var target = rows[rows.length - 1];
    target.classList.remove('hero-sc-status-enter');
    target.offsetHeight;
    target.classList.add('hero-sc-status-enter');
    if (!options.skipSnapScroll) {
      scrollSnapBodyToEnd(workskin, { anchor: target, smooth: true });
    }
  }

  /** After Received status: patch in saved image and expand (no full re-render). */
  function expandSnapOutsideImage(workskin, fic) {
    if (!workskin) return;
    var body = workskin.querySelector('.snapchat-chat--body-scroll .sc-body');
    if (!body) return;

    var statuses = body.querySelectorAll('.sc-status.sc-in');
    var status = statuses.length ? statuses[statuses.length - 1] : null;
    if (status) {
      status.innerHTML =
        '<span class="sc-icon-hollow-square sc-status-icon" aria-hidden="true"></span>' +
        '<span>Opened</span>';
    }

    if (body.querySelector('.hero-sc-snap-image-expand')) return;

    var url = (fic && fic.heroSnapOutsideImageUrl) || './assets/landing-snap-outside.jpg';
    var row = document.createElement('div');
    row.className = 'sc-msg sc-in sc-msg-saved-image sc-msg-media-row hero-sc-snap-image-expand';
    row.innerHTML =
      '<span class="sc-rail sc-rail-photo" aria-hidden="true"></span>' +
      '<div class="sc-image-container sc-saved-in">' +
      '<img src="' + url + '" class="sc-snap-img responsive-img" alt="View from outside at the door">' +
      '<span class="sc-meta">Viewed</span>' +
      '</div>';
    body.appendChild(row);

    var container = row.querySelector('.sc-image-container');
    var pinBottom = function () {
      body.scrollTop = body.scrollHeight;
    };

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        row.classList.add('hero-sc-snap-image-expand--open');
        pinBottom();
        if (!container) return;
        var onEnd = function (e) {
          if (e.propertyName !== 'max-height') return;
          container.removeEventListener('transitionend', onEnd);
          pinBottom();
        };
        container.addEventListener('transitionend', onEnd);
      });
    });
  }

  function getCallOverlay(frame) {
    return frame.querySelector('[data-hero-call-overlay]');
  }

  /** Incoming call screen before the 9:14 AM stamp */
  async function playIncomingCall(frame, workskin) {
    var overlay = getCallOverlay(frame);
    renderMedium(frame, 'whatsapp', 3, {});
    showWorkskin(workskin);

    if (!overlay) {
      await sleep(INCOMING_CALL_MS);
      return;
    }

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.remove('hero-call-overlay--out');
    overlay.classList.add('hero-call-overlay--in');

    var hold = prefersReducedMotion() ? 1200 : INCOMING_CALL_MS;
    await sleep(hold);
    if (!loopIsRunning(frame)) return;

    overlay.classList.remove('hero-call-overlay--in');
    overlay.classList.add('hero-call-overlay--out');
    await sleep(INCOMING_CALL_FADE_MS);
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('hero-call-overlay--out');
  }

  /** Pause after call — dim thread, stamp 9:14 AM so time clearly passed */
  async function playWaTimePassage(frame, workskin) {
    var chat = workskin.querySelector('.whatsapp-chat');
    if (chat) chat.classList.add('hero-wa-time-passage');

    renderMedium(frame, 'whatsapp', 3, waWithTimeBreak());
    clearBubbleMotion(workskin, 'whatsapp');
    entranceTimeBreak(workskin, { theatrical: true });

    await sleep(TIME_PASSAGE_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    if (chat) chat.classList.remove('hero-wa-time-passage');
  }

  async function resolveTypingToMessage(frame, workskin, mediumKey, messageCount, extras) {
    extras = extras || {};
    if (!prefersReducedMotion()) {
      var typingRow = findTypingRow(workskin, mediumKey);
      if (typingRow) {
        typingRow.classList.add('hero-typing-resolve');
        await sleep(TYPING_RESOLVE_MS);
        if (!loopIsRunning(frame)) return;
      }
    }

    renderMedium(frame, mediumKey, messageCount, extras);
    clearBubbleMotion(workskin, mediumKey);
    entranceNewestBubble(workskin, mediumKey, messageCount, { fromTyping: true });
  }

  async function typeComposerDraft(frame, workskin, mediumKey, text) {
    var cfg = MEDIUMS[mediumKey];
    if (!cfg) return;
    var draftEl = workskin.querySelector(cfg.draftSelector);
    if (!draftEl) return;

    draftEl.textContent = '';
    for (var i = 1; i <= text.length; i++) {
      if (!loopIsRunning(frame)) return;
      draftEl.textContent = text.slice(0, i);
      await sleep(DRAFT_CHAR_MS);
    }
  }

  async function clearComposerDraft(frame, workskin, mediumKey, charMs) {
    var cfg = MEDIUMS[mediumKey];
    if (!cfg) return;
    var draftEl = workskin.querySelector(cfg.draftSelector);
    if (!draftEl) return;

    var text = draftEl.textContent || '';
    var step = charMs == null ? SNAP_DELETE_CHAR_MS : charMs;
    for (var i = text.length; i >= 0; i--) {
      if (!loopIsRunning(frame)) return;
      draftEl.textContent = text.slice(0, i);
      if (i > 0) await sleep(step);
    }
  }

  function clearBubbleMotion(workskin, mediumKey) {
    getBubbleNodes(workskin, mediumKey).forEach(function (b) {
      b.classList.remove('hero-bubble-pending', 'hero-bubble-enter');
    });
  }

  function showWorkskin(workskin) {
    if (!workskin) return;
    workskin.classList.remove('hero-workskin--out');
  }

  function hideWorkskin(workskin) {
    if (!workskin) return;
    workskin.classList.add('hero-workskin--out');
  }

  async function crossfadeMedium(frame, workskin, mediumKey, messageCount, extras) {
    var count = messageCount == null ? 1 : messageCount;
    hideWorkskin(workskin);
    await sleep(MEDIUM_CROSSFADE_MS);
    if (!loopIsRunning(frame)) return;

    renderMedium(frame, mediumKey, count, extras || {});
    clearBubbleMotion(workskin, mediumKey);
    workskin.offsetHeight;
    showWorkskin(workskin);
  }

  /** WhatsApp: 2 msgs → can I call? → (time passes) 9:14 AM → regret */
  async function playWhatsAppBeat(frame, workskin) {
    var n = heroCounts().wa;
    await crossfadeMedium(frame, workskin, 'whatsapp', n.crossfade);
    if (!loopIsRunning(frame)) return;
    await sleep(450);
    if (!loopIsRunning(frame)) return;

    renderMedium(frame, 'whatsapp', n.crossfade, { recipientTyping: true });
    await sleep(WA_TYPING_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    await resolveTypingToMessage(frame, workskin, 'whatsapp', n.afterCallQuestion, {});
    if (!loopIsRunning(frame)) return;
    await sleep(WA_AFTER_CALL_MS);
    if (!loopIsRunning(frame)) return;

    await playIncomingCall(frame, workskin);
    if (!loopIsRunning(frame)) return;

    await playWaTimePassage(frame, workskin);
    if (!loopIsRunning(frame)) return;

    renderMedium(frame, 'whatsapp', n.afterCallQuestion, waWithTimeBreak({ recipientTyping: true }));
    await sleep(WA_TYPING_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    await resolveTypingToMessage(frame, workskin, 'whatsapp', n.afterRegret, waWithTimeBreak());
    if (!loopIsRunning(frame)) return;
    await sleep(WHATSAPP_HOLD_MS);
  }

  /** Snapchat: thread → composer types "why did you" → backspace → type/send "ok" (outbound) */
  async function playSnapchatBeat(frame, workskin) {
    var overlay = getCallOverlay(frame);
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.classList.remove('hero-call-overlay--in');
    }

    var snap = snapWithTimeBreak();
    var sn = heroCounts().snap;

    await crossfadeMedium(frame, workskin, 'snapchat', sn.crossfade, snap);
    if (!loopIsRunning(frame)) return;
    await sleep(SNAP_OPEN_MS);
    if (!loopIsRunning(frame)) return;

    renderMedium(frame, 'snapchat', sn.crossfade, snap);
    await typeComposerDraft(frame, workskin, 'snapchat', SNAP_DRAFT_WHY);
    if (!loopIsRunning(frame)) return;
    await sleep(DRAFT_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    await clearComposerDraft(frame, workskin, 'snapchat');
    if (!loopIsRunning(frame)) return;
    await sleep(SNAP_AFTER_DELETE_MS);
    if (!loopIsRunning(frame)) return;

    renderMedium(frame, 'snapchat', sn.crossfade, snap);
    await typeComposerDraft(frame, workskin, 'snapchat', 'ok');
    if (!loopIsRunning(frame)) return;
    await sleep(DRAFT_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    renderMedium(frame, 'snapchat', sn.afterOk, snap);
    entranceNewestBubble(workskin, 'snapchat', sn.afterOk);
    if (!loopIsRunning(frame)) return;
    await sleep(SNAP_END_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    await playSnap955OutsideBeat(frame, workskin);
  }

  /** After "ok": can i see you → 9:55 → outside text → snap receive → open */
  async function playSnap955OutsideBeat(frame, workskin) {
    var fic = window.LANDING_FIC;
    var sn = heroCounts().snap;

    renderMedium(frame, 'snapchat', sn.canISee, snapWithTimeBreak());
    clearBubbleMotion(workskin, 'snapchat');
    entranceNewestBubble(workskin, 'snapchat', sn.canISee);
    await sleep(SNAP_CAN_I_SEE_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    var chat = workskin.querySelector('.snapchat-chat');
    if (chat) chat.classList.add('hero-sc-time-passage');

    renderMedium(frame, 'snapchat', sn.canISee, snapOutsideExtras(null, sn.canISee));
    clearBubbleMotion(workskin, 'snapchat');
    entranceTimeBreak(workskin, {
      medium: 'snapchat',
      timeLabel: (fic && fic.heroSnapTime955) || '9:55',
      theatrical: true
    });
    await sleep(SNAP_955_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    if (chat) chat.classList.remove('hero-sc-time-passage');

    renderMedium(frame, 'snapchat', sn.outside, snapOutsideExtras(null, sn.outside));
    clearBubbleMotion(workskin, 'snapchat');
    entranceNewestBubble(workskin, 'snapchat', sn.outside);
    await sleep(SNAP_OUTSIDE_TEXT_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    var receivedTurns = (fic && typeof fic.snapOutsideExtraTurns === 'function')
      ? fic.snapOutsideExtraTurns(false)
      : [];
    renderMedium(frame, 'snapchat', sn.outside, Object.assign(
      snapOutsideExtras(receivedTurns, sn.outside),
      { heroSkipSnapScroll: true }
    ));
    entranceSnapStatus(workskin);
    await sleep(SNAP_IMAGE_CLOSED_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    expandSnapOutsideImage(workskin, fic);
    await sleep(SNAP_IMAGE_OPEN_HOLD_MS);
  }

  /** Crossfade to Instagram post after snap is opened */
  async function playInstagramBeat(frame, workskin) {
    hideWorkskin(workskin);
    await sleep(MEDIUM_CROSSFADE_MS);
    if (!loopIsRunning(frame)) return;

    renderInstagram(frame, workskin);
    workskin.offsetHeight;
    showWorkskin(workskin);
    await sleep(INSTAGRAM_HOLD_MS);
  }

  async function fadeOutWorkskin(workskin) {
    hideWorkskin(workskin);
    await sleep(MEDIUM_CROSSFADE_MS);
  }

  async function playTwoMessageBeat(frame, workskin, mediumKey, options) {
    options = options || {};
    showWorkskin(workskin);
    if (!options.skipFirstRender) {
      renderMedium(frame, mediumKey, 1);
    }
    entranceNewestBubble(workskin, mediumKey, 1);
    await sleep(MSG1_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    var replyText = heroReplyText();
    renderMedium(frame, mediumKey, 1, { draftText: '' });
    await typeComposerDraft(frame, workskin, mediumKey, replyText);
    if (!loopIsRunning(frame)) return;
    await sleep(DRAFT_HOLD_MS);
    if (!loopIsRunning(frame)) return;

    renderMedium(frame, mediumKey, 2);
    entranceNewestBubble(workskin, mediumKey, 2);
    await sleep(MSG2_HOLD_MS);
  }

  function showStaticYesterday(frame) {
    renderMedium(frame, 'imessage', 2);
    var workskin = getWorkskin(frame);
    if (!workskin) return;
    showWorkskin(workskin);
    getBubbleNodes(workskin, 'imessage').forEach(function (b) {
      b.classList.remove('hero-bubble-pending', 'hero-bubble-enter');
    });
  }

  async function loopHeroChat(frame) {
    var workskin = getWorkskin(frame);
    if (!workskin) return;

    frame.dataset.heroLoop = 'running';
    showWorkskin(workskin);

    while (loopIsRunning(frame)) {
      await playTwoMessageBeat(frame, workskin, 'imessage');
      if (!loopIsRunning(frame)) break;

      await playWhatsAppBeat(frame, workskin);
      if (!loopIsRunning(frame)) break;

      await playSnapchatBeat(frame, workskin);
      if (!loopIsRunning(frame)) break;

      await playInstagramBeat(frame, workskin);
      if (!loopIsRunning(frame)) break;

      await fadeOutWorkskin(workskin);
      if (!loopIsRunning(frame)) break;
      await sleep(LOOP_PAUSE_MS);
    }
  }

  function init() {
    var frames = document.querySelectorAll('[data-iphone-hero]');
    if (!frames.length) return;

    Array.prototype.forEach.call(frames, showStaticYesterday);

    if (prefersReducedMotion()) {
      return;
    }

    function startLoop(target) {
      if (target.dataset.heroLoop === 'running') return;
      requestAnimationFrame(function () {
        loopHeroChat(target).catch(function () { /* ignore */ });
      });
    }

    if (typeof IntersectionObserver !== 'function') {
      Array.prototype.forEach.call(frames, startLoop);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var target = entry.target;
        if (entry.isIntersecting) {
          startLoop(target);
          return;
        }
        delete target.dataset.heroLoop;
      });
    }, { threshold: 0.25 });

    Array.prototype.forEach.call(frames, function (f) { io.observe(f); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
