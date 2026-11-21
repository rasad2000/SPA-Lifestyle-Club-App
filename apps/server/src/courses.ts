/**
 * Club-owned course material, loaded from content/courses/<slug>/course.json.
 *
 * Validated ONCE at startup against the contract's Course schema and the
 * server REFUSES TO START on a bad file (naming the file and the zod issue):
 * course content is authored by hand, and a silently-skipped lesson is worse
 * than a loud boot failure the author sees immediately.
 *
 * Lesson image/video/file URLs may be relative to the course directory
 * ("chart.png", "skript.pdf"); they are rewritten to the static route
 * /content/courses/<slug>/<file> and must exist on disk. ONLY those referenced
 * files are servable (`hasAsset`): course.json itself, drafts or notes lying in a
 * course folder never leak through the static route — which matters once
 * `access: 'member'` gates the course API.
 *
 * Unknown block types (contract: forward-compat passthrough) are kept verbatim and
 * never touch the filesystem — their URLs, if any, are not rewritten or served.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { Course, isKnownLessonBlock, type CourseSummary, type LessonBlock } from '@spa/contract';
import { resolveInside, safeSegments } from './static.ts';

export class CourseLoadError extends Error {}

export interface CourseCatalog {
  summaries(): CourseSummary[];
  get(slug: string): Course | undefined;
  /** True only for a static path some lesson block references ("/content/courses/<slug>/…"). */
  hasAsset(path: string): boolean;
  size: number;
}

const isExternal = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/');

export function courseAssetUrl(slug: string, segments: string[]): string {
  return `/content/courses/${slug}/${segments.map(encodeURIComponent).join('/')}`;
}

function rewriteBlock(block: LessonBlock, slug: string, dir: string, file: string, assets: Set<string>): LessonBlock {
  if (!isKnownLessonBlock(block)) return block; // forward-compat passthrough, untouched
  if ((block.type !== 'image' && block.type !== 'video' && block.type !== 'file') || isExternal(block.url)) return block;
  const segs = safeSegments(block.url);
  const abs = segs && segs.length ? resolveInside(dir, segs) : null;
  if (!segs || !abs) throw new CourseLoadError(`${file}: unsafe asset path "${block.url}"`);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new CourseLoadError(`${file}: missing asset "${block.url}"`);
  const url = courseAssetUrl(slug, segs);
  assets.add(url);
  return { ...block, url };
}

export function toSummary(c: Course): CourseSummary {
  const { lessons, ...rest } = c;
  return {
    ...rest,
    lessonCount: lessons.length,
    totalMin: lessons.reduce((n, l) => n + (l.durationMin ?? 0), 0),
    lessons: lessons.map((l) => ({
      slug: l.slug,
      title: l.title,
      ...(l.durationMin ? { durationMin: l.durationMin } : {}),
      ...(l.preview ? { preview: true } : {}),
    })),
  };
}

/** Load + validate every course; throws CourseLoadError on the first bad file. */
export function loadCourses(contentDir: string): CourseCatalog {
  const root = join(contentDir, 'courses');
  const courses = new Map<string, Course>();
  const assets = new Set<string>();
  const dirs = existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    : [];

  for (const d of dirs) {
    const dir = join(root, d.name);
    const file = join(dir, 'course.json');
    if (!existsSync(file)) throw new CourseLoadError(`${dir}: missing course.json`);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new CourseLoadError(`${file}: invalid JSON — ${(e as Error).message}`);
    }
    const parsed = Course.safeParse(json);
    if (!parsed.success) throw new CourseLoadError(`${file}: invalid course\n${z.prettifyError(parsed.error)}`);
    const course = parsed.data;
    if (course.slug !== d.name) {
      throw new CourseLoadError(`${file}: slug "${course.slug}" must equal its directory name "${d.name}"`);
    }
    const seen = new Set<string>();
    for (const l of course.lessons) {
      if (seen.has(l.slug)) throw new CourseLoadError(`${file}: duplicate lesson slug "${l.slug}"`);
      seen.add(l.slug);
    }
    courses.set(course.slug, {
      ...course,
      lessons: course.lessons.map((l) => ({ ...l, blocks: l.blocks.map((b) => rewriteBlock(b, course.slug, dir, file, assets)) })),
    });
  }

  const sorted = [...courses.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'de'));
  const summaries = sorted.map(toSummary);
  return {
    summaries: () => summaries,
    get: (slug) => courses.get(slug),
    hasAsset: (path) => assets.has(path),
    size: courses.size,
  };
}
