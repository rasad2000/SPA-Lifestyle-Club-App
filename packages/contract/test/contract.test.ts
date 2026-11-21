import { describe, expect, it } from 'vitest';
import {
  Channel,
  Course,
  IngestChannel,
  IngestPost,
  IsoDate,
  LenientCourseResponse,
  LenientLessonBlock,
  LessonBlock,
  LiveEvent,
  Post,
  SignalLevels,
  Slug,
  SourceId,
  embedPlayerUrl,
  isKnownLessonBlock,
  postId,
  sourceSortKey,
  vimeoRef,
  youtubeId,
} from '../src/index';

describe('postId', () => {
  it('is channel:sourceId, derived never invented', () => {
    expect(postId('gold-desk', '4634')).toBe('gold-desk:4634');
    expect(postId('fx-ideas', 'abc:1')).toBe('fx-ideas:abc:1');
  });
});

describe('sourceSortKey', () => {
  const sorted = (ids: string[]) => ids.slice().sort((a, b) => (sourceSortKey(a) < sourceSortKey(b) ? -1 : 1));
  it('orders numeric runs by value, not as text (9999 < 10000)', () => {
    expect(sorted(['10000', '9999', '2', '100'])).toEqual(['2', '100', '9999', '10000']);
    expect(sorted(['demo-10', 'demo-9', 'demo-1'])).toEqual(['demo-1', 'demo-9', 'demo-10']);
  });
  it('ignores leading zeros and keeps non-digit text as-is', () => {
    expect(sourceSortKey('007')).toBe(sourceSortKey('7'));
    expect(sourceSortKey('6aba80f7')).toBe('0016aba00280f0017');
  });
});

describe('Slug', () => {
  it.each(['gold-desk', 'a', 'live-demo', 'x1-2-3', 'a'.repeat(64)])('accepts %s', (s) => {
    expect(Slug.safeParse(s).success).toBe(true);
  });
  it.each(['', 'Gold', 'gold_sniper', '-gold', 'gold-', 'gold--sniper', 'gold sniper', 'gold/sniper', '..', 'ä', 'a'.repeat(65)])(
    'rejects %j',
    (s) => {
      expect(Slug.safeParse(s).success).toBe(false);
    },
  );
});

describe('SourceId', () => {
  it.each(['1', '4634', 'tg:-1003763225640:812', 'a.b_c-D', 'x'.repeat(128)])('accepts %s', (s) => {
    expect(SourceId.safeParse(s).success).toBe(true);
  });
  it.each(['', 'a b', 'a/b', '../x', 'a%2f', 'ü', 'x'.repeat(129), 'a?b', 'a#b'])('rejects %j', (s) => {
    expect(SourceId.safeParse(s).success).toBe(false);
  });
});

describe('IsoDate', () => {
  it('accepts Z and offsets, rejects local/naive times', () => {
    expect(IsoDate.safeParse('2026-10-06T10:00:00Z').success).toBe(true);
    expect(IsoDate.safeParse('2026-10-06T10:00:00.123+02:00').success).toBe(true);
    expect(IsoDate.safeParse('2026-10-06T10:00:00').success).toBe(false);
    expect(IsoDate.safeParse('06.10.2026').success).toBe(false);
  });
});

describe('Channel / IngestChannel defaults', () => {
  it('fills access/demo/order', () => {
    expect(IngestChannel.parse({ title: 'SPA Gold Desk', kind: 'stream' })).toEqual({
      title: 'SPA Gold Desk',
      kind: 'stream',
      access: 'public',
      demo: false,
      order: 0,
    });
  });
  it('validates accent hex and kind', () => {
    expect(Channel.safeParse({ id: 'x', title: 'X', kind: 'stream', accent: '#8B5CF6' }).success).toBe(true);
    expect(Channel.safeParse({ id: 'x', title: 'X', kind: 'stream', accent: 'violet' }).success).toBe(false);
    expect(Channel.safeParse({ id: 'x', title: 'X', kind: 'chat' }).success).toBe(false);
  });
});

describe('SignalLevels', () => {
  it('keeps prices as strings verbatim and defaults arrays', () => {
    const s = SignalLevels.parse({ pair: 'XAUUSD', direction: 'sell', entries: ['4012.50'] });
    expect(s).toEqual({ pair: 'XAUUSD', direction: 'sell', entries: ['4012.50'], targets: [] });
    expect(SignalLevels.safeParse({ pair: 'XAUUSD', direction: 'sell', stop: 4000 }).success).toBe(false);
    expect(SignalLevels.safeParse({ pair: 'XAUUSD', direction: null }).success).toBe(true);
    expect(SignalLevels.safeParse({ pair: 'XAUUSD', direction: 'long' }).success).toBe(false);
  });
});

describe('IngestPost', () => {
  it('defaults text/mediaIds and validates replyToSourceId as a SourceId', () => {
    expect(IngestPost.parse({})).toEqual({ text: '', mediaIds: [] });
    expect(IngestPost.safeParse({ replyToSourceId: 'a b' }).success).toBe(false);
    expect(IngestPost.safeParse({ mediaIds: Array(11).fill('m') }).success).toBe(false);
  });
});

describe('Post', () => {
  it('defaults media/replyCount', () => {
    const p = Post.parse({ id: 'c:1', channel: 'c', sourceId: '1', text: 'x', createdAt: '2026-10-06T10:00:00.000Z' });
    expect(p.media).toEqual([]);
    expect(p.replyCount).toBe(0);
  });
});

describe('LessonBlock union', () => {
  it('discriminates on type and applies callout tone default', () => {
    expect(LessonBlock.parse({ type: 'callout', text: 'Hinweis' })).toEqual({ type: 'callout', tone: 'info', text: 'Hinweis' });
    expect(LessonBlock.parse({ type: 'bullets', items: ['a'] }).type).toBe('bullets');
    expect(LessonBlock.parse({ type: 'video', url: 'clip.mp4' }).type).toBe('video');
  });
  it('rejects per-variant violations of KNOWN types (strict server side)', () => {
    expect(LessonBlock.safeParse({ type: 'bullets', items: [] }).success).toBe(false);
    expect(LessonBlock.safeParse({ type: 'heading', text: '' }).success).toBe(false);
    expect(LessonBlock.safeParse({ type: 'callout', tone: 'danger', text: 'x' }).success).toBe(false);
    expect(LessonBlock.safeParse({ type: 'image' }).success).toBe(false);
    expect(LessonBlock.safeParse({ type: 'link', url: 'javascript:alert(1)', label: 'x' }).success).toBe(false);
    expect(LessonBlock.safeParse({ type: 'file', url: 'a.pdf' }).success).toBe(false); // name required
    expect(LessonBlock.safeParse({ type: '' }).success).toBe(false);
  });
  it('passes UNKNOWN types through untouched (forward compatibility)', () => {
    const slides = { type: 'slides', deck: 'https://cms.example/deck/1', pages: 12 };
    const r = LessonBlock.parse(slides);
    expect(r).toEqual(slides);
    expect(isKnownLessonBlock(r)).toBe(false);
    expect(isKnownLessonBlock(LessonBlock.parse({ type: 'heading', text: 'h' }))).toBe(true);
  });
  it('embed: youtube/vimeo must resolve to the provider player, url provider must be https', () => {
    expect(LessonBlock.safeParse({ type: 'embed', provider: 'youtube', url: 'https://youtu.be/aqz-KE-bpKQ' }).success).toBe(true);
    expect(LessonBlock.safeParse({ type: 'embed', provider: 'youtube', url: 'https://vimeo.com/1' }).success).toBe(false);
    expect(LessonBlock.safeParse({ type: 'embed', provider: 'vimeo', url: 'https://vimeo.com/76979871' }).success).toBe(true);
    expect(LessonBlock.safeParse({ type: 'embed', provider: 'url', url: 'http://plain.example/x' }).success).toBe(false);
    expect(LessonBlock.safeParse({ type: 'embed', provider: 'loom', url: 'https://loom.com/x' }).success).toBe(false);
  });
  it('file and link blocks', () => {
    expect(LessonBlock.parse({ type: 'file', url: 'skript.pdf', name: 'Skript', mime: 'application/pdf', sizeBytes: 1024 }).type).toBe('file');
    expect(LessonBlock.parse({ type: 'link', url: 'https://peach.blender.org/', label: 'Quelle' }).type).toBe('link');
  });
  it('a course needs at least one lesson with at least one block', () => {
    const lesson = { slug: 'l', title: 'L', blocks: [{ type: 'paragraph', text: 'p' }] };
    expect(Course.safeParse({ slug: 'c', title: 'C', lessons: [lesson] }).success).toBe(true);
    expect(Course.safeParse({ slug: 'c', title: 'C', lessons: [] }).success).toBe(false);
    expect(Course.safeParse({ slug: 'c', title: 'C', lessons: [{ ...lesson, blocks: [] }] }).success).toBe(false);
  });
});

describe('LiveEvent', () => {
  const post = { id: 'c:1', channel: 'c', sourceId: '1', text: 'x', createdAt: '2026-10-06T10:00:00.000Z' };
  it('parses every event type from JSON frames', () => {
    const frames = [
      { type: 'hello', serverTime: '2026-10-06T10:00:00.000Z' },
      { type: 'post.upsert', post, isNew: true },
      { type: 'post.delete', id: 'c:1', channel: 'c' },
      { type: 'ping', serverTime: '2026-10-06T10:00:25.000Z' },
    ];
    for (const f of frames) expect(LiveEvent.parse(JSON.parse(JSON.stringify(f))).type).toBe(f.type);
  });
  it('rejects unknown types and malformed payloads', () => {
    expect(LiveEvent.safeParse({ type: 'post.created', post }).success).toBe(false);
    expect(LiveEvent.safeParse({ type: 'post.upsert', post }).success).toBe(false); // isNew required
    expect(LiveEvent.safeParse({ type: 'post.delete', id: 'c:1', channel: 'Bad Channel' }).success).toBe(false);
    expect(LiveEvent.safeParse({ type: 'hello' }).success).toBe(false);
  });
});

describe('embed URLs', () => {
  it('youtubeId accepts the common URL shapes and rejects lookalikes', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=10',
      'https://youtu.be/aqz-KE-bpKQ',
      'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
      'https://youtube.com/shorts/aqz-KE-bpKQ',
    ]) {
      expect(youtubeId(u)).toBe('aqz-KE-bpKQ');
    }
    expect(youtubeId('https://evil.example/watch?v=aqz-KE-bpKQ')).toBeNull();
    expect(youtubeId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(youtubeId('not a url')).toBeNull();
  });
  it('vimeoRef keeps the private-link hash', () => {
    expect(vimeoRef('https://vimeo.com/76979871')).toEqual({ id: '76979871' });
    expect(vimeoRef('https://vimeo.com/76979871/abc123')).toEqual({ id: '76979871', hash: 'abc123' });
    expect(vimeoRef('https://player.vimeo.com/video/76979871?h=abc123')).toEqual({ id: '76979871', hash: 'abc123' });
    expect(vimeoRef('https://vimeo.com/channels/staff')).toBeNull();
  });
  it('embedPlayerUrl always points at the provider’s own player', () => {
    expect(embedPlayerUrl({ provider: 'youtube', url: 'https://youtu.be/aqz-KE-bpKQ' })).toBe(
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?playsinline=1&rel=0',
    );
    expect(embedPlayerUrl({ provider: 'vimeo', url: 'https://vimeo.com/76979871/abc123' })).toBe(
      'https://player.vimeo.com/video/76979871?h=abc123',
    );
    expect(embedPlayerUrl({ provider: 'url', url: 'https://slides.example/d/1' })).toBe('https://slides.example/d/1');
    expect(embedPlayerUrl({ provider: 'url', url: 'http://slides.example/d/1' })).toBeNull();
  });
});

describe('LenientLessonBlock / LenientCourseResponse (client side)', () => {
  it('degrades unknown or not-understood blocks instead of failing', () => {
    expect(LenientLessonBlock.parse({ type: 'slides', url: 'https://cms.example/d' })).toEqual({
      type: 'unsupported',
      originalType: 'slides',
      url: 'https://cms.example/d',
    });
    // a KNOWN type in a shape this build doesn't understand (e.g. a future provider)
    expect(LenientLessonBlock.parse({ type: 'embed', provider: 'loom', url: 'https://loom.com/x' })).toEqual({
      type: 'unsupported',
      originalType: 'embed',
      url: 'https://loom.com/x',
    });
    expect(LenientLessonBlock.parse(42)).toEqual({ type: 'unsupported', originalType: 'unbekannt' });
    expect(LenientLessonBlock.parse({ type: 'paragraph', text: 'p' })).toEqual({ type: 'paragraph', text: 'p' });
  });
  it('is idempotent, so a cached degraded block survives a re-parse', () => {
    const once = LenientLessonBlock.parse({ type: 'slides', url: 'https://x.example' });
    expect(LenientLessonBlock.parse(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
  it('one odd block never rejects the whole course', () => {
    const course = {
      slug: 'c',
      title: 'C',
      lessons: [{ slug: 'l', title: 'L', blocks: [{ type: 'paragraph', text: 'p' }, { type: 'quiz', q: 1 }, { type: 'image' }] }],
    };
    const r = LenientCourseResponse.parse({ course });
    expect(r.course.lessons[0]!.blocks.map((b) => b.type)).toEqual(['paragraph', 'unsupported', 'unsupported']);
    expect(Course.safeParse(course).success).toBe(false); // the server stays strict on the known 'image'
  });
});
