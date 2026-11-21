import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Course, CourseSummary, type LessonBlock } from '@spa/contract';
import { SERVER_DIR } from '../src/config.ts';
import { CourseLoadError, loadCourses } from '../src/courses.ts';
import { tempDir } from './helpers.ts';

let t: ReturnType<typeof tempDir>;
beforeEach(() => (t = tempDir()));
afterEach(() => t.cleanup());

const minimal = (slug: string, blocks: unknown[] = [{ type: 'paragraph', text: 'Hallo' }]) => ({
  slug,
  title: 'Test',
  lessons: [{ slug: 'eins', title: 'Eins', durationMin: 3, blocks }],
});

function writeCourse(dir: string, slug: string, body: unknown) {
  const d = join(dir, 'courses', slug);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'course.json'), typeof body === 'string' ? body : JSON.stringify(body));
  return d;
}

describe('shipped sample content', () => {
  const cat = loadCourses(resolve(SERVER_DIR, 'content'));

  it('loads the four sample courses: club area first, Orangerie last', () => {
    expect(cat.summaries().map((c) => c.slug)).toEqual([
      'trading-basic-academy',
      'forex-strategie-bootcamp',
      'copytrader-anleitung',
      'orangerie-erste-schritte',
    ]);
    for (const s of cat.summaries()) expect(() => CourseSummary.parse(s)).not.toThrow();
  });

  it('every sample course is labelled, members-only, in an area, with exactly the first lesson as preview', () => {
    for (const s of cat.summaries()) {
      const c = cat.get(s.slug)!;
      expect(() => Course.parse(c)).not.toThrow();
      expect(c.subtitle).toMatch(/Beispielinhalt/);
      expect(c.access).toBe('member');
      expect(['club', 'orangerie']).toContain(c.area);
      expect(c.lessons.map((l) => l.preview === true)).toEqual(c.lessons.map((_, i) => i === 0));
    }
  });

  it('academy keeps the risk lessons: each ends with the warning callout, no media blocks', () => {
    const c = cat.get('trading-basic-academy')!;
    const types = new Set<LessonBlock['type']>();
    for (const l of c.lessons) {
      const last = l.blocks[l.blocks.length - 1]!;
      expect(last).toMatchObject({ type: 'callout', tone: 'warning' });
      expect(JSON.stringify(last)).toMatch(/Anlageberatung/);
      for (const b of l.blocks) types.add(b.type);
    }
    expect([...types].sort()).toEqual(['bullets', 'callout', 'heading', 'paragraph']);
    expect(JSON.stringify(c)).not.toMatch(/https?:\/\//);
  });

  it('summary totals lesson minutes and carries the preview flag', () => {
    const s = cat.summaries().find((x) => x.slug === 'trading-basic-academy')!;
    expect(s.lessonCount).toBe(4);
    expect(s.totalMin).toBe(8 + 9 + 7 + 8);
    expect(s.lessons[0]).toMatchObject({ preview: true });
    expect(s.lessons[1]).not.toHaveProperty('preview');
    expect(s).not.toHaveProperty('lessons.0.blocks');
  });
});

describe('loadCourses', () => {
  it('missing content dir → empty catalog', () => {
    expect(loadCourses(join(t.dir, 'nope')).size).toBe(0);
  });

  it('fails LOUDLY on a schema violation, naming the file and the issue', () => {
    writeCourse(t.dir, 'kaputt', { slug: 'kaputt', title: 'X', lessons: [] });
    expect(() => loadCourses(t.dir)).toThrow(CourseLoadError);
    expect(() => loadCourses(t.dir)).toThrow(/kaputt[\\/]course\.json[\s\S]*lessons/);
  });

  it('fails on invalid JSON, slug/dir mismatch, duplicate lesson slugs, missing course.json', () => {
    const cases: Array<[string, unknown, RegExp]> = [
      ['bad-json', '{ nope', /invalid JSON/],
      ['mismatch', minimal('other-slug'), /must equal its directory/],
      ['dupes', { ...minimal('dupes'), lessons: [minimal('x').lessons[0], minimal('x').lessons[0]] }, /duplicate lesson/],
      // A KNOWN block type in a bad shape fails loudly (an unknown type passes through, see below).
      ['bad-block', minimal('bad-block', [{ type: 'paragraph' }]), /invalid course/],
      ['bad-embed', minimal('bad-embed', [{ type: 'embed', provider: 'youtube', url: 'https://vimeo.com/1' }]), /invalid course/],
    ];
    for (const [slug, body, re] of cases) {
      const tt = tempDir();
      writeCourse(tt.dir, slug, body);
      expect(() => loadCourses(tt.dir)).toThrow(re);
      tt.cleanup();
    }
    mkdirSync(join(t.dir, 'courses', 'empty'), { recursive: true });
    expect(() => loadCourses(t.dir)).toThrow(/missing course\.json/);
  });

  it('rewrites relative lesson asset URLs to the static route; keeps external ones', () => {
    const d = writeCourse(
      t.dir,
      'medien',
      minimal('medien', [
        { type: 'image', url: 'bilder/chart 1.png', caption: 'Chart' },
        { type: 'video', url: 'https://example.com/v.mp4' },
      ]),
    );
    mkdirSync(join(d, 'bilder'));
    writeFileSync(join(d, 'bilder', 'chart 1.png'), 'x');
    const blocks = loadCourses(t.dir).get('medien')!.lessons[0]!.blocks;
    expect(blocks[0]).toEqual({ type: 'image', url: '/content/courses/medien/bilder/chart%201.png', caption: 'Chart' });
    expect(blocks[1]).toMatchObject({ url: 'https://example.com/v.mp4' });
  });

  it('passes an UNKNOWN block type through untouched (forward compat), URL not rewritten or served', () => {
    writeCourse(t.dir, 'neu', minimal('neu', [{ type: 'slides', url: 'deck.pdf', pages: 12 }]));
    const cat = loadCourses(t.dir);
    expect(cat.get('neu')!.lessons[0]!.blocks[0]).toEqual({ type: 'slides', url: 'deck.pdf', pages: 12 });
    expect(cat.hasAsset('/content/courses/neu/deck.pdf')).toBe(false);
  });

  it('file blocks: relative path rewritten + servable; course.json itself never is', () => {
    const d = writeCourse(t.dir, 'skript', minimal('skript', [{ type: 'file', url: 'skript.pdf', name: 'Skript', mime: 'application/pdf' }]));
    writeFileSync(join(d, 'skript.pdf'), '%PDF');
    const cat = loadCourses(t.dir);
    expect(cat.get('skript')!.lessons[0]!.blocks[0]).toMatchObject({ url: '/content/courses/skript/skript.pdf' });
    expect(cat.hasAsset('/content/courses/skript/skript.pdf')).toBe(true);
    expect(cat.hasAsset('/content/courses/skript/course.json')).toBe(false);
  });

  it('fails on a missing or escaping relative asset', () => {
    writeCourse(t.dir, 'fehlt', minimal('fehlt', [{ type: 'image', url: 'nicht-da.png' }]));
    expect(() => loadCourses(t.dir)).toThrow(/missing asset/);
    const t2 = tempDir();
    writeCourse(t2.dir, 'flucht', minimal('flucht', [{ type: 'image', url: '../../../etc/passwd' }]));
    expect(() => loadCourses(t2.dir)).toThrow(/unsafe asset path/);
    t2.cleanup();
  });
});
