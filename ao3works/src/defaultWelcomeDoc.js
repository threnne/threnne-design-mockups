// ============================================================
// AO3 Works, default welcome TipTap document (first visit / no autosave)
// Loaded before script.js; exposes window.ao3worksDefaultWelcomeDocJson
// ============================================================

(function () {
  window.ao3worksDefaultWelcomeDocJson = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text:
              'Welcome to AO3 Works. The blocks below are samples, click one, then use Edit in the bar above it. Clear Draft in the header wipes everything when you want a blank page.',
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Above and between blocks you can write normal chapter prose (headings, lists, links, images).',
          },
        ],
      },
      {
        type: 'skinBlock',
        attrs: {
          type: 'imessage',
          contentData: {
            bodyScrollMode: 'scroll',
            contactName: 'Jordan',
            draftText: 'Same time Saturday?',
            recipientTyping: true,
            participants: [
              { id: 'me', label: 'You' },
              { id: 'them', label: 'Jordan' },
            ],
            localSpeakerId: 'me',
            items: [
              { kind: 'message', speakerId: 'them', text: 'Hey, did you get a chance to read chapter 4?' },
              {
                kind: 'message',
                speakerId: 'me',
                text: 'Yes, last night. The bridge scene lands so much harder now.',
                readReceipt: true,
              },
              { kind: 'message', speakerId: 'them', text: 'Oh good. I was worried the pacing sagged after the fight.' },
              { kind: 'message', speakerId: 'me', text: 'It does not sag. If anything I wanted one more beat of silence before they speak.' },
              { kind: 'message', speakerId: 'them', text: 'Like… hold on the wide shot for an extra breath?' },
              {
                kind: 'message',
                speakerId: 'me',
                text: 'Exactly. Half a paragraph of weather and hands, then the line.',
                readReceipt: true,
              },
              { kind: 'message', speakerId: 'them', text: 'I can do that. Might steal a sentence from your margin note if that is okay.' },
              { kind: 'message', speakerId: 'me', text: 'Steal away, that note was me begging you to use it.' },
              { kind: 'message', speakerId: 'them', text: 'Hah. Okay. Also: tiny thing, page 12, the timeline with the train.' },
              { kind: 'message', speakerId: 'me', text: 'The Friday train vs Saturday train thing? I think I fixed it in the doc I sent this morning.' },
              { kind: 'message', speakerId: 'them', text: 'Oh I only had the old PDF. Resend when you can, no rush.' },
              { kind: 'message', speakerId: 'me', text: 'On it. Five min.', delivery: 'sms' },
              { kind: 'message', speakerId: 'them', text: 'No need to rush, seriously. I am buried in line edits anyway.' },
              { kind: 'message', speakerId: 'me', text: 'Same. If we are both buried we should probably schedule a call.', delivery: 'imessage', readReceipt: true },
              { kind: 'message', speakerId: 'them', text: 'Yes please. Sunday afternoon? I can do 2–4 your time.' },
              {
                kind: 'message',
                speakerId: 'me',
                text: '2 works. I will send a calendar thing.',
                readReceipt: true,
              },
              { kind: 'message', speakerId: 'them', text: 'Perfect. Also I loved the footnote joke. Cruel. 10/10.' },
              { kind: 'message', speakerId: 'me', text: 'That footnote is the only part of the chapter I fully trust.' },
              { kind: 'message', speakerId: 'them', text: 'Liar. The ending is mean and good and I hate that I did not write it.' },
              { kind: 'message', speakerId: 'me', text: 'High praise. I will take it.' },
              { kind: 'message', speakerId: 'them', text: 'Good. Now go drink water and touch grass or whatever we are supposed to say.' },
              { kind: 'message', speakerId: 'me', text: 'I will settle for tea and staring at the ceiling pretending I have a third act.' },
              { kind: 'message', speakerId: 'them', text: 'Your third act is fine. Your brain is just tired.' },
              {
                kind: 'message',
                speakerId: 'me',
                text: 'Brains are rude. See you Sunday.',
                readReceipt: true,
              },
            ],
          },
        },
      },
      {
        type: 'skinBlock',
        attrs: {
          type: 'tweet',
          contentData: {
            name: 'Alex Kim',
            handle: '@alexwrites',
            text: 'First chapter is up. I am terrified and caffeinated in equal measure.',
            date: 'Apr 13 · 7:12 PM',
            avatarUrl: 'https://i.postimg.cc/HWzcXDtq/negative-space-female-model-smile.jpg',
          },
        },
      },
      {
        type: 'skinBlock',
        attrs: {
          type: 'letter',
          contentData: {
            to: 'Dear Reader,',
            from: 'With thanks,',
            subject: 'A. Author',
            date: 'This afternoon',
            body:
              'If you are reading this on AO3, the skin loaded correctly.\n\nIf you are still in AO3 Works: this block is just parchment and type, edit it like any other.',
          },
        },
      },
      {
        type: 'skinBlock',
        attrs: {
          type: 'chatroom',
          contentData: {
            channel: '#writers-desk',
            turns: [
              {
                username: 'river',
                text: 'Anyone want a quick beta swap?',
                timestamp: '8:14 AM',
                avatarUrl: 'https://i.postimg.cc/HWzcXDtq/negative-space-female-model-smile.jpg',
              },
              {
                username: 'sam',
                text: 'Yes, I can take a chapter tonight.',
                timestamp: '8:16 AM',
                avatarUrl: 'https://i.postimg.cc/YqQPbRhg/dark-haired-man-in-brown-leather-jacket.jpg',
              },
            ],
          },
        },
      },
    ],
  };
})();
