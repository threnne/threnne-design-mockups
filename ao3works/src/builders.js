// ============================================================
// AO3 STUDIO — builders.js (The Sacred HTML Contract)
// ============================================================
// Responsibilities: Take JSON data and return AO3-compliant HTML.
// This file loads BEFORE TipTap, attaching functions to the global window.
(function() {
  
  window.escapeHTML = function(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  const esc = window.escapeHTML;

  /** Direct image URL only — rejects Postimages gallery pages (HTML, not an image). */
  window.normalizeSkinImageUrl = function (url) {
    const s = String(url || '').trim();
    if (!s) return '';
    if (/^https?:\/\/(?:www\.)?postimg\.cc\/[^/]+$/i.test(s) && !/i\.postimg\.cc/i.test(s)) {
      return '';
    }
    return s;
  };
  const normSkinImg = window.normalizeSkinImageUrl;

  const ID_LOCAL = 'p_local';
  const ID_REMOTE = 'p_remote';

  function participantLabelMap(participants) {
    const m = {};
    (participants || []).forEach(p => {
      if (p && p.id != null) m[p.id] = String(p.label || '').trim() || String(p.id);
    });
    return m;
  }

  /** Collapse to fixed p_local / p_remote for two-person convo skins (UI + export consistency). */
  function canonicalizeBinaryParticipants(participants, localSpeakerId, defaultRemoteLabel) {
    const loc = (participants || []).find(p => p && p.id === localSpeakerId)
      || (participants || [])[0]
      || { id: ID_LOCAL, label: 'You' };
    const rem = (participants || []).find(p => p && p.id !== loc.id)
      || (participants || [])[1]
      || { id: ID_REMOTE, label: defaultRemoteLabel || 'Them' };
    const oldLoc = String(loc.id || '').trim() || ID_LOCAL;
    const defRem = String(defaultRemoteLabel || '').trim() || 'Them';
    return {
      participants: [
        { id: ID_LOCAL, label: String(loc.label || '').trim() || 'You' },
        { id: ID_REMOTE, label: String(rem.label || '').trim() || defRem }
      ],
      localSpeakerId: ID_LOCAL,
      mapSpeaker(sid) {
        const s = sid != null ? String(sid) : '';
        if (s === oldLoc || s === ID_LOCAL) return ID_LOCAL;
        return ID_REMOTE;
      }
    };
  }

  function isLegacyIosItem(it) {
    if (!it || it.kind === 'typing') return false;
    if (it.speakerId != null && String(it.speakerId) !== '') return false;
    return it.side === 'sent' || it.side === 'received' || it.side === 'right';
  }

  window.normalizeIosPhoneData = function(data) {
    data = data || {};
    const contactFromField = String(data.contactName || '').trim();
    const draftText = data.draftText != null ? String(data.draftText) : '';
    let recipientTyping = !!data.recipientTyping;
    let participants = Array.isArray(data.participants)
      ? data.participants.map(p => ({
        id: String(p.id || '').trim() || ID_REMOTE,
        label: p.label != null ? String(p.label) : ''
      }))
      : [];
    let localSpeakerId = data.localSpeakerId != null ? String(data.localSpeakerId) : '';
    let items = Array.isArray(data.items) ? data.items.map(it => Object.assign({}, it)) : [];

    items.forEach(it => {
      if (it && it.kind === 'typing') recipientTyping = true;
    });
    items = items.filter(it => !it || it.kind !== 'typing');

    const contact = contactFromField || (participants[1] && String(participants[1].label || '').trim()) || 'Contact';

    const hasAnySpeakerId = items.some(it => it && it.speakerId != null && String(it.speakerId) !== '');
    const isLegacy = items.some(isLegacyIosItem) && !hasAnySpeakerId;

    if (isLegacy) {
      participants = [
        { id: ID_LOCAL, label: 'You' },
        { id: ID_REMOTE, label: contact }
      ];
      localSpeakerId = ID_LOCAL;
      items = items.map(it => {
        const sent = it.side === 'sent' || it.side === 'right';
        const sr = it.speaker != null ? String(it.speaker).trim() : '';
        return {
          kind: 'message',
          speakerId: sent ? ID_LOCAL : ID_REMOTE,
          text: it.text != null ? String(it.text) : '',
          delivery: it.delivery === 'sms' ? 'sms' : 'imessage',
          readReceipt: !!it.readReceipt,
          srLabel: sr
        };
      });
    } else {
      if (participants.length < 2) {
        participants = [
          { id: ID_LOCAL, label: 'You' },
          { id: ID_REMOTE, label: contact }
        ];
      }
      if (!localSpeakerId || !participants.some(p => p.id === localSpeakerId)) {
        localSpeakerId = participants[0] ? participants[0].id : ID_LOCAL;
      }
      if (participants.length > 2) {
        const localP = participants.find(p => p.id === localSpeakerId) || participants[0];
        const remoteP = participants.find(p => p.id !== localP.id) || participants[1];
        participants = [localP, remoteP];
        localSpeakerId = localP.id;
      }
      items = items.map(it => {
        const delivery = it.delivery === 'sms' ? 'sms' : 'imessage';
        const rr = !!it.readReceipt && delivery === 'imessage';
        return {
          kind: 'message',
          speakerId: it.speakerId != null ? String(it.speakerId) : ((participants[1] && participants[1].id) || ID_REMOTE),
          text: it.text != null ? String(it.text) : '',
          delivery,
          readReceipt: rr,
          srLabel: it.srLabel != null ? String(it.srLabel).trim() : ''
        };
      });
    }

    const contactNameOut = contactFromField || (participants[1] && String(participants[1].label || '').trim()) || contact;
    if (participants[1]) {
      participants[1] = Object.assign({}, participants[1], {
        label: String(participants[1].label || '').trim() || contactNameOut
      });
    }

    const bodyScrollMode = data.bodyScrollMode === 'scroll' ? 'scroll' : 'expand';
    const headerAvatarUrl = String(data.headerAvatarUrl || '').trim();

    const bin = canonicalizeBinaryParticipants(participants, localSpeakerId, contactNameOut);
    participants = bin.participants;
    localSpeakerId = bin.localSpeakerId;
    items = items.map(it => Object.assign({}, it, { speakerId: bin.mapSpeaker(it.speakerId) }));

    return {
      contactName: contactNameOut,
      headerAvatarUrl,
      draftText,
      recipientTyping,
      bodyScrollMode,
      participants,
      localSpeakerId,
      items
    };
  };

  window.normalizeWhatsAppData = function(data) {
    data = data || {};
    const name = String(data.name || '').trim() || 'Group Chat';
    const SAFE_COLORS = new Set(['color-pink', 'color-blue', 'color-purple', 'color-green']);
    let participants = Array.isArray(data.participants)
      ? data.participants.map(p => ({ id: String(p.id || '').trim() || ID_REMOTE, label: p.label != null ? String(p.label) : '' }))
      : [];
    let localSpeakerId = data.localSpeakerId != null ? String(data.localSpeakerId) : '';
    let turns = Array.isArray(data.turns) ? data.turns.map(t => Object.assign({}, t)) : [];

    const waHasSpeakerId = turns.some(t => t && t.speakerId != null && String(t.speakerId) !== '');
    const isLegacy = !waHasSpeakerId && turns.some(t => t && (t.side === 'out' || t.side === 'in'));

    if (isLegacy || participants.length < 2) {
      participants = [
        { id: ID_LOCAL, label: 'You' },
        { id: ID_REMOTE, label: name }
      ];
      localSpeakerId = ID_LOCAL;
    }
    if (!localSpeakerId || !participants.some(p => p.id === localSpeakerId)) {
      localSpeakerId = participants[0] ? participants[0].id : ID_LOCAL;
    }
    if (!isLegacy && participants.length > 2) {
      const localP = participants.find(p => p.id === localSpeakerId) || participants[0];
      const remoteP = participants.find(p => p.id !== localP.id) || participants[1];
      participants = [localP, remoteP];
      localSpeakerId = localP.id;
    }

    if (isLegacy) {
      turns = turns.map(t => ({
        speakerId: t.side === 'out' ? ID_LOCAL : ID_REMOTE,
        text: t.text != null ? String(t.text) : '',
        color: SAFE_COLORS.has(t.color) ? t.color : 'color-pink',
        sender: t.sender != null ? String(t.sender).trim() : '',
        readReceipt: !!t.readReceipt
      }));
    } else {
      turns = turns.map(t => {
        if (t && t.turnKind === 'time') {
          return { turnKind: 'time', time: String(t.time != null ? t.time : '').trim() };
        }
        return {
          turnKind: 'text',
          speakerId: t.speakerId != null ? String(t.speakerId) : ((participants[1] && participants[1].id) || ID_REMOTE),
          text: t.text != null ? String(t.text) : '',
          color: SAFE_COLORS.has(t.color) ? t.color : 'color-pink',
          sender: t.sender != null ? String(t.sender).trim() : '',
          readReceipt: !!t.readReceipt
        };
      });
    }
    const draftText = data.draftText != null ? String(data.draftText) : '';
    const recipientTyping = !!data.recipientTyping;
    const bodyScrollMode = data.bodyScrollMode === 'scroll' ? 'scroll' : 'expand';
    const binWa = canonicalizeBinaryParticipants(participants, localSpeakerId, name);
    participants = binWa.participants;
    localSpeakerId = binWa.localSpeakerId;
    turns = turns.map(t => Object.assign({}, t, { speakerId: binWa.mapSpeaker(t.speakerId) }));
    return {
      name,
      avatarUrl: data.avatarUrl != null ? String(data.avatarUrl) : '',
      draftText,
      recipientTyping,
      bodyScrollMode,
      participants,
      localSpeakerId,
      turns
    };
  };

  window.normalizeSnapchatData = function(data) {
    data = data || {};
    const chatName = String(data.name || '').trim() || 'Friend';
    let participants = Array.isArray(data.participants)
      ? data.participants.map(p => ({ id: String(p.id || '').trim() || ID_REMOTE, label: p.label != null ? String(p.label) : '' }))
      : [];
    let localSpeakerId = data.localSpeakerId != null ? String(data.localSpeakerId) : '';
    let turns = Array.isArray(data.turns) ? data.turns.map(t => Object.assign({}, t)) : [];

    const scHasSpeakerId = turns.some(t => t && t.speakerId != null && String(t.speakerId) !== '');
    const isLegacy = !scHasSpeakerId && turns.some(t => t && (t.side === 'out' || t.side === 'in'));

    if (isLegacy || participants.length < 2) {
      participants = [
        { id: ID_LOCAL, label: 'You' },
        { id: ID_REMOTE, label: chatName }
      ];
      localSpeakerId = ID_LOCAL;
    }
    if (!localSpeakerId || !participants.some(p => p.id === localSpeakerId)) {
      localSpeakerId = participants[0] ? participants[0].id : ID_LOCAL;
    }
    if (!isLegacy && participants.length > 2) {
      const localP = participants.find(p => p.id === localSpeakerId) || participants[0];
      const remoteP = participants.find(p => p.id !== localP.id) || participants[1];
      participants = [localP, remoteP];
      localSpeakerId = localP.id;
    }

    const SNAP_TYPES = new Set(['photo', 'video', 'chat']);
    const SNAP_ICONS = new Set(['hollowArrow', 'hollowSquare', 'solidArrow', 'solidSquare', 'none']);

    function normalizeSnapchatCanonicalTurn(t) {
      const speakerId = t.speakerId != null ? String(t.speakerId) : ((participants[1] && participants[1].id) || ID_REMOTE);
      const raw = t.turnKind != null ? String(t.turnKind).trim().toLowerCase() : '';
      if (raw === 'time') {
        return { turnKind: 'time', time: t.time != null ? String(t.time) : '' };
      }
      const turnKind = raw === 'savedimage' ? 'savedImage' : raw === 'snapstatus' ? 'snapStatus' : 'text';
      if (turnKind === 'savedImage') {
        return {
          turnKind: 'savedImage',
          speakerId,
          imageUrl: t.imageUrl != null ? String(t.imageUrl) : '',
          imageAlt: t.imageAlt != null ? String(t.imageAlt) : '',
          meta: t.meta != null ? String(t.meta) : ''
        };
      }
      if (turnKind === 'snapStatus') {
        const statusSide = String(t.statusSide || '').toLowerCase() === 'out' ? 'out' : 'in';
        const st = String(t.snapType || '').toLowerCase();
        const snapType = SNAP_TYPES.has(st) ? st : 'chat';
        const si = t.statusIcon != null ? String(t.statusIcon) : 'none';
        const statusIcon = SNAP_ICONS.has(si) ? si : 'none';
        return {
          turnKind: 'snapStatus',
          statusSide,
          snapType,
          statusText: t.statusText != null ? String(t.statusText) : '',
          statusIcon
        };
      }
      return {
        turnKind: 'text',
        speakerId,
        text: t.text != null ? String(t.text) : '',
        saved: !!(t && t.saved)
      };
    }

    if (isLegacy) {
      turns = turns.map(t => ({
        speakerId: t.side === 'out' ? ID_LOCAL : ID_REMOTE,
        text: t.text != null ? String(t.text) : '',
        saved: false
      }));
    } else {
      turns = turns.map(normalizeSnapchatCanonicalTurn);
    }
    const draftText = data.draftText != null ? String(data.draftText) : '';
    const recipientTyping = !!data.recipientTyping;
    const bodyScrollMode = data.bodyScrollMode === 'scroll' ? 'scroll' : 'expand';
    const binSc = canonicalizeBinaryParticipants(participants, localSpeakerId, chatName);
    participants = binSc.participants;
    localSpeakerId = binSc.localSpeakerId;
    turns = turns.map(t => {
      if (!t || t.turnKind === 'snapStatus' || t.turnKind === 'time') return t;
      return Object.assign({}, t, { speakerId: binSc.mapSpeaker(t.speakerId) });
    });
    return {
      name: chatName,
      avatarUrl: data.avatarUrl != null ? String(data.avatarUrl) : '',
      draftText,
      recipientTyping,
      bodyScrollMode,
      participants,
      localSpeakerId,
      turns
    };
  };

  window.normalizeAndroidSmsData = function(data) {
    data = data || {};
    let participants = Array.isArray(data.participants)
      ? data.participants.map(p => ({ id: String(p.id || '').trim() || ID_REMOTE, label: p.label != null ? String(p.label) : '' }))
      : [];
    let localSpeakerId = data.localSpeakerId != null ? String(data.localSpeakerId) : '';
    let androidTurns = Array.isArray(data.androidTurns) ? data.androidTurns.map(t => Object.assign({}, t)) : [];

    const andHasSpeakerId = androidTurns.some(t => t && t.speakerId != null && String(t.speakerId) !== '');
    const isLegacy = !andHasSpeakerId && androidTurns.some(t => t && (t.side === 'out' || t.side === 'in'));

    if (isLegacy || participants.length < 2) {
      participants = [
        { id: ID_LOCAL, label: 'You' },
        { id: ID_REMOTE, label: 'Them' }
      ];
      localSpeakerId = ID_LOCAL;
    }
    if (!localSpeakerId || !participants.some(p => p.id === localSpeakerId)) {
      localSpeakerId = participants[0] ? participants[0].id : ID_LOCAL;
    }
    if (!isLegacy && participants.length > 2) {
      const localP = participants.find(p => p.id === localSpeakerId) || participants[0];
      const remoteP = participants.find(p => p.id !== localP.id) || participants[1];
      participants = [localP, remoteP];
      localSpeakerId = localP.id;
    }

    if (isLegacy) {
      androidTurns = androidTurns.map(t => ({
        speakerId: t.side === 'out' ? ID_LOCAL : ID_REMOTE,
        text: t.text != null ? String(t.text) : ''
      }));
    } else {
      androidTurns = androidTurns.map(t => ({
        speakerId: t.speakerId != null ? String(t.speakerId) : ((participants[1] && participants[1].id) || ID_REMOTE),
        text: t.text != null ? String(t.text) : ''
      }));
    }
    const draftText = data.draftText != null ? String(data.draftText) : '';
    const recipientTyping = !!data.recipientTyping;
    const bodyScrollMode = data.bodyScrollMode === 'scroll' ? 'scroll' : 'expand';
    const binAnd = canonicalizeBinaryParticipants(participants, localSpeakerId, 'Them');
    participants = binAnd.participants;
    localSpeakerId = binAnd.localSpeakerId;
    androidTurns = androidTurns.map(t => Object.assign({}, t, { speakerId: binAnd.mapSpeaker(t.speakerId) }));
    const headerAvatarUrl = String(data.headerAvatarUrl || '').trim();
    return {
      participants,
      localSpeakerId,
      androidTurns,
      draftText,
      recipientTyping,
      bodyScrollMode,
      headerAvatarUrl
    };
  };

  window.normalizeSlackChatData = function(data) {
    data = data || {};
    const channel = data.channel != null ? String(data.channel) : '';
    const draftText = data.draftText != null ? String(data.draftText) : '';
    const typingText = data.typingText != null ? String(data.typingText) : '';
    const bodyScrollMode = data.bodyScrollMode === 'scroll' ? 'scroll' : 'expand';
    const turns = Array.isArray(data.turns) ? data.turns.map(t => Object.assign({}, t)) : [];
    return { channel, draftText, typingText, bodyScrollMode, turns };
  };

  window.normalizeDiscordData = function(data) {
    data = data || {};
    const channel = data.channel != null ? String(data.channel) : '';
    const draftText = data.draftText != null ? String(data.draftText) : '';
    const typingText = data.typingText != null ? String(data.typingText) : '';
    const bodyScrollMode = data.bodyScrollMode === 'scroll' ? 'scroll' : 'expand';
    const turns = Array.isArray(data.turns) ? data.turns.map(t => Object.assign({}, t)) : [];
    return { channel, draftText, typingText, bodyScrollMode, turns };
  };

  // ── BUILDER: iMessage (iOS) ───────────────────────────────────
  window.buildIosPhoneHTML = function(data) {
    const norm = window.normalizeIosPhoneData(data || {});
    const contact = esc(norm.contactName);
    const contactRaw = String(norm.contactName || '').trim();
    const draft = esc(norm.draftText);
    const labels = participantLabelMap(norm.participants);
    const localId = norm.localSpeakerId;
    const headerAvRaw = String(norm.headerAvatarUrl || '').trim();
    const headerInitial = esc((contactRaw.charAt(0) || 'C').toUpperCase());
    const headerAvatarInner = headerAvRaw
      ? `<img class="ios-header-avatar-img responsive-img" src="${esc(headerAvRaw)}" alt="">`
      : headerInitial;

    const messagesHTML = norm.items.map(item => {
      const textRaw = String(item.text || '').trim();
      if (!textRaw) return '';
      const isLocal = item.speakerId === localId;
      const srName = item.srLabel || labels[item.speakerId] || '';
      const speakerPrefix = !isLocal && srName ? `<span class="hide">${esc(srName)}: </span>` : '';
      let colorClass;
      if (!isLocal) colorClass = 'ios-received';
      else colorClass = item.delivery === 'sms' ? 'ios-sent-green' : 'ios-sent-blue';
      const formattedText = esc(item.text || '').replace(/\n/g, '<br>');
      const alignEnd = isLocal;
      let inner = `<div class="ios-msg ${colorClass}">${speakerPrefix}${formattedText}</div>`;
      if (isLocal && item.readReceipt && item.delivery === 'imessage') {
        inner += `<div class="ios-read-receipt"><span class="ios-read-receipt-label">Read</span></div>`;
      }
      return `<div class="ios-msg-block ${alignEnd ? 'ios-align-end' : 'ios-align-start'}">${inner}</div>`;
    }).join('\n      ');

    const typingHTML = norm.recipientTyping
      ? `<div class="ios-msg-block ios-align-start"><div class="ios-typing-bubble" aria-hidden="true"><span class="ios-typing-dot"></span><span class="ios-typing-dot"></span><span class="ios-typing-dot"></span></div></div>`
      : '';

    const bodyModeClass = norm.bodyScrollMode === 'scroll' ? 'ios-phone--body-scroll' : 'ios-phone--body-expand';

    return `
<div class="ios-phone ${bodyModeClass}">
  <div class="ios-header">
    <span class="ios-back-arrow">‹</span>
    <div class="ios-header-main">
      <div class="ios-header-avatar${headerAvRaw ? ' ios-header-avatar-hasimg' : ''}">${headerAvatarInner}</div>
      <span class="ios-header-title">${contact}</span>
    </div>
  </div>
  <div class="ios-body">
    ${messagesHTML}${typingHTML ? '\n      ' + typingHTML : ''}
  </div>
  <div class="ios-input-bar">
    <div class="ios-input-draft"><span class="ios-draft-text">${draft}</span></div>
    <div class="ios-send-btn"><span class="ios-send-glyph" aria-hidden="true">↑</span></div>
  </div>
  <div class="ios-home-indicator" aria-hidden="true"></div>
</div>`.trim();
  };

  // ── BUILDER: WhatsApp ─────────────────────────────────────────
  window.buildWhatsAppHTML = function(data) {
    const norm = window.normalizeWhatsAppData(data || {});
    const name = esc(norm.name);
    const draft = esc(norm.draftText);
    const avatarUrl = esc(String(norm.avatarUrl || '').trim());
    const avatarHTML = avatarUrl
      ? `<img class="wa-header-avatar-img responsive-img" src="${avatarUrl}" alt="">`
      : '';
    const labels = participantLabelMap(norm.participants);
    const localId = norm.localSpeakerId;
    const SAFE_COLORS = new Set(['color-pink', 'color-blue', 'color-purple', 'color-green']);

    const messagesHTML = norm.turns.map(t => {
      if (t.turnKind === 'time') {
        const timeLabel = esc(String(t.time || '').trim());
        if (!timeLabel) return '';
        return `
    <div class="wa-time-break" aria-hidden="true"><span class="wa-time-break-text">${timeLabel}</span></div>`;
      }
      const textRaw = String(t.text || '').trim();
      if (!textRaw) return '';
      const isOut = t.speakerId === localId;
      const sideClass = isOut ? 'wa-out' : 'wa-in';
      const colorClass = SAFE_COLORS.has(t.color) ? t.color : 'color-pink';
      const formattedText = esc(t.text || '').replace(/\n/g, '<br>');
      const senderDisplay = !isOut ? ((t.sender || '').trim() || labels[t.speakerId] || '') : '';
      let senderHTML = '';
      if (!isOut && senderDisplay) {
        senderHTML = `<span class="wa-sender ${colorClass}">${esc(senderDisplay)}</span><br>`;
      }
      const readHTML = isOut && t.readReceipt
        ? `<div class="wa-read-receipt"><span class="wa-read-receipt-ticks" aria-hidden="true">\u2713\u2713</span></div>`
        : '';
      return `
    <div class="wa-msg ${sideClass}">
      <div class="wa-bubble">
        ${senderHTML}
        <span class="wa-text-wrap">${formattedText}</span>
      </div>${readHTML}
    </div>`;
    }).join('\n');

    const typingHTML = norm.recipientTyping
      ? `
    <div class="wa-msg wa-in">
      <div class="wa-typing-bubble" aria-hidden="true"><span class="wa-typing-dot"></span><span class="wa-typing-dot"></span><span class="wa-typing-dot"></span></div>
    </div>`
      : '';

    const bodyModeClass = norm.bodyScrollMode === 'scroll' ? 'whatsapp-chat--body-scroll' : 'whatsapp-chat--body-expand';

    return `
<div class="whatsapp-chat ${bodyModeClass}">
  <div class="wa-header">
    <div class="wa-header-avatar">${avatarHTML}</div>
    <div class="wa-info">
      <span class="wa-group-name">${name}</span>
    </div>
  </div>
  <div class="wa-body">
    ${messagesHTML}${typingHTML ? '\n' + typingHTML : ''}
  </div>
  <div class="wa-input-bar">
    <div class="wa-input-draft"><span class="wa-draft-text">${draft}</span></div>
    <div class="wa-send-btn"><span class="wa-send-glyph" aria-hidden="true">\u2191</span></div>
  </div>
</div>`.trim();
  };

  // ── BUILDER: Letter (Aged Parchment) ──────────────────────────
  window.buildLetterHTML = function(data) {
    const header    = esc(data.to      || data.header   || '').replace(/\n/g, '<br>');
    const body      = esc(data.body    || '').split('\n').map(p => `<p>${p}</p>`).join('\n    ');
    const signoff   = esc(data.from    || data.signoff   || '');
    const signature = esc(data.subject || data.signature || '');
    const letterDate = esc(data.date || '');

    return `
<div class="letter-wrapper">
  <div class="letter-aged">
    ${header ? `<div class="letter-header">${header}</div>` : ''}
    ${letterDate ? `<div class="letter-date">${letterDate}</div>` : ''}
    ${body}
    <div class="letter-footer">
      <span>${signoff}</span><br><span class="letter-signature">${signature}</span>
    </div>
  </div>
</div>`.trim();
  };

  // ── BUILDER: Spoiler ─────────────────────────────────────────
  window.buildSpoilerHTML = function(data) {
    const summary = esc(data.summary || 'Click to reveal');
    const body    = esc(data.body || '').replace(/\n/g, '<br>');
    return `<details><summary>${summary}</summary><p>${body}</p></details>`.trim();
  };

  // ── BUILDER: Tumblr Post Chain ───────────────────────────────
  window.buildTumblrHTML = function(data) {
    const rawPosts = data.posts || [{ username: data.user, text: data.body }];
    const posts = rawPosts.length
      ? rawPosts
      : [{ username: '', text: '' }];

    const postsHTML = posts.map(p => {
      const username = esc(p.username || 'username');
      const text     = esc(p.text || '').replace(/\n/g, '<br>');
      const avUrl    = esc(p.avatarUrl || '');
      let indent = parseInt(p.indentLevel, 10);
      if (Number.isNaN(indent) || indent < 0) indent = 0;
      if (indent > 2) indent = 2;
      const avInitial = esc(String(p.username || 'u').charAt(0).toUpperCase() || 'U');
      const avatarInner = avUrl
        ? `<img class="tumblr-avatar-img responsive-img" src="${avUrl}" alt="">`
        : avInitial;

      const postInner = `
<div class="tumblr-post">
  <div class="tumblr-header">
    <div class="tumblr-avatar">${avatarInner}</div>
    <span class="t-url">${username}</span>
  </div>
  <div class="tumblr-content">${text}</div>
</div>`;
      let wrapped = postInner;
      for (let i = 0; i < indent; i++) {
        wrapped = `<blockquote class="tumblr-reblog-nest">${wrapped}</blockquote>`;
      }
      return wrapped;
    }).join('');
    return `<div class="tumblr-thread">${postsHTML}</div>`;
  };

  function splitTweetMediaUrls(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).slice(0, 4);
  }

  // ── BUILDER: Tweet ───────────────────────────────────────────
  window.buildTweetHTML = function(data) {
    const name     = esc(data.name || 'User');
    const handle   = esc(data.handle || 'user');
    const text     = esc(data.text || '').replace(/\n/g, '<br>');
    const date     = esc(data.date || '');
    const likes    = esc(data.likes || '');
    const retweets = esc(data.retweets || '');
    const replies  = esc(data.replies || '');
    const views    = esc(data.views || '');
    const bookmarks = esc(data.bookmarks || '');
    const avatarUrl = esc(data.avatarUrl || data.profileImageUrl || '');
    const mediaUrls = splitTweetMediaUrls(data.mediaUrls || data.imageUrls || '');

    const handleBare = handle.replace(/^@+/, '');
    const avatarHTML = avatarUrl
      ? `<img class="tw-avatar-img responsive-img" src="${avatarUrl}" alt="${name}">`
      : '';
    const mediaHTML = mediaUrls.length
      ? `<div class="tw-media">${mediaUrls.map(u => `<img class="tw-media-img responsive-img" src="${esc(u)}" alt="">`).join('')}</div>`
      : '';
    const hasStats = !!(replies || retweets || likes || views || bookmarks);

    const actionBar = `<div class="tw-action-bar">
    <span class="tw-bar-btn" aria-hidden="true">\u21a9\ufe0f</span>
    <span class="tw-bar-btn" aria-hidden="true">\u267b\ufe0f</span>
    <span class="tw-bar-btn" aria-hidden="true">\u2661</span>
    <span class="tw-bar-grow"></span>
    <span class="tw-bar-btn tw-bar-views" title="Views"><span class="tw-bar-ic" aria-hidden="true">\u25a6</span>${views ? `<span class="tw-bar-num">${views}</span>` : ''}</span>
    <span class="tw-bar-btn tw-bar-bookmark" title="Bookmarks"><span class="tw-bar-ic" aria-hidden="true">\u2606</span>${bookmarks ? `<span class="tw-bar-num">${bookmarks}</span>` : ''}</span>
  </div>`;

    return `
<div class="tweet-container">
  <div class="tw-header">
    <div class="tw-avatar">${avatarHTML}</div>
    <div class="tw-user">
      <span class="tw-name">${name}</span>
      <span class="tw-handle">@${handleBare}</span>
      ${date ? `<span class="tw-date">${date}</span>` : ''}
    </div>
  </div>
  <div class="tw-body">${text}</div>
  ${mediaHTML}
  ${hasStats ? `<div class="tw-footer">
    <div class="tw-stats">
      ${replies  ? `<span class="tw-stat"><strong>${replies}</strong> Replies</span>`   : ''}
      ${retweets ? `<span class="tw-stat"><strong>${retweets}</strong> Retweets</span>` : ''}
      ${likes    ? `<span class="tw-stat"><strong>${likes}</strong> Likes</span>`       : ''}
      ${views    ? `<span class="tw-stat"><strong>${views}</strong> Views</span>`       : ''}
      ${bookmarks ? `<span class="tw-stat"><strong>${bookmarks}</strong> Bookmarks</span>` : ''}
    </div>
  </div>` : ''}
  ${actionBar}
</div>`.trim();
  };

  // ── BUILDER: Gmail ───────────────────────────────────────────
  window.buildGmailHTML = function(data) {
    const subject = esc(data.subject || '(no subject)');
    const from    = esc(data.from || '');
    const fromRaw = String(data.from || '').trim();
    const toRaw   = data.to != null ? String(data.to).trim() : '';
    const to        = esc(toRaw);
    const date    = esc(data.date || '');
    const body    = esc(data.body || '').replace(/\n/g, '<br>');
    const initial = esc(fromRaw.charAt(0).toUpperCase() || 'U');
    const avRaw = String(data.avatarUrl || '').trim();
    const gAvInner = avRaw
      ? `<img class="g-avatar-img responsive-img" src="${esc(avRaw)}" alt="">`
      : initial;
    const gAvClass = avRaw ? 'g-avatar gav-blue g-avatar-hasimg' : 'g-avatar gav-blue';
    
    return `
<div class="gmail-container">
  <div class="g-header">
    <h2 class="g-subject">${subject}</h2>
  </div>
  <div class="g-email">
    <div class="g-avatar-col">
      <div class="${gAvClass}">${gAvInner}</div>
    </div>
    <div class="g-content-col">
      <div class="g-meta-row">
        <div class="g-sender-info">
          <span class="g-name">${from}</span>
        </div>
        <span class="g-time">${date}</span>
      </div>
      ${toRaw ? `<div class="g-to">${to}</div>` : ''}
      <div class="g-body">
        <p>${body}</p>
      </div>
    </div>
  </div>
</div>`.trim();
  };

  // ── BUILDER: Snapchat ────────────────────────────────────────
  window.buildSnapchatHTML = function(data) {
    const norm = window.normalizeSnapchatData(data || {});
    const name = esc(norm.name);
    const avatarUrl = esc(norm.avatarUrl || '');
    const avatarHTML = avatarUrl
      ? `<img class="sc-avatar-img responsive-img" src="${avatarUrl}" alt="">`
      : '';
    const localId = norm.localSpeakerId;

    function snapStatusIconHtml(icon) {
      if (icon === 'none' || !icon) return '';
      if (icon === 'hollowArrow') return '<span class="sc-icon-hollow-arrow sc-status-icon" aria-hidden="true"></span>';
      if (icon === 'solidArrow') return '<span class="sc-icon-solid-arrow sc-status-icon" aria-hidden="true"></span>';
      if (icon === 'hollowSquare') return '<span class="sc-icon-hollow-square sc-status-icon" aria-hidden="true"></span>';
      if (icon === 'solidSquare') return '<span class="sc-icon-solid-square sc-status-icon" aria-hidden="true"></span>';
      return '';
    }

    const msgsHTML = norm.turns.map(t => {
      if (t.turnKind === 'time') {
        const timeLabel = esc(String(t.time || '').trim());
        if (!timeLabel) return '';
        return `
    <div class="sc-time-break" aria-hidden="true"><span class="sc-time-break-text">${timeLabel}</span></div>`;
      }
      const kind = t.turnKind === 'savedImage' ? 'savedImage' : t.turnKind === 'snapStatus' ? 'snapStatus' : 'text';
      if (kind === 'savedImage') {
        const urlRaw = String(t.imageUrl || '').trim();
        if (!urlRaw) return '';
        const isOut = t.speakerId === localId;
        const side = isOut ? 'sc-out' : 'sc-in';
        const url = esc(urlRaw);
        const altRaw = String(t.imageAlt || '').trim();
        const altAttr = altRaw ? esc(altRaw) : '';
        const metaRaw = String(t.meta || '').trim();
        const metaHTML = metaRaw ? `\n        <span class="sc-meta">${esc(metaRaw)}</span>` : '';
        const savedClass = side === 'sc-out' ? 'sc-saved-out' : 'sc-saved-in';
        const rail = '<span class="sc-rail sc-rail-photo" aria-hidden="true"></span>';
        const imgBlock = `
      <div class="sc-image-container ${savedClass}">
        <img src="${url}" class="sc-snap-img responsive-img" alt="${altAttr}">${metaHTML}
      </div>`;
        return `
    <div class="sc-msg ${side} sc-msg-saved-image sc-msg-media-row">
      ${rail}
      ${imgBlock}
    </div>`;
      }
      if (kind === 'snapStatus') {
        const stext = String(t.statusText || '').trim();
        if (!stext) return '';
        const alignSide = t.statusSide === 'out' ? 'sc-out' : 'sc-in';
        const snapType = t.snapType === 'photo' ? 'photo' : t.snapType === 'video' ? 'video' : 'chat';
        const colorClass = snapType === 'photo' ? 'sc-red' : snapType === 'video' ? 'sc-purple' : 'sc-blue';
        const label = esc(stext);
        const icon = t.statusIcon || 'none';
        const iconEl = snapStatusIconHtml(icon);
        const textEl = `<span>${label}</span>`;
        let inner;
        if (t.statusSide === 'out') {
          inner = icon === 'none' ? textEl : textEl + iconEl;
        } else {
          inner = icon === 'none' ? textEl : iconEl + textEl;
        }
        return `
    <div class="sc-msg ${alignSide} sc-status ${colorClass}">
      ${inner}
    </div>`;
      }
      const isOut = t.speakerId === localId;
      const text = esc(t.text || '').replace(/\n/g, '<br>');
      if (!text) return '';
      const saved = !!(t && t.saved);
      const bodyInner = saved
        ? `<div class="sc-saved-pill"><div class="sc-plain-text">${text}</div></div>`
        : `<div class="sc-plain-text">${text}</div>`;
      const railIn = '<span class="sc-rail sc-rail-incoming" aria-hidden="true"></span>';
      const railOut = '<span class="sc-rail sc-rail-chat-out" aria-hidden="true"></span>';
      if (isOut) {
        return `
    <div class="sc-msg sc-text-row sc-out">
      ${railOut}
      <div class="sc-text-cell sc-text-cell-out">${bodyInner}</div>
    </div>`;
      }
      return `
    <div class="sc-msg sc-text-row sc-in">
      ${railIn}
      <div class="sc-text-cell sc-text-cell-in">${bodyInner}</div>
    </div>`;
    }).join('\n');

    const draft = esc(norm.draftText);
    const bodyModeClass = norm.bodyScrollMode === 'scroll' ? 'snapchat-chat--body-scroll' : 'snapchat-chat--body-expand';
    const typingHTML = norm.recipientTyping
      ? `
    <div class="sc-msg sc-in sc-text-row sc-typing-msg">
      <span class="sc-rail sc-rail-incoming" aria-hidden="true"></span>
      <div class="sc-text-cell sc-text-cell-in">
        <div class="sc-typing-bubble" aria-hidden="true"><span class="sc-typing-dot"></span><span class="sc-typing-dot"></span><span class="sc-typing-dot"></span></div>
      </div>
    </div>`
      : '';

    return `
<div class="snapchat-chat ${bodyModeClass}">
  <div class="sc-header">
    <div class="sc-avatar">${avatarHTML}</div>
    <span class="sc-name">${name}</span>
  </div>
  <div class="sc-body">
    ${msgsHTML}${typingHTML ? '\n' + typingHTML : ''}
  </div>
  <div class="sc-input-bar">
    <div class="sc-input-draft"><span class="sc-draft-text">${draft}</span></div>
    <div class="sc-send-btn"><span class="sc-send-glyph" aria-hidden="true">\u2191</span></div>
  </div>
</div>`.trim();
  };

  // ── BUILDER: Chatroom / Slack ────────────────────────────────
  window.buildSlackChatHTML = function(data) {
    const norm = window.normalizeSlackChatData(data || {});
    const channelRaw = (norm.channel != null && String(norm.channel).trim() !== '')
      ? String(norm.channel).trim()
      : 'general';
    const channel = esc(channelRaw.replace(/^#+/, ''));
    const draft = esc(norm.draftText);
    const bodyModeClass = norm.bodyScrollMode === 'scroll' ? 'slack-chat--body-scroll' : 'slack-chat--body-expand';
    const SL_COLORS = ['sl-av-blue', 'sl-av-green', 'sl-av-pink', 'sl-av-purple'];
    const msgsHTML = norm.turns.map(t => {
      const usernameRaw = t.username != null ? String(t.username) : 'user';
      const username  = esc(usernameRaw);
      const text      = esc(t.text      || '').replace(/\n/g, '<br>');
      const timestamp = esc(t.timestamp || '');
      if (!text) return '';
      const avRaw = normSkinImg(t.avatarUrl || '');
      const colorClass = SL_COLORS[Math.abs(usernameRaw.length) % SL_COLORS.length];
      const initial = esc(String(usernameRaw).charAt(0).toUpperCase() || 'U');
      const avInner = avRaw
        ? `<img class="sl-avatar-img responsive-img" src="${esc(avRaw)}" alt="">`
        : initial;
      const avClass = avRaw ? `sl-avatar ${colorClass} sl-avatar-hasimg` : `sl-avatar ${colorClass}`;
      return `
  <div class="sl-message">
    <div class="${avClass}">${avInner}</div>
    <div class="sl-text">
      <div class="sl-header">
        <span class="sl-author">${username}</span>
        <span class="sl-timestamp">${timestamp}</span>
      </div>
      <div class="sl-content">${text}</div>
    </div>
  </div>`;
    }).join('\n');
    const typingTrim = String(norm.typingText || '').trim();
    const typingHTML = typingTrim
      ? `\n  <div class="sl-typing-row"><i>${esc(typingTrim)}</i></div>`
      : '';

    return `
<div class="slack-chat ${bodyModeClass}">
  <div class="sl-channel-bar">
    <span class="sl-channel-hash">#</span>
    <span class="sl-channel-name">${channel}</span>
  </div>
  <div class="slack-chat-body">
    ${msgsHTML}${typingHTML ? '\n' + typingHTML : ''}
  </div>
  <div class="slack-input-bar">
    <div class="slack-input-draft"><span class="slack-draft-text">${draft}</span></div>
    <div class="slack-send-btn"><span class="slack-send-glyph" aria-hidden="true">\u2191</span></div>
  </div>
</div>`.trim();
  };

  // ── BUILDER: Android SMS ─────────────────────────────────────
  window.buildAndroidSMSHTML = function(data) {
    const esc2 = typeof window.escapeHTML === 'function' ? window.escapeHTML : (s) => String(s || '');
    const norm = window.normalizeAndroidSmsData(data || {});
    const localId = norm.localSpeakerId;
    const remoteP = norm.participants && norm.participants[1];
    const contactLabel = String((remoteP && remoteP.label) || 'Them').trim();
    const headerAvRaw = String(norm.headerAvatarUrl || '').trim();
    const headerInitial = esc2((contactLabel.charAt(0) || 'T').toUpperCase());
    const headerAvInner = headerAvRaw
      ? `<img class="android-header-avatar-img responsive-img" src="${esc2(headerAvRaw)}" alt="">`
      : headerInitial;
    const headerAvClass = headerAvRaw ? 'android-header-avatar android-header-avatar-hasimg' : 'android-header-avatar';
    const headerHtml = `  <div class="android-header">
    <div class="${headerAvClass}">${headerAvInner}</div>
    <span class="android-header-name">${esc2(contactLabel)}</span>
  </div>
`;
    let inner = '';
    norm.androidTurns.forEach((t) => {
      const text = t.text || '';
      if (!String(text).trim()) return;
      const side = t.speakerId === localId ? 'out' : 'in';
      inner += `    <div class="message ${side}">${esc2(text)}</div>\n`;
    });
    const draft = esc2(norm.draftText);
    const bodyModeClass = norm.bodyScrollMode === 'scroll' ? 'android-chat--body-scroll' : 'android-chat--body-expand';
    const typingHTML = norm.recipientTyping
      ? `    <div class="android-typing-row"><div class="android-typing-bubble" aria-hidden="true"><span class="android-typing-dot"></span><span class="android-typing-dot"></span><span class="android-typing-dot"></span></div></div>\n`
      : '';
    const msgsBlock = inner.trim()
      ? `<div class="android-chat-body">\n${inner}  </div>\n`
      : `<div class="android-chat-body"></div>\n`;
    return `<div class="android-chat ${bodyModeClass}">
${headerHtml}${msgsBlock}${typingHTML ? typingHTML : ''}  <div class="android-input-bar">
    <div class="android-input-draft"><span class="android-draft-text">${draft}</span></div>
    <div class="android-send-btn"><span class="android-send-glyph" aria-hidden="true">\u2191</span></div>
  </div>
</div>`;
  };

  // ── BUILDER: AO3 Review ──────────────────────────────────────
  window.buildReviewHTML = function(data) {
    const reviewer = esc(data.reviewer || 'Anonymous');
    const initial = esc(String(data.reviewer || 'A').charAt(0).toUpperCase());
    const rating   = parseInt(data.rating, 10) || 5;
    const text     = esc(data.text || '').replace(/\n/g, '<br>');
    const dateRaw  = data.date != null ? String(data.date).trim() : '';
    const date     = esc(dateRaw);
    const stars    = '★'.repeat(Math.min(rating, 5)) + '☆'.repeat(Math.max(0, 5 - rating));
    const avatarUrlRaw = String(data.avatarUrl || '').trim();
    const avatarHTML = avatarUrlRaw
      ? `<img class="review-avatar-img responsive-img" src="${esc(avatarUrlRaw)}" alt="${reviewer}">`
      : initial;
    
    return `
<div class="review-box">
  <div class="review-user">
    <div class="review-avatar">${avatarHTML}</div>
    <span class="review-username">${reviewer}</span>
  </div>
  <div class="review-header">
    <span class="review-stars" aria-label="${rating} out of 5 stars">${stars}</span>
    <span class="review-title">Review</span>
  </div>
  ${dateRaw ? `<div class="review-meta"><span>${date}</span></div>` : ''}
  <div class="review-body">${text}</div>
</div>`.trim();
  };

  // ── BUILDER: Discord ─────────────────────────────────────────
  window.buildDiscordHTML = function(data) {
    const norm = window.normalizeDiscordData(data || {});
    const channel = esc(norm.channel && String(norm.channel).trim() !== '' ? String(norm.channel).replace(/^#+/, '').trim() : 'general');
    const turns   = norm.turns;
    const SAFE_COLORS = new Set(['dc-av-blue','dc-av-green','dc-av-red','dc-av-yellow','dc-av-purple','dc-av-pink']);

    function findPriorAvatarUrl(idx, replyUsername) {
      const key = String(replyUsername || '').trim().toLowerCase();
      if (!key) return '';
      for (let j = idx - 1; j >= 0; j--) {
        const u = String(turns[j].username || '').trim().toLowerCase();
        if (u === key) {
          const av = String(turns[j].avatarUrl || '').trim();
          if (av) return av;
        }
      }
      return '';
    }

    function avatarCell(usernameRaw, color, avatarUrlRaw) {
      const colorClass = SAFE_COLORS.has(color) ? color : 'dc-av-blue';
      const avatarUrl = String(avatarUrlRaw || '').trim();
      const initial = esc(String(usernameRaw || 'u').charAt(0).toUpperCase() || 'U');
      const inner = avatarUrl
        ? `<img class="dc-avatar-img responsive-img" src="${esc(avatarUrl)}" alt="">`
        : initial;
      const avClass = avatarUrl ? `dc-avatar ${colorClass} dc-avatar-hasimg` : `dc-avatar ${colorClass}`;
      return `<div class="${avClass}">${inner}</div>`;
    }

    function replyPreviewHTML(turn, idx) {
      const ru = String(turn.replyToUsername || '').trim();
      const rs = String(turn.replyToSnippet || '').trim();
      if (!ru && !rs) return '';
      let replyAv = String(turn.replyToAvatarUrl || '').trim();
      if (!replyAv) replyAv = findPriorAvatarUrl(idx, ru);
      const ruEsc = esc(ru || 'User');
      const rsEsc = esc(rs || '…');
      const mini = replyAv
        ? `<div class="dc-reply-av dc-reply-av-img"><img class="dc-reply-avatar-img responsive-img" src="${esc(replyAv)}" alt=""></div>`
        : `<div class="dc-reply-av">${ru ? esc(String(ru).charAt(0).toUpperCase()) : '?'}</div>`;
      return `
        <div class="dc-reply">
          ${mini}
          <div class="dc-reply-body">
            <span class="dc-reply-user">${ruEsc}</span>
            <span class="dc-reply-snippet">${rsEsc}</span>
          </div>
        </div>`;
    }

    let msgsHTML = '';
    let prevUsername = null;

    turns.forEach((t, idx) => {
      const usernameRaw = t.username != null ? String(t.username) : 'user';
      const username  = esc(usernameRaw);
      const text      = esc(t.text || '').replace(/\n/g, '<br>');
      const timestamp = esc(t.timestamp || '');
      const color     = SAFE_COLORS.has(t.color) ? t.color : 'dc-av-blue';
      if (!text) return;

      const isFirst = username !== prevUsername;
      prevUsername  = username;
      const replyHTML = replyPreviewHTML(t, idx);

      if (isFirst) {
        msgsHTML += `
    <div class="dc-message dc-first">
      ${avatarCell(usernameRaw, color, t.avatarUrl)}
      <div class="dc-content">
        <div class="dc-header-row">
          <span class="dc-username ${color}">${username}</span>
          ${timestamp ? `<span class="dc-timestamp">${timestamp}</span>` : ''}
        </div>
        ${replyHTML}
        <div class="dc-text">${text}</div>
      </div>
    </div>`;
      } else {
        msgsHTML += `
    <div class="dc-message">
      <div class="dc-avatar-placeholder"></div>
      <div class="dc-content">
        ${replyHTML}
        <div class="dc-text">${text}</div>
      </div>
    </div>`;
      }
    });

    const draft = esc(norm.draftText);
    const bodyModeClass = norm.bodyScrollMode === 'scroll' ? 'discord-chat--body-scroll' : 'discord-chat--body-expand';
    const typingTrimDc = String(norm.typingText || '').trim();
    const typingHTML = typingTrimDc
      ? `<div class="dc-typing-row"><strong>${esc(typingTrimDc)}</strong></div>`
      : '';

    return `
<div class="discord-chat ${bodyModeClass}">
  <div class="dc-header">
    <span class="dc-channel-icon">#</span>
    <span class="dc-channel-name">${channel}</span>
  </div>
  <div class="dc-scroll">
    <div class="dc-body">${msgsHTML}
    ${typingHTML ? '\n    ' + typingHTML : ''}
    </div>
  </div>
  <div class="dc-input-bar">
    <div class="dc-input-draft"><span class="dc-draft-text">${draft}</span></div>
    <div class="dc-send-btn"><span class="dc-send-glyph" aria-hidden="true">\u2191</span></div>
  </div>
</div>`.trim();
  };

  // ── BUILDER: Reddit ───────────────────────────────────────────
  window.buildRedditHTML = function(data) {
    const subreddit    = esc(data.subreddit    || 'r/fanfiction');
    const author       = esc(data.author       || 'u/anonymous');
    const title        = esc(data.title        || '');
    const body         = esc(data.body         || '').replace(/\n/g, '<br>');
    const score        = esc(data.score        || '•');
    const commentCount = esc(data.commentCount || '0');
    const comments     = data.comments         || [];

    const commentsHTML = comments.map(c => {
      const cu    = esc(c.username || 'u/anonymous');
      const cs    = esc(c.score   || '1');
      const ctext = esc(c.text    || '').replace(/\n/g, '<br>');
      return `
      <div class="rdt-comment">
        <div class="rdt-comment-header">
          <span class="rdt-comment-username">${cu}</span> · <span>${cs} points</span>
        </div>
        <div class="rdt-comment-body">${ctext}</div>
      </div>`;
    }).join('');

    return `
<div class="reddit-post">
  <div class="rdt-thread">
    <div class="rdt-vote-col">
      <span class="rdt-vote-btn">▲</span>
      <div class="rdt-score">${score}</div>
      <span class="rdt-vote-btn">▼</span>
    </div>
    <div class="rdt-content">
      <div class="rdt-meta-row">
        <span class="rdt-sub">${subreddit}</span>
        · Posted by <span class="rdt-author">${author}</span>
      </div>
      <div class="rdt-title">${title}</div>
      ${body ? `<div class="rdt-body">${body}</div>` : ''}
      <div class="rdt-footer">
        <span class="rdt-stat">💬 ${commentCount} Comments</span>
        <span class="rdt-stat">↗ Share</span>
        <span class="rdt-stat">⚑ Save</span>
      </div>
    </div>
  </div>
  ${commentsHTML ? `<div class="rdt-comments">${commentsHTML}</div>` : ''}
</div>`.trim();
  };

  // ── BUILDER: Bluesky ──────────────────────────────────────────
  window.buildBlueskyHTML = function(data) {
    const nameRaw  = data.name || 'User';
    const name     = esc(nameRaw);
    const handle   = esc(data.handle   || '@user.bsky.social');
    const text     = esc(data.text     || '').replace(/\n/g, '<br>');
    const likes    = esc(data.likes    || '');
    const reposts  = esc(data.reposts  || '');
    const replies  = esc(data.replies  || '');
    const date     = esc(data.date     || '');
    const initial  = esc(String(nameRaw).charAt(0).toUpperCase() || 'U');
    const avatarUrl = esc(data.avatarUrl || '');
    const avatarHTML = avatarUrl
      ? `<img class="bsky-avatar-img responsive-img" src="${avatarUrl}" alt="${name}">`
      : initial;

    return `
<div class="bluesky-post">
  <div class="bsky-header">
    <div class="bsky-avatar">${avatarHTML}</div>
    <div class="bsky-user-info">
      <span class="bsky-name">${name}</span>
      <span class="bsky-handle">${handle}</span>
    </div>
    <div class="bsky-logo">☁</div>
  </div>
  <div class="bsky-body">${text}</div>
  ${date ? `<div class="bsky-date">${date}</div>` : ''}
  <div class="bsky-footer">
    ${replies  ? `<span class="bsky-stat">💬 ${replies}</span>`  : ''}
    ${reposts  ? `<span class="bsky-stat">🔁 ${reposts}</span>`  : ''}
    ${likes    ? `<span class="bsky-stat">♡ ${likes}</span>`     : ''}
  </div>
</div>`.trim();
  };

  // ── BUILDER: Newspaper Article ────────────────────────────────
  window.buildNewspaperHTML = function(data) {
    const publication  = esc(data.publication  || '');
    const dateline     = esc(data.dateline     || '');
    const headline     = esc(data.headline     || 'Headline');
    const subheadline  = esc(data.subheadline  || '');
    const byline       = esc(data.byline       || '');
    // Body: split on double newlines to make paragraphs
    const body = (data.body || '')
      .split(/\n\n+/)
      .map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`)
      .join('\n    ');

    return `
<div class="newspaper-wrap">
  ${publication  ? `<div class="np-publication">${publication}</div>` : ''}
  ${dateline     ? `<div class="np-dateline">${dateline}</div>`        : ''}
  <div class="np-headline">${headline}</div>
  ${subheadline  ? `<div class="np-subheadline">${subheadline}</div>`  : ''}
  ${byline       ? `<div class="np-byline">By ${byline}</div>`         : ''}
  <div class="np-rule"></div>
  <div class="np-body">${body}</div>
</div>`.trim();
  };

  // ── BUILDER: Forum / BBS Thread ───────────────────────────────
  window.buildForumHTML = function(data) {
    const forumName  = esc(data.forumName  || 'Forum');
    const threadTitle = esc(data.threadTitle || 'Thread Title');
    const posts      = data.posts || [];

    const postsHTML = posts.map(p => {
      const usernameRaw = p.username != null ? String(p.username) : 'User';
      const username  = esc(usernameRaw);
      const role      = esc(p.role      || 'Member');
      const postCount = esc(p.postCount || '');
      const date      = esc(p.date      || '');
      const postNum   = esc(p.postNum   || '#1');
      const content   = esc(p.content   || '').replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
      const signature = esc(p.signature || '');
      const avRaw = String(p.avatarUrl || '').trim();
      const initial = esc(String(usernameRaw).charAt(0).toUpperCase() || 'U');
      const fpInner = avRaw
        ? `<img class="fp-avatar-img responsive-img" src="${esc(avRaw)}" alt="">`
        : initial;
      const fpClass = avRaw ? 'fp-avatar fp-avatar-hasimg' : 'fp-avatar';

      return `
  <div class="forum-post">
    <div class="fp-info">
      <div class="${fpClass}">${fpInner}</div>
      <div class="fp-username">${username}</div>
      <div class="fp-role">${role}</div>
      ${postCount ? `<div class="fp-post-count">${postCount}</div>` : ''}
    </div>
    <div class="fp-content">
      <div class="fp-meta">
        <span>${date}</span>
        <span class="fp-post-num">${postNum}</span>
      </div>
      <div class="fp-body"><p>${content}</p></div>
      ${signature ? `<div class="fp-sig">${signature}</div>` : ''}
    </div>
  </div>`;
    }).join('');

    return `
<div class="forum-thread">
  <div class="forum-header">${forumName} &rsaquo; ${threadTitle}</div>
  ${postsHTML}
</div>`.trim();
  };

  // ── BUILDER: Facebook Post ────────────────────────────────────
  window.buildFacebookHTML = function(data) {
    const nameRaw   = data.name || 'User';
    const name      = esc(nameRaw);
    const timestamp = esc(data.timestamp || 'Just now');
    const body      = esc(data.body      || '').replace(/\n/g, '<br>');
    const reactions = esc(data.reactions || '');
    const reactionEmojis = esc(data.reactionEmojis || '👍');
    const comments  = esc(data.comments  || '');
    const shares    = esc(data.shares    || '');
    const initial   = esc(String(nameRaw).charAt(0).toUpperCase());
    const avatarUrl = esc(data.avatarUrl || '');
    const avatarHTML = avatarUrl
      ? `<img class="fb-avatar-img responsive-img" src="${avatarUrl}" alt="${name}">`
      : initial;

    const statsHTML = [
      comments ? `${comments} Comments` : '',
      shares   ? `${shares} Shares`     : '',
    ].filter(Boolean).join(' · ');

    return `
<div class="facebook-post">
  <div class="fb-header">
    <div class="fb-avatar">${avatarHTML}</div>
    <div class="fb-user-info">
      <span class="fb-name">${name}</span>
      <span class="fb-meta">${timestamp}</span>
    </div>
  </div>
  <div class="fb-body">${body}</div>
  ${(reactions || statsHTML) ? `
  <div class="fb-reactions">
    <span class="fb-reaction-icons">${reactionEmojis} ${reactions}</span>
    ${statsHTML ? `<span class="fb-reaction-count">${statsHTML}</span>` : ''}
  </div>` : ''}
  <div class="fb-actions">
    <div class="fb-action-btn">👍 Like</div>
    <div class="fb-action-btn">💬 Comment</div>
    <div class="fb-action-btn">↗ Share</div>
  </div>
</div>`.trim();
  };

  // ── BUILDER: Sticky Note ──────────────────────────────────────
  window.buildStickyNoteHTML = function(data) {
    const text  = esc(data.text  || '').replace(/\n/g, '<br>');
    const SAFE_COLORS = new Set(['sticky-pink','sticky-blue','sticky-green','sticky-orange']);
    const color = SAFE_COLORS.has(data.color) ? data.color : '';
    const cls   = color ? `sticky-note ${color}` : 'sticky-note';
    return `<div class="${cls}"><div class="sticky-body">${text}</div></div>`.trim();
  };

  // ── BUILDER: Instagram Post ──────────────────────────────────
  window.buildInstagramHTML = function(data) {
    const username = esc(data.username || 'user');
    const imageUrl = esc(data.imageUrl || '');
    const altText  = esc(data.altText  || 'Instagram post image');
    const caption  = esc(data.caption  || '').replace(/\n/g, '<br>');
    const likes    = esc(data.likes    || '');
    const likeLine = esc(data.likeLine || '');
    const comments = esc(data.comments || '');
    const date     = esc(data.date     || '');
    const usernameRaw = data.username != null ? String(data.username) : 'user';
    const initial  = esc(String(usernameRaw).charAt(0).toUpperCase() || 'U');
    const profileAvRaw = String(data.avatarUrl || '').trim();
    const igAvInner = profileAvRaw
      ? `<img class="ig-avatar-img responsive-img" src="${esc(profileAvRaw)}" alt="">`
      : initial;
    const igAvClass = profileAvRaw ? 'ig-avatar ig-avatar-hasimg' : 'ig-avatar';
    let carouselTotal = parseInt(data.carouselTotal, 10);
    if (Number.isNaN(carouselTotal) || carouselTotal < 1) carouselTotal = 1;
    if (carouselTotal > 12) carouselTotal = 12;
    let carouselActive = parseInt(data.carouselActive, 10);
    if (Number.isNaN(carouselActive) || carouselActive < 1) carouselActive = 1;
    if (carouselActive > carouselTotal) carouselActive = carouselTotal;

    const imageHTML = imageUrl
      ? `<div class="ig-image-wrap"><img class="ig-image" src="${imageUrl}" alt="${altText}"></div>`
      : `<div class="ig-image-placeholder">📷 Add an image URL in the panel to show a photo here</div>`;

    let dotsHTML = '';
    if (carouselTotal > 1) {
      for (let i = 1; i <= carouselTotal; i++) {
        const active = i === carouselActive ? ' ig-dot-active' : '';
        dotsHTML += `<span class="ig-dot${active}" aria-hidden="true"></span>`;
      }
      dotsHTML = `<div class="ig-carousel-dots" aria-hidden="true">${dotsHTML}</div>`;
    }

    return `
<div class="instagram-post">
  <div class="ig-header">
    <div class="${igAvClass}">${igAvInner}</div>
    <span class="ig-username">${username}</span>
    <span class="ig-more">···</span>
  </div>
  ${imageHTML}
  ${dotsHTML}
  <div class="ig-actions"><span class="ig-act-group"><span class="ig-act-ic" aria-hidden="true">❤️</span><span class="ig-act-ic" aria-hidden="true">💬</span><span class="ig-act-ic" aria-hidden="true">📤</span></span><span class="ig-bookmark" aria-hidden="true" title="Save">🔖</span></div>
  ${likeLine ? `<div class="ig-like-count">Liked by ${likeLine}</div>` : likes ? `<div class="ig-like-count">${likes} likes</div>` : ''}
  ${caption  ? `<div class="ig-caption"><span class="ig-caption-username">${username}</span> ${caption}</div>` : ''}
  ${comments ? `<div class="ig-comments">View all ${comments} comments</div>` : ''}
  ${date     ? `<div class="ig-date">${date}</div>` : ''}
</div>`.trim();
  };

})();
