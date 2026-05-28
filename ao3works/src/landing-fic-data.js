// ============================================================
// AO3 Works — landing hero fic transcript + builder payloads
// ------------------------------------------------------------
// Single source of truth for the Jesse thread. Story chapters
// switch mediums during the conversation (not a post-end carousel).
// ============================================================

(function () {
  'use strict';

  var ID_LOCAL = 'p_local';
  var ID_REMOTE = 'p_remote';
  var CONTACT = 'Jesse';

  var PARTICIPANTS = [
    { id: ID_LOCAL, label: 'You' },
    { id: ID_REMOTE, label: CONTACT }
  ];

  /** Vendored from https://postimg.cc/svDK2pPD */
  var JESSE_AVATAR_URL = './assets/landing-jesse-avatar.jpg';

  var MEDIUM_LABELS = {
    imessage: 'iMessage',
    android: 'Android SMS',
    snapchat: 'Snapchat',
    whatsapp: 'WhatsApp',
    instagram: 'Instagram'
  };

  var HERO_WA_TIME_BREAK = '9:14 AM';
  var HERO_SNAP_TIME_955 = '9:55';
  /** Vendored from https://postimg.cc/MvgghPRy */
  var HERO_SNAP_OUTSIDE_IMAGE_URL = './assets/landing-snap-outside.jpg';
  var HERO_SNAP_OUTSIDE_TEXT = "i'm outside please let me in";

  /** Vendored from https://postimg.cc/jCWSY1mc */
  var HERO_INSTAGRAM_AVATAR_URL = './assets/landing-insta-avatar.jpg';
  /** Vendored from https://postimg.cc/tnx3Ff8h */
  var HERO_INSTAGRAM_PHOTO_URL = './assets/landing-insta-photo.jpg';
  var HERO_INSTAGRAM_USERNAME = 'lindainlimbo';
  var HERO_INSTAGRAM_CAPTION =
    'Nothing prepares you for the "look out your window" text.';
  var HERO_INSTAGRAM_LIKE_LINE = 'jesse and 1,847 others';
  var HERO_INSTAGRAM_COMMENTS = '214';
  var HERO_INSTAGRAM_DATE = '47 minutes ago';

  /** @type {{ speaker: 'jesse'|'her', text: string }[]} */
  var MESSAGES = [
    { speaker: 'jesse', text: 'you still up?' },
    { speaker: 'her', text: 'unfortunately' },
    { speaker: 'jesse', text: 'can I call?' },
    { speaker: 'jesse', text: "I shouldn't have said that" },
    { speaker: 'her', text: 'ok' },
    { speaker: 'jesse', text: 'can i see you' },
    { speaker: 'jesse', text: HERO_SNAP_OUTSIDE_TEXT }
  ];

  function speakerId(speaker) {
    return speaker === 'her' ? ID_LOCAL : ID_REMOTE;
  }

  function sliceMessages(count) {
    return MESSAGES.slice(0, Math.max(0, Math.min(count, MESSAGES.length)));
  }

  function insertTimeBreaks(turns, extras) {
    var breaks = [];
    if (extras.timeBreaks && Array.isArray(extras.timeBreaks)) {
      breaks = extras.timeBreaks.slice();
    } else if (
      extras.timeBreakAfter != null &&
      extras.timeBreakAfter !== false &&
      extras.timeBreakLabel
    ) {
      breaks = [{ after: Number(extras.timeBreakAfter), label: extras.timeBreakLabel }];
    }
    breaks
      .filter(function (b) {
        return b && b.label != null && b.label !== '' && !isNaN(Number(b.after));
      })
      .sort(function (a, b) {
        return Number(b.after) - Number(a.after);
      })
      .forEach(function (b) {
        turns.splice(Number(b.after), 0, { turnKind: 'time', time: String(b.label) });
      });
  }

  function mapSnapchatTurns(messages, extras) {
    extras = extras || {};
    var turns = messages.map(function (m) {
      return {
        turnKind: 'text',
        speakerId: speakerId(m.speaker),
        text: m.text,
        saved: true
      };
    });
    insertTimeBreaks(turns, extras);
    if (extras.extraTurns && Array.isArray(extras.extraTurns)) {
      extras.extraTurns.forEach(function (t) {
        turns.push(t);
      });
    }
    return turns;
  }

  /** Received: status row only (photo icon). Opened: status + saved image (hero expands in place). */
  function snapOutsideExtraTurns(imageOpen) {
    if (imageOpen) {
      return [
        {
          turnKind: 'snapStatus',
          statusSide: 'in',
          snapType: 'photo',
          statusText: 'Opened',
          statusIcon: 'hollowSquare'
        },
        {
          turnKind: 'savedImage',
          speakerId: ID_REMOTE,
          imageUrl: HERO_SNAP_OUTSIDE_IMAGE_URL,
          imageAlt: 'View from outside at the door',
          meta: 'Viewed'
        }
      ];
    }
    return [
      {
        turnKind: 'snapStatus',
        statusSide: 'in',
        snapType: 'photo',
        statusText: 'Received',
        statusIcon: 'solidSquare'
      }
    ];
  }

  function snapHeroTimeBreaks(messageCount) {
    var count = Number(messageCount);
    if (isNaN(count) || count < 1) count = 5;
    var after955 = count >= 7 ? 6 : count;
    return [
      { after: 3, label: HERO_WA_TIME_BREAK },
      { after: after955, label: HERO_SNAP_TIME_955 }
    ];
  }

  function mapWhatsAppTurns(messages, extras) {
    extras = extras || {};
    var turns = messages.map(function (m, idx) {
      var isHer = m.speaker === 'her';
      var turn = {
        turnKind: 'text',
        speakerId: speakerId(m.speaker),
        text: m.text,
        color: 'color-pink',
        sender: isHer ? '' : CONTACT
      };
      if (extras.readReceiptOnLastLocal && isHer && idx === messages.length - 1) {
        turn.readReceipt = true;
      }
      return turn;
    });
    insertTimeBreaks(turns, extras);
    return turns;
  }

  function mapIosItems(messages, extras) {
    extras = extras || {};
    return messages.map(function (m, idx) {
      var isLocal = m.speaker === 'her';
      var item = {
        speakerId: speakerId(m.speaker),
        text: m.text,
        delivery: 'imessage'
      };
      if (extras.readReceiptOnLastLocal && isLocal && idx === messages.length - 1) {
        item.readReceipt = true;
      }
      return item;
    });
  }

  function buildInstagramPayload(extras) {
    extras = extras || {};
    return {
      username: extras.username != null ? String(extras.username) : HERO_INSTAGRAM_USERNAME,
      avatarUrl: extras.avatarUrl != null ? String(extras.avatarUrl) : HERO_INSTAGRAM_AVATAR_URL,
      imageUrl: extras.imageUrl != null ? String(extras.imageUrl) : HERO_INSTAGRAM_PHOTO_URL,
      altText: extras.altText != null
        ? String(extras.altText)
        : 'View from a window at night',
      caption: extras.caption != null ? String(extras.caption) : HERO_INSTAGRAM_CAPTION,
      likeLine: extras.likeLine != null ? String(extras.likeLine) : HERO_INSTAGRAM_LIKE_LINE,
      comments: extras.comments != null ? String(extras.comments) : HERO_INSTAGRAM_COMMENTS,
      date: extras.date != null ? String(extras.date) : HERO_INSTAGRAM_DATE
    };
  }

  function buildPayload(key, messageCount, extras) {
    extras = extras || {};
    if (key === 'instagram') {
      return buildInstagramPayload(extras);
    }

    var msgs = sliceMessages(messageCount);
    var draftText = extras.draftText != null ? String(extras.draftText) : '';
    var recipientTyping = !!extras.recipientTyping;

    if (key === 'imessage') {
      return {
        contactName: CONTACT,
        participants: PARTICIPANTS,
        localSpeakerId: ID_LOCAL,
        bodyScrollMode: 'expand',
        headerAvatarUrl: extras.headerAvatarUrl != null
          ? String(extras.headerAvatarUrl)
          : JESSE_AVATAR_URL,
        draftText: draftText,
        recipientTyping: recipientTyping,
        items: mapIosItems(msgs, extras)
      };
    }

    if (key === 'android') {
      return {
        participants: PARTICIPANTS,
        localSpeakerId: ID_LOCAL,
        bodyScrollMode: 'scroll',
        draftText: draftText,
        recipientTyping: recipientTyping,
        androidTurns: msgs.map(function (m) {
          return { speakerId: speakerId(m.speaker), text: m.text };
        })
      };
    }

    if (key === 'snapchat') {
      return {
        name: CONTACT,
        participants: PARTICIPANTS,
        localSpeakerId: ID_LOCAL,
        bodyScrollMode: extras.bodyScrollMode != null ? String(extras.bodyScrollMode) : 'scroll',
        avatarUrl: extras.avatarUrl != null ? String(extras.avatarUrl) : JESSE_AVATAR_URL,
        draftText: draftText,
        recipientTyping: recipientTyping,
        turns: mapSnapchatTurns(msgs, extras)
      };
    }

    if (key === 'whatsapp') {
      return {
        name: CONTACT,
        participants: PARTICIPANTS,
        localSpeakerId: ID_LOCAL,
        bodyScrollMode: 'expand',
        avatarUrl: extras.avatarUrl != null ? String(extras.avatarUrl) : JESSE_AVATAR_URL,
        draftText: draftText,
        recipientTyping: recipientTyping,
        turns: mapWhatsAppTurns(msgs, extras)
      };
    }

    return null;
  }

  function chapter(key, messageCount, extras) {
    var buildMap = {
      imessage: 'buildIosPhoneHTML',
      android: 'buildAndroidSMSHTML',
      snapchat: 'buildSnapchatHTML',
      whatsapp: 'buildWhatsAppHTML',
      instagram: 'buildInstagramHTML'
    };
    return {
      key: key,
      label: MEDIUM_LABELS[key] || key,
      build: buildMap[key],
      messageCount: messageCount,
      extras: extras || {}
    };
  }

  function stage(id, key, messageCount, extras, description) {
    var s = chapter(key, messageCount, extras);
    s.id = id;
    s.description = description || '';
    return s;
  }

  /** Slice sizes used by landing-fic-animation.js (index = messageCount). */
  var HERO_MESSAGE_COUNTS = {
    imessage: { opener: 1, afterReply: 2 },
    whatsapp: { crossfade: 2, afterCallQuestion: 3, afterRegret: 4 },
    snapchat: {
      crossfade: 4,
      afterOk: 5,
      canISee: 6,
      outside: 7
    }
  };

  var SNAP_BREAK_914 = [{ after: 3, label: HERO_WA_TIME_BREAK }];

  /**
   * Hero loop — matches landing-fic-animation.js play order.
   * MESSAGES[0..6]: you still up → unfortunately → can I call → shouldn't → ok →
   *   can i see you → i'm outside please let me in
   */
  var HERO_STORY_STAGES = [
    stage('imessage_opener', 'imessage', HERO_MESSAGE_COUNTS.imessage.opener, {}, 'Jesse: you still up?'),
    stage('imessage_reply', 'imessage', HERO_MESSAGE_COUNTS.imessage.afterReply, {}, 'You send: unfortunately'),
    stage('whatsapp_crossfade', 'whatsapp', HERO_MESSAGE_COUNTS.whatsapp.crossfade, {}, 'Crossfade — thread through unfortunately'),
    stage('whatsapp_typing_call', 'whatsapp', HERO_MESSAGE_COUNTS.whatsapp.crossfade, { recipientTyping: true }, 'Jesse typing'),
    stage('whatsapp_can_i_call', 'whatsapp', HERO_MESSAGE_COUNTS.whatsapp.afterCallQuestion, {}, 'Jesse: can I call?'),
    stage('whatsapp_incoming_call', 'whatsapp', HERO_MESSAGE_COUNTS.whatsapp.afterCallQuestion, {}, 'Incoming call overlay'),
    stage('whatsapp_time_914', 'whatsapp', HERO_MESSAGE_COUNTS.whatsapp.afterCallQuestion, { timeBreakAfter: 3, timeBreakLabel: HERO_WA_TIME_BREAK }, '9:14 AM'),
    stage('whatsapp_typing_regret', 'whatsapp', HERO_MESSAGE_COUNTS.whatsapp.afterCallQuestion, { timeBreakAfter: 3, timeBreakLabel: HERO_WA_TIME_BREAK, recipientTyping: true }, 'Jesse typing after call'),
    stage('whatsapp_regret', 'whatsapp', HERO_MESSAGE_COUNTS.whatsapp.afterRegret, { timeBreakAfter: 3, timeBreakLabel: HERO_WA_TIME_BREAK }, "Jesse: I shouldn't have said that"),
    stage('snapchat_crossfade', 'snapchat', HERO_MESSAGE_COUNTS.snapchat.crossfade, { timeBreaks: SNAP_BREAK_914 }, 'Crossfade — saved thread through shouldn\'t + 9:14'),
    stage('snapchat_draft_why', 'snapchat', HERO_MESSAGE_COUNTS.snapchat.crossfade, { timeBreaks: SNAP_BREAK_914, draftText: 'why did you' }, 'Composer: why did you (not sent)'),
    stage('snapchat_send_ok', 'snapchat', HERO_MESSAGE_COUNTS.snapchat.afterOk, { timeBreaks: SNAP_BREAK_914 }, 'You send: ok'),
    stage('snapchat_can_i_see', 'snapchat', HERO_MESSAGE_COUNTS.snapchat.canISee, { timeBreaks: snapHeroTimeBreaks(HERO_MESSAGE_COUNTS.snapchat.canISee) }, 'Jesse: can i see you'),
    stage('snapchat_time_955', 'snapchat', HERO_MESSAGE_COUNTS.snapchat.canISee, { timeBreaks: snapHeroTimeBreaks(HERO_MESSAGE_COUNTS.snapchat.canISee) }, '9:55'),
    stage('snapchat_outside_text', 'snapchat', HERO_MESSAGE_COUNTS.snapchat.outside, { timeBreaks: snapHeroTimeBreaks(HERO_MESSAGE_COUNTS.snapchat.outside) }, "Jesse: i'm outside please let me in"),
    stage('snapchat_photo_received', 'snapchat', HERO_MESSAGE_COUNTS.snapchat.outside, {
      timeBreaks: snapHeroTimeBreaks(HERO_MESSAGE_COUNTS.snapchat.outside),
      extraTurns: snapOutsideExtraTurns(false)
    }, 'Received — solid square icon'),
    stage('snapchat_photo_opened', 'snapchat', HERO_MESSAGE_COUNTS.snapchat.outside, {
      timeBreaks: snapHeroTimeBreaks(HERO_MESSAGE_COUNTS.snapchat.outside),
      extraTurns: snapOutsideExtraTurns(true)
    }, 'Opened — image expands, Viewed'),
    stage('instagram_finale', 'instagram', 0, {}, 'Instagram — lindainlimbo window post')
  ];

  window.LANDING_FIC = {
    contact: CONTACT,
    jesseAvatarUrl: JESSE_AVATAR_URL,
    heroWaTimeBreak: HERO_WA_TIME_BREAK,
    heroSnapTime955: HERO_SNAP_TIME_955,
    heroSnapOutsideImageUrl: HERO_SNAP_OUTSIDE_IMAGE_URL,
    heroSnapOutsideText: HERO_SNAP_OUTSIDE_TEXT,
    heroInstagramUsername: HERO_INSTAGRAM_USERNAME,
    heroInstagramAvatarUrl: HERO_INSTAGRAM_AVATAR_URL,
    heroInstagramPhotoUrl: HERO_INSTAGRAM_PHOTO_URL,
    heroInstagramCaption: HERO_INSTAGRAM_CAPTION,
    heroMessageCounts: HERO_MESSAGE_COUNTS,
    buildInstagramPayload: buildInstagramPayload,
    heroStoryStages: HERO_STORY_STAGES,
    snapHeroTimeBreaks: snapHeroTimeBreaks,
    snapOutsideExtraTurns: snapOutsideExtraTurns,
    participants: PARTICIPANTS,
    messages: MESSAGES,
    mediumLabels: MEDIUM_LABELS,
    storyChapters: HERO_STORY_STAGES,
    buildPayload: buildPayload,
    chapter: chapter,
    stage: stage
  };
})();
