// ============================================================
// AO3 Works, QA fixture TipTap document (first-class manual + AO3 E2E)
// Exposes window.ao3worksQaFixtureDocJson, same shape as autosave JSON.
// Loaded from index.html before dist/editor.bundle.js; "Load QA chapter" in script.js.
//
// When adding a skinBlock type, update this file AND SkinBlock.js skinInnerHtmlFromAttrs.
// Canonical type ids (each should appear in skinSections() below):
//   imessage, whatsapp, android, snapchat, chatroom, discord, tweet, bluesky,
//   gmail, letter, spoiler, tumblr, review, reddit, newspaper, forum,
//   facebook, instagram, sticky, legal
// ============================================================

(function () {
  const DEMO_IMG = '';

  function t(text, marks) {
    const n = { type: 'text', text };
    if (marks && marks.length) n.marks = marks;
    return n;
  }

  function mark(type, attrs) {
    return attrs ? { type, attrs } : { type };
  }

  function paragraph(...content) {
    return { type: 'paragraph', content: content.length ? content : [{ type: 'text', text: '' }] };
  }

  function paragraphAlign(align, ...content) {
    return {
      type: 'paragraph',
      attrs: { textAlign: align },
      content: content.length ? content : [{ type: 'text', text: '' }],
    };
  }

  function heading(level, ...content) {
    return { type: 'heading', attrs: { level }, content };
  }

  function skinBlock(type, contentData) {
    return { type: 'skinBlock', attrs: { type, contentData: contentData || {} } };
  }

  function bulletList(...items) {
    return {
      type: 'bulletList',
      content: items.map((inner) => ({
        type: 'listItem',
        content: [Array.isArray(inner) ? { type: 'paragraph', content: inner } : inner],
      })),
    };
  }

  function orderedList(...items) {
    return {
      type: 'orderedList',
      content: items.map((inner) => ({
        type: 'listItem',
        content: [Array.isArray(inner) ? { type: 'paragraph', content: inner } : inner],
      })),
    };
  }

  function blockquote(...blocks) {
    return { type: 'blockquote', content: blocks };
  }

  const hr = { type: 'horizontalRule' };

  function proseSection() {
    return [
      heading(1, t('QA: Prose, headings')),
      heading(2, t('QA: Heading 2')),
      heading(3, t('QA: Heading 3')),
      heading(4, t('QA: Heading 4')),
      heading(5, t('QA: Heading 5')),
      heading(6, t('QA: Heading 6')),
      paragraph(t('QA: plain paragraph. Regular body text.')),
      paragraph(t('QA: bold only', [mark('bold')])),
      paragraph(t('QA: italic only', [mark('italic')])),
      paragraph(t('QA: bold + italic', [mark('bold'), mark('italic')])),
      paragraph(t('QA: underline', [mark('underline')])),
      paragraph(t('QA: strikethrough', [mark('strike')])),
      paragraph(t('QA: inline code', [mark('code')])),
      paragraph(
        t('QA: sub ', []),
        t('script', [mark('subscript')]),
        t(' and super', []),
        t('script', [mark('superscript')]),
        t(' marks.', [])
      ),
      paragraph(
        t('QA: link to example.org', [mark('link', { href: 'https://example.org/' })])
      ),
      paragraph(t('QA: alignment, left (default).')),
      paragraphAlign('center', t('QA: alignment, center')),
      paragraphAlign('right', t('QA: alignment, right')),
      paragraphAlign('justify', t('QA: alignment, justify. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.')),
      blockquote(paragraph(t('QA: blockquote, quoted passage for AO3 styling.'))),
      hr,
      paragraph(
        t('QA: line one', []),
        { type: 'hardBreak' },
        t('same paragraph after hard break (Shift+Enter).', [])
      ),
      bulletList([t('QA: bullet one')], [t('QA: bullet two')], [t('QA: bullet three')]),
      orderedList([t('QA: ordered one')], [t('QA: ordered two')]),
      paragraph(t('QA: hosted image below (export hosting rules apply).')),
      { type: 'image', attrs: { src: DEMO_IMG, alt: 'QA fixture image', title: null } },
    ];
  }

  const IM_PARTS = [
    { id: 'p_local', label: 'You' },
    { id: 'p_remote', label: 'QA Contact' },
  ];

  /** Long thread shared by scroll vs expand iMessage QA blocks (must exceed .ios-body max-height ~480px to scroll). */
  const IM_QA_LONG_THREAD = [
    { kind: 'message', speakerId: 'p_remote', text: 'Inbound with srLabel.', srLabel: 'Them' },
    { kind: 'message', speakerId: 'p_local', text: 'Blue iMessage + read receipt.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_local', text: 'Green SMS bubble.', delivery: 'sms' },
    { kind: 'message', speakerId: 'p_remote', text: 'Scroll mode: this block should scroll inside the phone frame.' },
    { kind: 'message', speakerId: 'p_remote', text: 'Expand block below reuses every message so you can compare stretch vs scroll.' },
    { kind: 'message', speakerId: 'p_local', text: 'Copy that. Adding volume so .ios-body max-height trips overflow-y.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: 'Message 07, pacing check on the bridge scene after the fight.' },
    { kind: 'message', speakerId: 'p_local', text: '08: I think it lands. One more beat of silence would help.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '09: Agreed. I will hold the wide shot half a paragraph longer.' },
    { kind: 'message', speakerId: 'p_local', text: '10: Train timeline on page 12, Friday vs Saturday, fixed in the doc I sent.', delivery: 'sms' },
    { kind: 'message', speakerId: 'p_remote', text: '11: I only had the old PDF. Resend when you can.' },
    { kind: 'message', speakerId: 'p_local', text: '12: On it. Five minutes.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '13: No rush. I am buried in line edits anyway.' },
    { kind: 'message', speakerId: 'p_local', text: '14: Same. If we are both buried we should schedule a call.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '15: Sunday afternoon? I can do 2–4 your time.' },
    { kind: 'message', speakerId: 'p_local', text: '16: 2 works. I will send a calendar thing.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '17: Perfect. Also the footnote joke, cruel, 10/10.' },
    { kind: 'message', speakerId: 'p_local', text: '18: That footnote is the only part I fully trust.', delivery: 'imessage' },
    { kind: 'message', speakerId: 'p_remote', text: '19: Liar. The ending is mean and good.' },
    { kind: 'message', speakerId: 'p_local', text: '20: High praise. I will take it.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '21: Drink water. Touch grass. Or tea and ceiling, your call.' },
    { kind: 'message', speakerId: 'p_local', text: '22: Tea and pretending I have a third act.', delivery: 'sms' },
    { kind: 'message', speakerId: 'p_remote', text: '23: Your third act is fine. Your brain is just tired.' },
    { kind: 'message', speakerId: 'p_local', text: '24: Brains are rude. See you Sunday.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '25: One more thing, the dream sequence: keep it or cut to one image?' },
    { kind: 'message', speakerId: 'p_local', text: '26: Keep but shorten. One image, two sentences, out.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '27: Sharp. I will try that in the next pass.' },
    { kind: 'message', speakerId: 'p_local', text: '28: If it fights the chapter we cut it. No mercy.', delivery: 'imessage' },
    { kind: 'message', speakerId: 'p_remote', text: '29: Mercy is for readers. We are just two people with deadlines.' },
    { kind: 'message', speakerId: 'p_local', text: '30: Deadlines are suggestions until they are not.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '31: Speaking of, beta swap next week still good for you?' },
    { kind: 'message', speakerId: 'p_local', text: '32: Yes. Send the chapter with the train fix highlighted.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '33: Will do. Also: do we keep the cold open or move it?' },
    { kind: 'message', speakerId: 'p_local', text: '34: Keep cold open. It pays off in act three.', delivery: 'imessage', readReceipt: true },
    { kind: 'message', speakerId: 'p_remote', text: '35: Sold. I will stop texting and actually edit now.' },
    { kind: 'message', speakerId: 'p_local', text: '36: Same. This message exists purely to add vertical pixels.', delivery: 'sms' },
    { kind: 'message', speakerId: 'p_remote', text: '37: Then we are done. Scroll up in the block above, it should move inside the frame.' },
    { kind: 'message', speakerId: 'p_local', text: '38: And the expand phone below should grow tall with the same thread.', delivery: 'imessage', readReceipt: true },
  ];

  function cloneImItems(items) {
    return items.map(function (m) {
      return Object.assign({}, m);
    });
  }

  /** Same narrative length as iMessage QA thread, for scroll vs expand parity (WhatsApp `turns` shape). */
  const WA_COLOR_ROTATE = ['color-pink', 'color-blue', 'color-purple', 'color-green'];
  const WA_QA_LONG_THREAD = IM_QA_LONG_THREAD.map(function (it, idx) {
    const isMe = it.speakerId === 'p_local';
    return {
      speakerId: it.speakerId,
      text: it.text,
      color: isMe ? 'color-pink' : WA_COLOR_ROTATE[idx % WA_COLOR_ROTATE.length],
      sender: !isMe && it.srLabel ? String(it.srLabel).trim() : '',
      readReceipt: !!(isMe && it.readReceipt),
    };
  });

  function cloneWaTurns(turns) {
    return turns.map(function (t) {
      return Object.assign({}, t);
    });
  }

  /** Same length as iMessage QA thread, Slack usernames alternate for scroll vs expand checks. */
  const SLACK_QA_LONG_THREAD = IM_QA_LONG_THREAD.map(function (it, idx) {
    const isLocal = it.speakerId === 'p_local';
    const pad = idx % 60 < 10 ? '0' + (idx % 60) : String(idx % 60);
    return {
      username: isLocal ? 'qa-you' : 'qa-them',
      text: it.text,
      timestamp: idx % 4 === 0 ? '9:' + pad : '',
    };
  });

  function cloneSlackTurns(turns) {
    return turns.map(function (t) {
      return Object.assign({}, t);
    });
  }

  /** Discord-shaped long thread for scroll/expand parity (avatar colors rotate). */
  const DC_COLORS = ['dc-av-blue', 'dc-av-green', 'dc-av-red', 'dc-av-yellow'];
  const DISCORD_QA_LONG_THREAD = IM_QA_LONG_THREAD.map(function (it, idx) {
    const isLocal = it.speakerId === 'p_local';
    return {
      username: isLocal ? 'qa-you' : 'qa-them',
      color: DC_COLORS[idx % DC_COLORS.length],
      text: it.text,
      timestamp: idx % 5 === 0 ? 'Today at 9:' + (idx % 60) : '',
    };
  });

  function cloneDiscordTurns(turns) {
    return turns.map(function (t) {
      return Object.assign({}, t);
    });
  }

  function skinSections() {
    return [
      heading(2, t('QA: Skins, iMessage (scroll mode, long thread)')),
      skinBlock('imessage', {
        bodyScrollMode: 'scroll',
        contactName: 'QA Scroll',
        headerAvatarUrl: DEMO_IMG,
        draftText: 'Draft bar text',
        recipientTyping: true,
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        items: cloneImItems(IM_QA_LONG_THREAD),
      }),
      heading(2, t('QA: Skins, iMessage (expand / stretch, same thread as scroll above)')),
      skinBlock('imessage', {
        bodyScrollMode: 'expand',
        contactName: 'QA Expand same length',
        draftText: 'Draft bar text',
        recipientTyping: true,
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        items: cloneImItems(IM_QA_LONG_THREAD),
      }),
      heading(2, t('QA: Skins, iMessage (expand, short, composer anchored at bottom)')),
      skinBlock('imessage', {
        bodyScrollMode: 'expand',
        contactName: 'QA Short',
        draftText: 'Composer should sit on the bottom rail.',
        recipientTyping: false,
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        items: [
          { kind: 'message', speakerId: 'p_remote', text: 'Just two messages, bubbles stay up top; input bar stays anchored below.' },
          { kind: 'message', speakerId: 'p_local', text: 'Confirmed.', delivery: 'imessage', readReceipt: true },
        ],
      }),

      heading(2, t('QA: Skins, WhatsApp (scroll mode, long thread)')),
      skinBlock('whatsapp', {
        name: 'QA Scroll WA',
        avatarUrl: DEMO_IMG,
        bodyScrollMode: 'scroll',
        recipientTyping: true,
        draftText: 'Not sent yet…',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: cloneWaTurns(WA_QA_LONG_THREAD),
      }),
      heading(2, t('QA: Skins, WhatsApp (expand / stretch, same thread as scroll above)')),
      skinBlock('whatsapp', {
        name: 'QA Expand WA same length',
        avatarUrl: DEMO_IMG,
        bodyScrollMode: 'expand',
        recipientTyping: true,
        draftText: 'Not sent yet…',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: cloneWaTurns(WA_QA_LONG_THREAD),
      }),
      heading(2, t('QA: Skins, WhatsApp (expand, short, input bar anchored at bottom)')),
      skinBlock('whatsapp', {
        name: 'QA Short WA',
        avatarUrl: DEMO_IMG,
        bodyScrollMode: 'expand',
        draftText: 'Composer should sit on the bottom rail.',
        recipientTyping: false,
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: [
          { speakerId: 'p_remote', text: 'Just two messages, bubbles stay up top; input bar stays anchored below.', color: 'color-pink' },
          { speakerId: 'p_local', text: 'Confirmed.', readReceipt: true },
        ],
      }),
      heading(2, t('QA: Skins, WhatsApp (no header image URL, grey placeholder)')),
      skinBlock('whatsapp', {
        name: 'No header photo',
        avatarUrl: '',
        bodyScrollMode: 'expand',
        draftText: '',
        recipientTyping: false,
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: [
          { speakerId: 'p_remote', text: 'Empty avatarUrl: no <img>, only the grey circle in the header.', color: 'color-pink' },
        ],
      }),
      heading(2, t('QA: Skins, WhatsApp (compact, all inbound name colors + read ticks)')),
      skinBlock('whatsapp', {
        name: 'QA Group colors',
        avatarUrl: DEMO_IMG,
        bodyScrollMode: 'expand',
        recipientTyping: false,
        draftText: '',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: [
          { speakerId: 'p_remote', text: 'Inbound pink (default path).', color: 'color-pink' },
          { speakerId: 'p_local', text: 'Outbound you.', readReceipt: true },
          { speakerId: 'p_remote', text: 'Blue sender label', color: 'color-blue', sender: 'BlueUser' },
          { speakerId: 'p_remote', text: 'Purple no custom sender', color: 'color-purple' },
          { speakerId: 'p_remote', text: 'Green inbound', color: 'color-green' },
        ],
      }),

      heading(2, t('QA: Skins, Snapchat')),
      skinBlock('snapchat', {
        name: 'With avatar',
        avatarUrl: DEMO_IMG,
        bodyScrollMode: 'scroll',
        recipientTyping: true,
        draftText: 'Snap draft…',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: [
          { speakerId: 'p_remote', text: 'Inbound snap text.' },
          { speakerId: 'p_local', text: 'Outbound snap.' },
        ],
      }),
      skinBlock('snapchat', {
        name: 'No avatar',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: [{ speakerId: 'p_remote', text: 'Chat without avatar URL.' }],
      }),
      heading(2, t('QA: Skins, Snapchat (expand + typing + draft bar)')),
      skinBlock('snapchat', {
        name: 'QA Expand Snap',
        avatarUrl: DEMO_IMG,
        bodyScrollMode: 'expand',
        recipientTyping: true,
        draftText: 'Composer strip, expand mode.',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: [
          { speakerId: 'p_remote', text: 'Short thread: body grows; input bar stays at bottom.' },
          { speakerId: 'p_local', text: 'Outbound line.' },
        ],
      }),
      heading(2, t('QA: Skins, Snapchat (scroll mode, long thread, parity with iMessage length)')),
      skinBlock('snapchat', {
        name: 'QA Scroll Snap long',
        avatarUrl: '',
        bodyScrollMode: 'scroll',
        recipientTyping: true,
        draftText: 'Long-thread draft',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: cloneWaTurns(WA_QA_LONG_THREAD).map(function (t) {
          return { speakerId: t.speakerId, text: t.text };
        }),
      }),
      heading(2, t('QA: Skins, Snapchat (Mixed lines, rails, pill, both-way saved media, status, composer)')),
      skinBlock('snapchat', {
        name: 'Mixed lines',
        avatarUrl: DEMO_IMG,
        bodyScrollMode: 'expand',
        recipientTyping: true,
        draftText: 'Say something…',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: [
          { speakerId: 'p_remote', text: 'Plain text first (incoming rail).' },
          { speakerId: 'p_local', text: 'Saved chat, line one\nLine two inside pill.', saved: true },
          {
            turnKind: 'savedImage',
            speakerId: 'p_remote',
            imageUrl: DEMO_IMG,
            imageAlt: 'Snap',
            meta: 'Saved Photo • 10:33 AM'
          },
          {
            turnKind: 'savedImage',
            speakerId: 'p_local',
            imageUrl: DEMO_IMG,
            imageAlt: 'Me',
            meta: 'Your saved out • Memories'
          },
          {
            turnKind: 'snapStatus',
            statusSide: 'in',
            snapType: 'photo',
            statusText: 'Opened • 10:35 AM',
            statusIcon: 'hollowSquare'
          },
          {
            turnKind: 'snapStatus',
            statusSide: 'out',
            snapType: 'video',
            statusText: 'Delivered (Snap)',
            statusIcon: 'solidArrow'
          },
          {
            turnKind: 'snapStatus',
            statusSide: 'out',
            snapType: 'chat',
            statusText: 'Took a screenshot!',
            statusIcon: 'none'
          },
          { speakerId: 'p_local', text: 'Back to text.' },
        ],
      }),
      heading(2, t('QA: Skins, Snapchat (outbound saved image only, sc-saved-out + rail order)')),
      skinBlock('snapchat', {
        name: 'Outbound saved QA',
        avatarUrl: '',
        bodyScrollMode: 'expand',
        recipientTyping: false,
        draftText: '',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        turns: [
          {
            turnKind: 'savedImage',
            speakerId: 'p_local',
            imageUrl: DEMO_IMG,
            imageAlt: 'My snap',
            meta: 'Saved to camera roll'
          },
          { speakerId: 'p_remote', text: 'Nice.' },
        ],
      }),

      heading(2, t('QA: Skins, Android SMS')),
      skinBlock('android', {
        bodyScrollMode: 'expand',
        recipientTyping: false,
        draftText: '',
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        androidTurns: [
          { speakerId: 'p_remote', text: 'Inbound SMS style.' },
          { speakerId: 'p_local', text: 'Outbound SMS style.' },
        ],
      }),
      heading(2, t('QA: Skins, Android SMS (scroll + typing + draft)')),
      skinBlock('android', {
        bodyScrollMode: 'scroll',
        recipientTyping: true,
        draftText: 'SMS draft in composer…',
        headerAvatarUrl: DEMO_IMG,
        participants: IM_PARTS,
        localSpeakerId: 'p_local',
        androidTurns: [
          { speakerId: 'p_remote', text: 'Scroll body: many short lines to force overflow.' },
          { speakerId: 'p_local', text: 'Outbound one.' },
          { speakerId: 'p_remote', text: 'Inbound two.' },
          { speakerId: 'p_local', text: 'Outbound two.' },
          { speakerId: 'p_remote', text: 'Inbound three, keep scrolling inside the card.' },
          { speakerId: 'p_local', text: 'Outbound three.' },
          { speakerId: 'p_remote', text: 'Inbound four.' },
          { speakerId: 'p_local', text: 'Outbound four.' },
          { speakerId: 'p_remote', text: 'Inbound five.' },
          { speakerId: 'p_local', text: 'Outbound five.' },
        ],
      }),

      heading(2, t('QA: Skins, Slack / chatroom')),
      skinBlock('chatroom', {
        channel: '#qa-channel',
        bodyScrollMode: 'scroll',
        typingText: 'Bob is typing…',
        draftText: 'Slack draft line',
        turns: [
          { username: 'alice', text: 'First message.', timestamp: '9:00 AM', avatarUrl: DEMO_IMG },
          { username: 'bob', text: 'Second with timestamp.', timestamp: '9:02 AM' },
        ],
      }),
      heading(2, t('QA: Skins, Slack (scroll, long thread)')),
      skinBlock('chatroom', {
        channel: '#qa-scroll-slack',
        bodyScrollMode: 'scroll',
        typingText: 'qa-them is typing…',
        draftText: 'Long-thread Slack draft',
        turns: cloneSlackTurns(SLACK_QA_LONG_THREAD),
      }),
      heading(2, t('QA: Skins, Slack (expand, same thread as scroll above)')),
      skinBlock('chatroom', {
        channel: '#qa-expand-slack',
        bodyScrollMode: 'expand',
        typingText: 'qa-them is typing…',
        draftText: 'Long-thread Slack draft',
        turns: cloneSlackTurns(SLACK_QA_LONG_THREAD),
      }),
      heading(2, t('QA: Skins, Slack (expand, short, composer anchored)')),
      skinBlock('chatroom', {
        channel: '#qa-short-slack',
        bodyScrollMode: 'expand',
        typingText: 'Alice is typing…',
        draftText: 'Short expand, draft strip at bottom.',
        turns: [
          { username: 'alice', text: 'Two messages only; input bar stays on the bottom rail.', timestamp: '9:00 AM' },
          { username: 'bob', text: 'Roger.', timestamp: '' },
        ],
      }),

      heading(2, t('QA: Skins, Discord (all avatar colors + thread collapse)')),
      skinBlock('discord', {
        channel: '#qa-discord',
        bodyScrollMode: 'expand',
        draftText: '',
        turns: [
          {
            username: 'blue',
            color: 'dc-av-blue',
            text: 'Blue with avatar URL.',
            timestamp: '10:01',
            avatarUrl: DEMO_IMG,
          },
          {
            username: 'green',
            color: 'dc-av-green',
            text: 'Reply row, mini-avatar should reuse blue’s image when URL omitted.',
            timestamp: '10:02',
            replyToUsername: 'blue',
            replyToSnippet: 'Blue with avatar URL.',
          },
          { username: 'blue', color: 'dc-av-blue', text: 'Same user, collapsed avatar.' },
          { username: 'green', color: 'dc-av-green', text: 'Green follow-up.', timestamp: '10:02b' },
          { username: 'red', color: 'dc-av-red', text: 'Red', timestamp: '10:03' },
          { username: 'yellow', color: 'dc-av-yellow', text: 'Yellow', timestamp: '10:04' },
          { username: 'purple', color: 'dc-av-purple', text: 'Purple', timestamp: '10:05' },
          { username: 'pink', color: 'dc-av-pink', text: 'Pink', timestamp: '10:06' },
        ],
      }),
      heading(2, t('QA: Skins, Discord (scroll + typing + draft + long thread)')),
      skinBlock('discord', {
        channel: '#qa-discord-scroll',
        bodyScrollMode: 'scroll',
        typingText: 'qa-them is typing…',
        draftText: 'Discord draft, typing row on.',
        turns: cloneDiscordTurns(DISCORD_QA_LONG_THREAD),
      }),
      heading(2, t('QA: Skins, Discord (expand, short, reply + typing + draft)')),
      skinBlock('discord', {
        channel: '#qa-discord-short',
        bodyScrollMode: 'expand',
        typingText: 'reply is typing…',
        draftText: 'Short expand composer.',
        turns: [
          {
            username: 'lead',
            color: 'dc-av-blue',
            text: 'First line with avatar URL.',
            timestamp: '11:00',
            avatarUrl: DEMO_IMG,
          },
          {
            username: 'reply',
            color: 'dc-av-green',
            text: 'Reply strip above; mini-avatar can resolve from lead.',
            timestamp: '11:01',
            replyToUsername: 'lead',
            replyToSnippet: 'First line with avatar URL.',
            replyToAvatarUrl: '',
          },
        ],
      }),

      heading(2, t('QA: Skins, Tweet (full stats / plain / media / no avatar / views+bookmarks only)')),
      skinBlock('tweet', {
        name: 'Stats User',
        handle: '@stats',
        text: 'Tweet with full stats row.',
        date: 'Apr 15 · 12:00 PM',
        avatarUrl: DEMO_IMG,
        replies: '12',
        retweets: '34',
        likes: '56',
        views: '120k',
        bookmarks: '400',
      }),
      skinBlock('tweet', {
        name: 'Plain User',
        handle: '@plain',
        text: 'Tweet without stats, date, or avatar.',
      }),
      skinBlock('tweet', {
        name: 'Media User',
        handle: '@media',
        text: 'Two images (comma-separated URLs).',
        date: 'Apr 15',
        avatarUrl: DEMO_IMG,
        mediaUrls: DEMO_IMG + '\n' + DEMO_IMG,
      }),
      skinBlock('tweet', {
        name: 'No Avatar',
        handle: '@noav',
        text: 'No profile image URL.',
      }),
      skinBlock('tweet', {
        name: 'Bar Only',
        handle: '@baronly',
        text: 'Empty replies/retweets/likes, views + bookmarks still fill the stats row and action bar.',
        date: 'Apr 16',
        avatarUrl: DEMO_IMG,
        replies: '',
        retweets: '',
        likes: '',
        views: '50k',
        bookmarks: '12',
      }),

      heading(2, t('QA: Skins, Bluesky')),
      skinBlock('bluesky', {
        name: 'Sky With Stats',
        handle: '@qa.bsky.social',
        text: 'Post with counts and avatar.',
        date: 'Apr 15',
        avatarUrl: DEMO_IMG,
        replies: '3',
        reposts: '4',
        likes: '5',
      }),
      skinBlock('bluesky', {
        name: 'Sky Minimal',
        handle: '@minimal.bsky.social',
        text: 'No stats line; initial letter avatar only.',
      }),
      skinBlock('bluesky', {
        name: 'Sky Multiline',
        handle: '@long.bsky.social',
        text: 'Line one of a longer skeet.\n\nLine after blank line, still no likes/reposts/replies counts.',
        date: 'Apr 16, 2026',
        avatarUrl: '',
        replies: '',
        reposts: '',
        likes: '',
      }),

      heading(2, t('QA: Skins, Gmail')),
      skinBlock('gmail', {
        subject: 'QA: With To row',
        from: 'Sender Name',
        avatarUrl: DEMO_IMG,
        to: 'you@example.com',
        date: 'Apr 15, 2026',
        body: 'Body with To line rendered.',
      }),
      skinBlock('gmail', {
        subject: 'QA: No To row',
        from: 'Solo Sender',
        to: '',
        date: 'Apr 15, 2026',
        body: 'Empty To omits the To row in HTML.',
      }),
      skinBlock('gmail', {
        subject: 'QA: Minimal meta',
        from: 'Min Sender',
        to: '',
        date: '',
        body: 'Empty To and date, time cell can be empty; no To row.',
      }),

      heading(2, t('QA: Skins, Letter')),
      skinBlock('letter', {
        to: 'Dear Reader,',
        from: 'Yours,',
        subject: 'The Author',
        date: 'This morning',
        body: 'First paragraph of the letter.\n\nSecond paragraph for multi-paragraph body.',
      }),
      skinBlock('letter', {
        to: 'To the editor,',
        from: 'A concerned citizen,',
        subject: 'Anonymous',
        date: '',
        body: 'No date line when date is empty.\n\nSecond graf after blank line for paragraph split.',
      }),

      heading(2, t('QA: Skins, Spoiler')),
      skinBlock('spoiler', {
        summary: 'QA spoiler summary',
        body: 'Hidden body text\nSecond line',
      }),
      skinBlock('spoiler', {
        summary: 'Longer summary line for collapsed state, still readable in QA.',
        body: 'Hidden block line 1.\nHidden line 2.\n\nSecond paragraph after blank line in hidden region.',
      }),

      heading(2, t('QA: Skins, Tumblr (post type / indentLevel as strings)')),
      skinBlock('tumblr', {
        posts: [
          { username: 'root', text: 'Original post, indentLevel "0".', indentLevel: '0' },
          { username: 'reblog-1', text: 'First reblog, indentLevel "1".', indentLevel: '1' },
          { username: 'with-avatar', text: 'Nested reblog + avatar, indentLevel "2".', avatarUrl: DEMO_IMG, indentLevel: '2' },
          { username: 'no-avatar', text: 'Flat again, indentLevel "0".', indentLevel: '0' },
        ],
      }),
      heading(2, t('QA: Skins, Tumblr (longer thread, tumblr-thread + nested reblogs)')),
      skinBlock('tumblr', {
        posts: [
          { username: 'root-poster', text: 'Root post on a longer chain.', indentLevel: '0' },
          { username: 'reblog-a', text: 'First reblog.', indentLevel: '1' },
          { username: 'reblog-b', text: 'Deep nest (indent 2) for stair-step margins.', indentLevel: '2' },
          { username: 'reblog-c', text: 'Back to indent 1.', indentLevel: '1' },
          { username: 'reblog-d', text: 'Tail at indent 0.', indentLevel: '0' },
        ],
      }),

      heading(2, t('QA: Skins, Reviews')),
      skinBlock('review', {
        reviewer: 'Zero stars',
        rating: '0',
        text: 'Rating 0 test (string rating like the panel select).',
      }),
      skinBlock('review', {
        reviewer: 'Three stars',
        rating: '3',
        text: 'Partial stars.',
        date: 'Apr 15, 2026',
      }),
      skinBlock('review', {
        reviewer: 'Five + avatar',
        rating: '5',
        text: 'Full stars with avatar.',
        avatarUrl: DEMO_IMG,
      }),

      heading(2, t('QA: Skins, Reddit')),
      skinBlock('reddit', {
        subreddit: 'r/ao3works',
        author: 'u/qa_author',
        title: 'QA Reddit post title',
        body: 'Post body with line one.\nLine two.',
        score: '999',
        commentCount: '2',
        comments: [
          { username: 'u/one', score: '10', text: 'First comment.' },
          { username: 'u/two', score: '5', text: 'Second comment.' },
        ],
      }),
      skinBlock('reddit', {
        subreddit: 'r/minimal',
        author: 'u/min',
        title: 'No body, no comments',
        commentCount: '0',
      }),
      skinBlock('reddit', {
        subreddit: 'r/commentfarm',
        author: 'u/host',
        title: 'Many comments under the card',
        body: 'Body with several replies for list layout.',
        score: '42',
        commentCount: '4',
        comments: [
          { username: 'u/a', score: '0', text: 'Zero score edge.' },
          { username: 'u/b', score: '99', text: 'Second comment.' },
          { username: 'u/c', score: '1', text: 'Third, short.' },
          { username: 'u/d', score: '2k', text: 'Fourth with longer text for wrap testing in QA.' },
        ],
      }),

      heading(2, t('QA: Skins, Newspaper')),
      skinBlock('newspaper', {
        publication: 'The QA Times',
        dateline: 'APRIL 15, 2026',
        headline: 'Fixture Headline Runs Here',
        subheadline: 'Subhead for secondary deck',
        byline: 'Pat Q. Author',
        body: 'First graf as paragraph one.\n\nSecond graf after blank line.\n\nThird graf for measure.',
      }),
      skinBlock('newspaper', {
        publication: '',
        dateline: '',
        headline: 'Bare headline, optional fields empty',
        subheadline: '',
        byline: '',
        body: 'Single graf when publication, dateline, subheadline, and byline are omitted.',
      }),

      heading(2, t('QA: Skins, Forum')),
      skinBlock('forum', {
        forumName: 'QA Forums',
        threadTitle: 'Fixture thread',
        posts: [
          {
            username: 'ModUser',
            role: 'Moderator',
            postCount: '1,234 posts',
            date: 'Apr 15, 2026',
            postNum: '#1',
            avatarUrl: DEMO_IMG,
            content: 'OP content.\n\nSecond paragraph in OP.',
            signature: '-- QA signature',
          },
          {
            username: 'MemberUser',
            role: 'Member',
            postCount: '42 posts',
            date: 'Apr 15, 2026',
            postNum: '#2',
            content: 'Reply content.',
            signature: '',
          },
          {
            username: 'LateJoiner',
            role: 'Member',
            postCount: '3 posts',
            date: 'Apr 16, 2026',
            postNum: '#3',
            content: 'Third post in thread, multi-row sidebar layout.',
            signature: '- later',
          },
        ],
      }),
      heading(2, t('QA: Skins, Forum (single post)')),
      skinBlock('forum', {
        forumName: 'Lurker Board',
        threadTitle: 'One OP only',
        posts: [
          {
            username: 'OnlyPoster',
            role: 'New Member',
            postCount: '1 post',
            date: 'Apr 16, 2026',
            postNum: '#1',
            content: 'Solo thread, single post row only.',
            signature: '',
          },
        ],
      }),

      heading(2, t('QA: Skins, Facebook')),
      skinBlock('facebook', {
        name: 'QA Friend',
        timestamp: 'Just now · Public',
        body: 'Post body line one.\nLine two.',
        reactions: '128',
        reactionEmojis: 'Like Love Haha',
        comments: '14',
        shares: '3',
        avatarUrl: DEMO_IMG,
      }),
      skinBlock('facebook', {
        name: 'No Avatar QA',
        timestamp: 'Yesterday',
        body: 'No profile image, header uses initials only.\nMinimal reactions.',
        reactionEmojis: '👍',
        reactions: '2',
        comments: '0',
        shares: '0',
        avatarUrl: '',
      }),

      heading(2, t('QA: Skins, Instagram')),
      skinBlock('instagram', {
        username: 'qa_insta',
        avatarUrl: DEMO_IMG,
        imageUrl: DEMO_IMG,
        altText: 'QA alt',
        caption: 'Caption with #qa tag',
        likes: '100',
        comments: '12',
        date: 'April 15',
        carouselTotal: 5,
        carouselActive: 3,
      }),
      skinBlock('instagram', {
        username: 'qa_no_image',
        caption: 'No image URL, placeholder state.',
      }),
      skinBlock('instagram', {
        username: 'qa_single_carousel',
        imageUrl: DEMO_IMG,
        altText: 'Single photo',
        caption: 'carouselTotal and carouselActive as strings from panel; total 1 → no dot row.',
        likes: '5',
        comments: '0',
        date: '1w',
        carouselTotal: '1',
        carouselActive: '1',
      }),

      heading(2, t('QA: Skins, Sticky notes')),
      skinBlock('sticky', { text: 'Default yellow (no color class, panel empty select).', color: '' }),
      skinBlock('sticky', { text: 'Pink', color: 'sticky-pink' }),
      skinBlock('sticky', { text: 'Blue', color: 'sticky-blue' }),
      skinBlock('sticky', { text: 'Green', color: 'sticky-green' }),
      skinBlock('sticky', { text: 'Orange', color: 'sticky-orange' }),
      skinBlock('sticky', { text: 'Invalid color → default class', color: 'INVALID' }),

      heading(2, t('QA: Skins, Legal / custom HTML')),
      skinBlock('legal', {
        customHtml:
          '<p><strong>QA legal block</strong>: allowed tags only, <em>italic</em>, <a href="https://example.org/">link</a>.</p>',
      }),
      skinBlock('legal', {
        customHtml:
          '<blockquote><p>Second legal sample, blockquote plus code.</p></blockquote><pre><code>fn qa() { return true; }</code></pre>',
      }),
    ];
  }

  window.ao3worksQaFixtureDocJson = {
    type: 'doc',
    content: [
      paragraph(
        t(
          'AO3 Works, QA fixture chapter. Load via “Load QA chapter”. It includes every skin type (TipTap skinBlock), prose marks (alignment → export uses align-center / align-right / align-justify classes), lists, scroll vs expand, optional typing status text (Slack/Discord) or dot typing rows + composer drafts (iMessage, WhatsApp, Snapchat, Android), then export to AO3 to verify HTML + work skin CSS (bundle v1.18: Snapchat inbound+outbound saved media, multiline saved pill, Tumblr thread stress + AO3 blurb many-tags; robust alignment export; explicit margins; AO3 <br> neutralizer extended for composer / thread / blurb).',
          []
        )
      ),
      ...proseSection(),
      ...skinSections(),
    ],
  };
})();
