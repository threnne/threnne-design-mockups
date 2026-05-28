// ============================================================
// AO3 Works — src/lib/skin-html-reverse.js
// Reverse-parse rendered workskin HTML → skin contentData JSON.
// Dual module: CommonJS + window.ao3worksSkinHtmlReverse
// ============================================================

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ao3worksSkinHtmlReverse = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const ID_LOCAL = 'local';
  const ID_REMOTE = 'remote';

  function getDOMParser() {
    if (typeof DOMParser !== 'undefined') return DOMParser;
    return null;
  }

  function parseHtmlFragment(html) {
    const DP = getDOMParser();
    if (!DP) return null;
    try {
      const doc = new DP().parseFromString(
        `<div id="aw-skin-reverse-root">${String(html || '')}</div>`,
        'text/html'
      );
      return doc.getElementById('aw-skin-reverse-root');
    } catch {
      return null;
    }
  }

  function decodeHtmlEntities(str) {
    if (!str) return '';
    if (typeof document !== 'undefined') {
      const t = document.createElement('textarea');
      t.innerHTML = str;
      return t.value;
    }
    return String(str)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function htmlInnerToPlain(html) {
    if (!html) return '';
    const s = String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '');
    return decodeHtmlEntities(s).replace(/\u00a0/g, ' ').trim();
  }

  function textOf(el) {
    if (!el) return '';
    return htmlInnerToPlain(el.innerHTML || '');
  }

  function imgSrc(el, sel) {
    const img = el && sel ? el.querySelector(sel) : null;
    return img && img.getAttribute('src') ? String(img.getAttribute('src')).trim() : '';
  }

  function parseRedditMetaRow(metaText) {
    const meta = String(metaText || '').trim();
    if (!meta) return { subreddit: '', author: '' };
    const subMatch = meta.match(/\br\/[^\s·]+/i);
    const authorMatch = meta.match(/\bu\/[^\s·]+/i);
    return {
      subreddit: subMatch ? subMatch[0] : '',
      author: authorMatch ? authorMatch[0] : '',
    };
  }

  /** When AO3 strips rdt-* classes, recover title/body from block order inside .rdt-content. */
  function parseRedditStructureFallback(post) {
    const content = post.querySelector('.rdt-content') || post;
    const metaEl = post.querySelector('.rdt-meta-row');
    const meta = parseRedditMetaRow(metaEl ? textOf(metaEl) : '');
    const blocks = Array.from(content.children).filter((el) => {
      if (el.nodeType !== 1) return false;
      const cls = el.getAttribute('class') || '';
      if (/\brdt-footer\b/.test(cls) || /\brdt-meta-row\b/.test(cls)) return false;
      if (el.matches && el.matches('.rdt-footer, .rdt-meta-row, .rdt-vote-col')) return false;
      return true;
    });
    const textBlocks = blocks
      .map((el) => textOf(el))
      .filter((t) => t && !/^💬\s*\d/i.test(t) && !/^\s*↗\s*share/i.test(t));
    if (!textBlocks.length) return null;
    let title = '';
    let body = '';
    if (textBlocks.length === 1) {
      title = textBlocks[0];
    } else {
      title = textBlocks[0];
      body = textBlocks.slice(1).join('\n\n');
    }
    if (!title && !body) return null;
    return {
      subreddit: meta.subreddit,
      author: meta.author,
      title,
      body,
      score: '',
      commentCount: '',
      comments: [],
    };
  }

  function parseRedditFromHtml(root) {
    const post = root.querySelector('.reddit-post') || root;
    let sub = textOf(post.querySelector('.rdt-sub'));
    let author = textOf(post.querySelector('.rdt-author'));
    let title = textOf(post.querySelector('.rdt-title'));
    let body = textOf(post.querySelector('.rdt-body'));
    const score = textOf(post.querySelector('.rdt-score'));
    let commentCount = '';
    const footer = post.querySelector('.rdt-footer');
    if (footer) {
      const m = (footer.textContent || '').match(/(\d[\d,]*)\s*Comments/i);
      if (m) commentCount = m[1].replace(/,/g, '');
    }
    if (!sub || !author) {
      const meta = parseRedditMetaRow(textOf(post.querySelector('.rdt-meta-row')));
      if (!sub) sub = meta.subreddit;
      if (!author) author = meta.author;
    }
    const comments = Array.from(post.querySelectorAll('.rdt-comment')).map((c) => {
      const username = textOf(c.querySelector('.rdt-comment-username'));
      const header = c.querySelector('.rdt-comment-header');
      let scoreVal = '';
      if (header) {
        const spans = header.querySelectorAll('span');
        if (spans.length > 1) {
          const m = (spans[1].textContent || '').match(/([\d.,kK]+)/);
          if (m) scoreVal = m[1];
        }
      }
      let commentUser = username;
      let commentText = textOf(c.querySelector('.rdt-comment-body'));
      if (!commentUser || !commentText) {
        const headerText = textOf(header);
        const userMatch = headerText.match(/\bu\/[^\s·]+/i);
        if (!commentUser && userMatch) commentUser = userMatch[0];
        if (!commentText) {
          const bodyEl = c.querySelector('.rdt-comment-body') || c;
          const clone = bodyEl.cloneNode(true);
          const hdr = clone.querySelector && clone.querySelector('.rdt-comment-header');
          if (hdr) hdr.remove();
          commentText = htmlInnerToPlain(clone.innerHTML || '');
        }
      }
      return {
        username: commentUser,
        text: commentText,
        score: scoreVal,
      };
    }).filter((c) => c.text);

    if (!title && !body && !comments.length) {
      const fb = parseRedditStructureFallback(post);
      if (fb) return fb;
    }

    const hasSignal = !!(title || body || comments.length || sub || author || score || commentCount);
    if (!hasSignal) return null;

    return {
      subreddit: sub,
      author,
      title,
      body,
      score: score === '•' ? '' : score,
      commentCount,
      comments,
    };
  }

  function parseSpoilerFromHtml(root) {
    const det = root.querySelector('details') || (root.matches && root.matches('details') ? root : null);
    if (!det) return null;
    const summary = textOf(det.querySelector('summary'));
    const bodyEl = det.querySelector('p');
    const body = textOf(bodyEl);
    return { summary: summary || 'Click to reveal', body };
  }

  function parseLetterFromHtml(root) {
    const wrap = root.querySelector('.letter-wrapper') || root;
    const header = textOf(wrap.querySelector('.letter-header'));
    const date = textOf(wrap.querySelector('.letter-date'));
    const aged = wrap.querySelector('.letter-aged');
    const footer = wrap.querySelector('.letter-footer');
    let signoff = '';
    let signature = '';
    if (footer) {
      const spans = footer.querySelectorAll('span');
      if (spans[0]) signoff = textOf(spans[0]);
      if (spans[1]) signature = textOf(spans[1]);
    }
    let body = '';
    if (aged) {
      const paras = Array.from(aged.querySelectorAll('p')).filter(
        (p) => !p.closest('.letter-footer')
      );
      body = paras.map((p) => textOf(p)).filter(Boolean).join('\n\n');
    }
    return { to: header, header, date, body, from: signoff, signoff, subject: signature, signature };
  }

  function parseTweetFromHtml(root) {
    const tw = root.querySelector('.tweet-container') || root;
    const name = textOf(tw.querySelector('.tw-name'));
    const handle = textOf(tw.querySelector('.tw-handle')).replace(/^@+/, '');
    const text = textOf(tw.querySelector('.tw-body'));
    const date = textOf(tw.querySelector('.tw-date'));
    const stats = tw.querySelectorAll('.tw-stat');
    let replies = '';
    let retweets = '';
    let likes = '';
    let views = '';
    let bookmarks = '';
    stats.forEach((s) => {
      const label = (s.textContent || '').toLowerCase();
      const m = (s.textContent || '').match(/([\d.,kKmM]+)/);
      const val = m ? m[1] : '';
      if (label.includes('repl')) replies = val;
      else if (label.includes('retweet')) retweets = val;
      else if (label.includes('like')) likes = val;
      else if (label.includes('view')) views = val;
      else if (label.includes('bookmark')) bookmarks = val;
    });
    const mediaUrls = Array.from(tw.querySelectorAll('.tw-media-img'))
      .map((img) => img.getAttribute('src') || '')
      .filter(Boolean)
      .join('\n');
    const avatarUrl = imgSrc(tw, '.tw-avatar-img');
    if (!name && !text) return null;
    return { name, handle, text, date, likes, retweets, replies, views, bookmarks, avatarUrl, mediaUrls };
  }

  function parseGmailFromHtml(root) {
    const g = root.querySelector('.gmail-container') || root;
    const subject = textOf(g.querySelector('.g-subject'));
    const from = textOf(g.querySelector('.g-name'));
    const to = textOf(g.querySelector('.g-to'));
    const date = textOf(g.querySelector('.g-time'));
    const body = textOf(g.querySelector('.g-body'));
    const avatarUrl = imgSrc(g, '.g-avatar-img');
    return { subject, from, to, date, body, avatarUrl };
  }

  function parseReviewFromHtml(root) {
    const box = root.querySelector('.review-box') || root;
    const reviewer = textOf(box.querySelector('.review-username'));
    const text = textOf(box.querySelector('.review-body'));
    const date = textOf(box.querySelector('.review-meta span'));
    const starsEl = box.querySelector('.review-stars');
    let rating = 5;
    if (starsEl) {
      const filled = (starsEl.textContent || '').split('★').length - 1;
      if (filled >= 1 && filled <= 5) rating = filled;
    }
    const avatarUrl = imgSrc(box, '.review-avatar-img');
    return { reviewer, text, date, rating, avatarUrl };
  }

  function parseBlueskyFromHtml(root) {
    const post = root.querySelector('.bluesky-post') || root;
    const name = textOf(post.querySelector('.bsky-name'));
    const handle = textOf(post.querySelector('.bsky-handle'));
    const text = textOf(post.querySelector('.bsky-body'));
    const date = textOf(post.querySelector('.bsky-date'));
    const avatarUrl = imgSrc(post, '.bsky-avatar-img');
    const stats = post.querySelectorAll('.bsky-stat');
    let replies = '';
    let reposts = '';
    let likes = '';
    stats.forEach((s) => {
      const t = s.textContent || '';
      const m = t.match(/([\d.,kK]+)/);
      const val = m ? m[1] : '';
      if (t.includes('💬')) replies = val;
      else if (t.includes('🔁')) reposts = val;
      else if (t.includes('♡')) likes = val;
    });
    return { name, handle, text, date, likes, reposts, replies, avatarUrl };
  }

  function parseNewspaperFromHtml(root) {
    const np = root.querySelector('.newspaper-wrap') || root;
    const publication = textOf(np.querySelector('.np-publication'));
    const dateline = textOf(np.querySelector('.np-dateline'));
    const headline = textOf(np.querySelector('.np-headline'));
    const subheadline = textOf(np.querySelector('.np-subheadline'));
    const bylineRaw = textOf(np.querySelector('.np-byline'));
    const byline = bylineRaw.replace(/^By\s+/i, '').trim();
    const bodyParas = Array.from(np.querySelectorAll('.np-body p')).map((p) => textOf(p));
    const body = bodyParas.join('\n\n');
    return { publication, dateline, headline, subheadline, byline, body };
  }

  function parseStickyFromHtml(root) {
    const note = root.querySelector('.sticky-note') || root;
    const text = textOf(note.querySelector('.sticky-body'));
    const cls = note.getAttribute('class') || '';
    const colors = ['sticky-pink', 'sticky-blue', 'sticky-green', 'sticky-orange'];
    const color = colors.find((c) => cls.split(/\s+/).includes(c)) || '';
    return { text, color };
  }

  function parseFacebookFromHtml(root) {
    const fb = root.querySelector('.facebook-post') || root;
    const name = textOf(fb.querySelector('.fb-name'));
    const timestamp = textOf(fb.querySelector('.fb-meta'));
    const body = textOf(fb.querySelector('.fb-body'));
    const avatarUrl = imgSrc(fb, '.fb-avatar-img');
    const react = fb.querySelector('.fb-reaction-count');
    let comments = '';
    let shares = '';
    if (react) {
      const t = react.textContent || '';
      const cm = t.match(/([\d.,kK]+)\s*Comments/i);
      const sm = t.match(/([\d.,kK]+)\s*Shares/i);
      if (cm) comments = cm[1];
      if (sm) shares = sm[1];
    }
    const icons = textOf(fb.querySelector('.fb-reaction-icons'));
    const reactions = icons.replace(/^[👍\s]+/, '').trim();
    return { name, timestamp, body, avatarUrl, comments, shares, reactions };
  }

  function parseInstagramFromHtml(root) {
    const ig = root.querySelector('.instagram-post') || root;
    const username = textOf(ig.querySelector('.ig-username'));
    const imageUrl = imgSrc(ig, '.ig-image');
    const altText = ig.querySelector('.ig-image')?.getAttribute('alt') || '';
    const captionEl = ig.querySelector('.ig-caption');
    let caption = '';
    if (captionEl) {
      const clone = captionEl.cloneNode(true);
      const u = clone.querySelector('.ig-caption-username');
      if (u) u.remove();
      caption = htmlInnerToPlain(clone.innerHTML);
    }
    const likes = textOf(ig.querySelector('.ig-like-count'));
    const comments = textOf(ig.querySelector('.ig-comments'));
    const date = textOf(ig.querySelector('.ig-date'));
    const avatarUrl = imgSrc(ig, '.ig-avatar-img');
    const dots = ig.querySelectorAll('.ig-dot');
    const carouselTotal = dots.length || 1;
    let carouselActive = 1;
    dots.forEach((d, i) => {
      if ((d.getAttribute('class') || '').includes('ig-dot-active')) carouselActive = i + 1;
    });
    return {
      username,
      imageUrl,
      altText,
      caption,
      likes,
      comments,
      date,
      avatarUrl,
      carouselTotal,
      carouselActive,
    };
  }

  function parseTumblrFromHtml(root) {
    const thread = root.querySelector('.tumblr-thread') || root;
    const posts = Array.from(thread.querySelectorAll('.tumblr-post')).map((post) => {
      const username = textOf(post.querySelector('.t-url'));
      const text = textOf(post.querySelector('.tumblr-content'));
      const avatarUrl = imgSrc(post, '.tumblr-avatar-img');
      let indentLevel = 0;
      let p = post.parentElement;
      while (p && p !== thread) {
        if (p.classList && p.classList.contains('tumblr-reblog-nest')) indentLevel += 1;
        p = p.parentElement;
      }
      return { username, text, avatarUrl, indentLevel: Math.min(indentLevel, 2) };
    });
    if (!posts.length) return null;
    return { posts };
  }

  function parseForumFromHtml(root) {
    const thread = root.querySelector('.forum-thread') || root;
    const header = textOf(thread.querySelector('.forum-header'));
    let forumName = '';
    let threadTitle = '';
    const parts = header.split('›').map((s) => s.trim());
    if (parts.length >= 2) {
      forumName = parts[0];
      threadTitle = parts.slice(1).join('›');
    } else {
      threadTitle = header;
    }
    const posts = Array.from(thread.querySelectorAll('.forum-post')).map((fp) => {
      const username = textOf(fp.querySelector('.fp-username'));
      const role = textOf(fp.querySelector('.fp-role'));
      const postCount = textOf(fp.querySelector('.fp-post-count'));
      const date = textOf(fp.querySelector('.fp-meta span'));
      const postNum = textOf(fp.querySelector('.fp-post-num'));
      const content = textOf(fp.querySelector('.fp-body'));
      const signature = textOf(fp.querySelector('.fp-sig'));
      const avatarUrl = imgSrc(fp, '.fp-avatar-img');
      return { username, role, postCount, date, postNum, content, signature, avatarUrl };
    });
    return { forumName, threadTitle, posts };
  }

  function parseIosFromHtml(root) {
    const phone = root.querySelector('.ios-phone') || root;
    const contactName = textOf(phone.querySelector('.ios-header-title'));
    const draftText = textOf(phone.querySelector('.ios-draft-text'));
    const headerAvatarUrl = imgSrc(phone, '.ios-header-avatar-img');
    const bodyScrollMode = (phone.getAttribute('class') || '').includes('ios-phone--body-scroll')
      ? 'scroll'
      : 'expand';
    const recipientTyping = !!phone.querySelector('.ios-typing-bubble');
    const items = [];
    phone.querySelectorAll('.ios-msg-block').forEach((block) => {
      if (block.querySelector('.ios-typing-bubble')) return;
      const msg = block.querySelector('.ios-msg');
      if (!msg) return;
      const text = textOf(msg);
      if (!text) return;
      const sent = msg.classList.contains('ios-sent-blue') || msg.classList.contains('ios-sent-green');
      const delivery = msg.classList.contains('ios-sent-green') ? 'sms' : 'imessage';
      const readReceipt = !!block.querySelector('.ios-read-receipt');
      items.push({
        side: sent ? 'sent' : 'received',
        text,
        delivery: sent ? delivery : 'imessage',
        readReceipt: sent && readReceipt,
      });
    });
    if (!contactName && !items.length) return null;
    return { contactName, draftText, headerAvatarUrl, bodyScrollMode, recipientTyping, items };
  }

  function parseWhatsAppFromHtml(root) {
    const chat = root.querySelector('.whatsapp-chat') || root;
    const name = textOf(chat.querySelector('.wa-group-name'));
    const draftText = textOf(chat.querySelector('.wa-draft-text'));
    const avatarUrl = imgSrc(chat, '.wa-header-avatar-img');
    const bodyScrollMode = (chat.getAttribute('class') || '').includes('whatsapp-chat--body-scroll')
      ? 'scroll'
      : 'expand';
    const recipientTyping = !!chat.querySelector('.wa-typing-bubble');
    const turns = [];
    chat.querySelectorAll('.wa-body > *').forEach((el) => {
      if (el.classList.contains('wa-time-break')) {
        const time = textOf(el.querySelector('.wa-time-break-text'));
        if (time) turns.push({ turnKind: 'time', time });
        return;
      }
      if (el.classList.contains('wa-typing-bubble')) return;
      if (!el.classList.contains('wa-msg')) return;
      const text = textOf(el.querySelector('.wa-text-wrap'));
      if (!text) return;
      const out = el.classList.contains('wa-out');
      const senderEl = el.querySelector('.wa-sender');
      let color = 'color-pink';
      if (senderEl) {
        const cls = senderEl.getAttribute('class') || '';
        const m = cls.match(/color-\w+/);
        if (m) color = m[0];
      }
      turns.push({
        side: out ? 'out' : 'in',
        text,
        sender: senderEl ? textOf(senderEl) : '',
        color,
        readReceipt: !!el.querySelector('.wa-read-receipt'),
      });
    });
    return { name, draftText, avatarUrl, bodyScrollMode, recipientTyping, turns };
  }

  function parseSnapchatFromHtml(root) {
    const chat = root.querySelector('.snapchat-chat') || root;
    const name = textOf(chat.querySelector('.sc-name'));
    const draftText = textOf(chat.querySelector('.sc-draft-text'));
    const avatarUrl = imgSrc(chat, '.sc-avatar-img');
    const bodyScrollMode = (chat.getAttribute('class') || '').includes('snapchat-chat--body-scroll')
      ? 'scroll'
      : 'expand';
    const turns = [];
    chat.querySelectorAll('.sc-body > *').forEach((el) => {
      if (el.classList.contains('sc-time-break')) {
        turns.push({ turnKind: 'time', time: textOf(el.querySelector('.sc-time-break-text')) });
        return;
      }
      if (el.classList.contains('sc-typing-bubble')) return;
      if (el.classList.contains('sc-msg-saved-image')) {
        const url = imgSrc(el, '.sc-snap-img');
        const out = el.classList.contains('sc-out');
        turns.push({
          turnKind: 'savedImage',
          side: out ? 'out' : 'in',
          imageUrl: url,
          meta: textOf(el.querySelector('.sc-meta')),
        });
        return;
      }
      if (el.classList.contains('sc-status')) {
        const statusText = textOf(el);
        const out = el.classList.contains('sc-out');
        let snapType = 'chat';
        if (el.classList.contains('sc-red')) snapType = 'photo';
        if (el.classList.contains('sc-purple')) snapType = 'video';
        turns.push({
          turnKind: 'snapStatus',
          statusText,
          statusSide: out ? 'out' : 'in',
          snapType,
        });
        return;
      }
      const text = textOf(el.querySelector('.sc-plain-text'));
      if (!text) return;
      const out = el.classList.contains('sc-out');
      const saved = !!el.querySelector('.sc-saved-pill');
      turns.push({ side: out ? 'out' : 'in', text, saved });
    });
    return { name, draftText, avatarUrl, bodyScrollMode, turns };
  }

  function parseAndroidFromHtml(root) {
    const chat = root.querySelector('.android-chat') || root;
    const contactName = textOf(chat.querySelector('.android-header-name'));
    const draftText = textOf(chat.querySelector('.android-draft-text'));
    const headerAvatarUrl = imgSrc(chat, '.android-header-avatar-img');
    const bodyScrollMode = (chat.getAttribute('class') || '').includes('android-chat--body-scroll')
      ? 'scroll'
      : 'expand';
    const recipientTyping = !!chat.querySelector('.android-typing-bubble');
    const turns = [];
    chat.querySelectorAll('.android-chat-body .message').forEach((msg) => {
      const text = textOf(msg);
      if (!text) return;
      const out = msg.classList.contains('out');
      turns.push({ side: out ? 'out' : 'in', text });
    });
    return { contactName, draftText, headerAvatarUrl, bodyScrollMode, recipientTyping, turns };
  }

  function parseSlackFromHtml(root) {
    const chat = root.querySelector('.slack-chat') || root;
    const channel = textOf(chat.querySelector('.sl-channel-name'));
    const draftText = textOf(chat.querySelector('.slack-draft-text'));
    const bodyScrollMode = (chat.getAttribute('class') || '').includes('slack-chat--body-scroll')
      ? 'scroll'
      : 'expand';
    const turns = [];
    chat.querySelectorAll('.sl-message').forEach((msg) => {
      const username = textOf(msg.querySelector('.sl-author'));
      const text = textOf(msg.querySelector('.sl-content'));
      const timestamp = textOf(msg.querySelector('.sl-timestamp'));
      const avatarUrl = imgSrc(msg, '.sl-avatar-img');
      if (!text) return;
      turns.push({ username, text, timestamp, avatarUrl });
    });
    const typingEl = chat.querySelector('.sl-typing-row');
    const typingText = typingEl ? textOf(typingEl).replace(/^\s*|\s*$/g, '') : '';
    return { channel, draftText, bodyScrollMode, turns, typingText };
  }

  function parseDiscordFromHtml(root) {
    const chat = root.querySelector('.discord-chat') || root;
    const channel = textOf(chat.querySelector('.dc-channel-name'));
    const draftText = textOf(chat.querySelector('.dc-draft-text'));
    const bodyScrollMode = (chat.getAttribute('class') || '').includes('discord-chat--body-scroll')
      ? 'scroll'
      : 'expand';
    const turns = [];
    chat.querySelectorAll('.dc-message').forEach((msg) => {
      const username = textOf(msg.querySelector('.dc-username'));
      const text = textOf(msg.querySelector('.dc-text'));
      const timestamp = textOf(msg.querySelector('.dc-timestamp'));
      const avatarUrl = imgSrc(msg, '.dc-avatar-img');
      const colorEl = msg.querySelector('.dc-avatar, .dc-username');
      let color = 'dc-av-blue';
      if (colorEl) {
        const cls = colorEl.getAttribute('class') || '';
        const m = cls.match(/dc-av-\w+/);
        if (m) color = m[0];
      }
      const replyUser = textOf(msg.querySelector('.dc-reply-user'));
      const replySnippet = textOf(msg.querySelector('.dc-reply-snippet'));
      const replyToAvatarUrl = imgSrc(msg, '.dc-reply-avatar-img');
      if (!text && !username) return;
      turns.push({
        username,
        text,
        timestamp,
        avatarUrl,
        color,
        replyToUsername: replyUser,
        replyToSnippet: replySnippet,
        replyToAvatarUrl,
      });
    });
    const typingText = textOf(chat.querySelector('.dc-typing-row strong'));
    return { channel, draftText, bodyScrollMode, turns, typingText };
  }

  const PARSERS = {
    reddit: parseRedditFromHtml,
    spoiler: parseSpoilerFromHtml,
    letter: parseLetterFromHtml,
    tweet: parseTweetFromHtml,
    gmail: parseGmailFromHtml,
    review: parseReviewFromHtml,
    bluesky: parseBlueskyFromHtml,
    newspaper: parseNewspaperFromHtml,
    sticky: parseStickyFromHtml,
    facebook: parseFacebookFromHtml,
    instagram: parseInstagramFromHtml,
    tumblr: parseTumblrFromHtml,
    forum: parseForumFromHtml,
    imessage: parseIosFromHtml,
    whatsapp: parseWhatsAppFromHtml,
    snapchat: parseSnapchatFromHtml,
    android: parseAndroidFromHtml,
    chatroom: parseSlackFromHtml,
    discord: parseDiscordFromHtml,
  };

  function reverseParseSkinHtml(type, outerHtml) {
    const key = String(type || '').trim();
    const parser = PARSERS[key];
    if (!parser) {
      return { ok: false, reason: 'unknown_type' };
    }
    const root = parseHtmlFragment(outerHtml);
    if (!root) {
      return { ok: false, reason: 'no_dom' };
    }
    try {
      const contentData = parser(root);
      if (!contentData || typeof contentData !== 'object') {
        return { ok: false, reason: 'empty' };
      }
      return { ok: true, contentData };
    } catch (e) {
      return { ok: false, reason: 'parse_error', error: e };
    }
  }

  return {
    reverseParseSkinHtml,
    parseHtmlFragment,
    PARSERS,
  };
});
