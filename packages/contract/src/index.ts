/**
 * @spa/contract — the ONE schema shared by the server, the Expo app, and every
 * feed producer (today: the seed/replay tools; later: any live feed adapter,
 * which speaks this same wire format over HTTP).
 *
 * Wire rules:
 *  - All timestamps are ISO-8601 UTC strings.
 *  - A post is addressed by (channel, sourceId). sourceId is the PRODUCER's own
 *    stable id (e.g. the Telegram message id of the relayed copy), so an ingest
 *    PUT is an idempotent upsert: re-sending = edit, never a duplicate.
 *  - The server-side post id is derived, never invented: postId(channel, sourceId).
 *  - Media URLs are server-relative ("/media/<file>"); clients prefix their base URL.
 */
import { z } from 'zod';

export const API_VERSION = 'v1' as const;

// ---------------------------------------------------------------- primitives

/** Lowercase slug: channel ids and course slugs. */
export const Slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase slug (a-z, 0-9, single dashes)');

/** Producer-side id: free-form but bounded and path-safe. */
export const SourceId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'path-safe source id');

export const IsoDate = z.iso.datetime({ offset: true });

export const postId = (channel: string, sourceId: string): string => `${channel}:${sourceId}`;

/**
 * Natural-order sort key for a sourceId, used as the tiebreak between posts with
 * the SAME createdAt (Telegram dates are second-precision; album members share
 * one). Comparing raw ids as text would put "9999" after "10000"; here every digit
 * run becomes <3-digit length><digits> (leading zeros dropped), so numeric runs
 * compare by value. ASCII only (SourceId is ASCII), so SQLite's BINARY collation
 * and JS string comparison agree — the server's ORDER BY and every client's
 * comparator MUST both use this key, or paging and live inserts disagree.
 */
export function sourceSortKey(sourceId: string): string {
  return sourceId.replace(/\d+/g, (run) => {
    const digits = run.replace(/^0+(?=\d)/, '');
    return String(digits.length).padStart(3, '0') + digits;
  });
}

// ---------------------------------------------------------------- channels

/**
 * `stream`  — a chat-like feed of free-text posts (the relayed Telegram feeds).
 * `signals` — structured signal cards (pair / direction / entries / stop / targets).
 */
export const ChannelKind = z.enum(['stream', 'signals']);

/** Access tier. POC serves everything; `member` is the hook for the later login gate. */
export const Access = z.enum(['public', 'member']);

export const Channel = z.object({
  id: Slug,
  title: z.string().min(1).max(80),
  subtitle: z.string().max(200).optional(),
  kind: ChannelKind,
  access: Access.default('public'),
  /** Hex accent used for the channel's glass tint, e.g. "#8B5CF6". */
  accent: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** True for demonstration data (static snapshots) — the UI labels it. */
  demo: z.boolean().default(false),
  /** Display order, ascending. */
  order: z.number().int().default(0),
});
export type Channel = z.infer<typeof Channel>;

/** Server response shape: channel + live counters. */
export const ChannelSummary = Channel.extend({
  postCount: z.number().int().nonnegative(),
  lastPostAt: IsoDate.nullable(),
});
export type ChannelSummary = z.infer<typeof ChannelSummary>;

// ---------------------------------------------------------------- media

export const Media = z.object({
  id: z.string().min(1),
  url: z.string().startsWith('/media/'),
  kind: z.enum(['image']),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type Media = z.infer<typeof Media>;

// ---------------------------------------------------------------- signals

export const Direction = z.enum(['buy', 'sell']);
export type Direction = z.infer<typeof Direction>;

/**
 * Structured levels. Prices stay STRINGS on purpose: they are rendered verbatim
 * as the producer wrote them (no float re-formatting, no invented precision).
 */
/**
 * The trade's latest milestone, derived by the PRODUCER from the desk's own follow-ups
 * (replies like "TP3 HIT +180 pips", "Make your trade risk free", "SL hit"). The
 * producer re-upserts the parent post when a milestone arrives, so the card updates
 * live. Pips are the desk's stated figure, verbatim (never computed by us here).
 */
export const SignalProgress = z.object({
  /** tp = a take-profit was reached; breakeven = SL moved to entry / "risk free";
   *  sl = stopped out; closed = closed manually (profit or not). */
  kind: z.enum(['tp', 'breakeven', 'sl', 'closed']),
  /** Highest take-profit number reached so far (kind "tp"; may also ride "closed"). */
  tp: z.number().int().min(1).max(20).optional(),
  /** Stated pips, verbatim as the desk wrote them, e.g. "+180". */
  pips: z.string().max(20).optional(),
  /** When the milestone was posted. */
  at: IsoDate.optional(),
});
export type SignalProgress = z.infer<typeof SignalProgress>;

export const SignalLevels = z.object({
  pair: z.string().min(1).max(40),
  direction: Direction.nullable(),
  /** The producer's own wording, e.g. "Bullish", "SELL LIMIT". */
  directionLabel: z.string().max(40).optional(),
  timeframe: z.string().max(40).optional(),
  entries: z.array(z.string().max(40)).max(10).default([]),
  stop: z.string().max(40).optional(),
  targets: z.array(z.string().max(40)).max(10).default([]),
  /** Producer status, normalized lower-case where known. */
  status: z.enum(['active', 'inactive', 'invalid', 'closed']).optional(),
  author: z.string().max(80).optional(),
  notes: z.string().max(4000).optional(),
  progress: SignalProgress.optional(),
});
export type SignalLevels = z.infer<typeof SignalLevels>;

// ---------------------------------------------------------------- posts

export const Post = z.object({
  id: z.string(),
  channel: Slug,
  sourceId: SourceId,
  text: z.string().max(8000),
  signal: SignalLevels.optional(),
  media: z.array(Media).default([]),
  /** Server post id of the parent (reply-thread), when the parent is known. */
  replyTo: z.string().optional(),
  /** Inline quote of the parent so a feed row can render "reply to …" without a fetch. */
  replyPreview: z
    .object({
      id: z.string(),
      /** Parent text, truncated server-side to ~160 chars. */
      text: z.string(),
      hasMedia: z.boolean(),
      pair: z.string().optional(),
    })
    .optional(),
  replyCount: z.number().int().nonnegative().default(0),
  /**
   * The post's whole reply TREE in one line (any depth: the desk sometimes answers its
   * own update): how many updates followed and the newest one. Present only when
   * there is at least one. Lets a feed card carry its trade's latest state without
   * the replies being in the list (the "Trades" view).
   */
  thread: z
    .object({
      updates: z.number().int().positive(),
      last: z.object({
        id: z.string(),
        /** Truncated server-side to ~160 chars. */
        text: z.string(),
        hasMedia: z.boolean(),
        createdAt: IsoDate,
      }),
    })
    .optional(),
  createdAt: IsoDate,
  editedAt: IsoDate.optional(),
});
export type Post = z.infer<typeof Post>;

// ---------------------------------------------------------------- courses (club-owned content)

/*
 * Lessons are structured blocks rather than Markdown: no render library needed,
 * and every block maps 1:1 to a styled native component.
 *
 * FORWARD COMPATIBILITY — deliberately ASYMMETRIC (the shape of future course
 * material is unknown: videos, PDFs, slides, a headless CMS …):
 *  - `LessonBlock` (the wire / server schema) is STRICT for every KNOWN type — a
 *    malformed known block fails the server's boot-time validation loudly — but an
 *    UNKNOWN `type` passes through untouched (`UnknownLessonBlock`), so a newer
 *    content source can ship a block type before every client understands it.
 *  - `LenientLessonBlock` (what CLIENTS parse with, via `LenientCourseResponse`)
 *    never rejects: an unknown type OR a known type in a shape this build doesn't
 *    understand becomes `{ type: 'unsupported', originalType, url? }`, which the app
 *    renders as a neutral "not displayable in this app version" card. One odd block
 *    must never take the whole course down on an older app build.
 */

/** Third-party players: YouTube/Vimeo must play in THEIR OWN embedded player (ToS) — never extract streams. */
export const EmbedProvider = z.enum(['youtube', 'vimeo', 'url']);
export type EmbedProvider = z.infer<typeof EmbedProvider>;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function parseUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/** YouTube video id from watch / youtu.be / embed / shorts / live / nocookie URLs, else null. */
export function youtubeId(url: string): string | null {
  const u = parseUrl(url);
  if (!u) return null;
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = u.pathname.split('/');
    if (first === 'watch') id = u.searchParams.get('v');
    else if (first === 'embed' || first === 'shorts' || first === 'live' || first === 'v') id = second ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

/** Vimeo { id, hash? } from vimeo.com/<id>[/<hash>] or player.vimeo.com/video/<id>[?h=hash], else null. */
export function vimeoRef(url: string): { id: string; hash?: string } | null {
  const u = parseUrl(url);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  let hash: string | undefined;
  if (host === 'vimeo.com') [id, hash] = parts;
  else if (host === 'player.vimeo.com' && parts[0] === 'video') {
    id = parts[1];
    hash = u.searchParams.get('h') ?? undefined;
  }
  if (!id || !/^\d+$/.test(id)) return null;
  return hash && /^[0-9a-f]+$/i.test(hash) ? { id, hash } : { id };
}

/**
 * The provider's OWN embeddable player URL for an embed block (null = not embeddable).
 * youtube-nocookie: privacy-enhanced mode (no tracking cookie until playback).
 */
export function embedPlayerUrl(block: { provider: EmbedProvider; url: string }): string | null {
  if (block.provider === 'youtube') {
    const id = youtubeId(block.url);
    return id ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0` : null;
  }
  if (block.provider === 'vimeo') {
    const v = vimeoRef(block.url);
    return v ? `https://player.vimeo.com/video/${v.id}${v.hash ? `?h=${v.hash}` : ''}` : null;
  }
  const u = parseUrl(block.url);
  return u && u.protocol === 'https:' ? u.toString() : null;
}

/** Absolute http(s) URL. */
const WebUrl = z.string().refine((s) => parseUrl(s) !== null, 'absolute http(s) URL');

/** Course-relative asset path ("chart.png", rewritten by the server) or an absolute URL. */
const AssetUrl = z.string().min(1);

const EmbedBlock = z
  .object({
    type: z.literal('embed'),
    provider: EmbedProvider,
    url: WebUrl,
    caption: z.string().optional(),
  })
  .refine((b) => embedPlayerUrl(b) !== null, {
    message: 'url is not an embeddable video of this provider (youtube/vimeo link, or an https URL)',
    path: ['url'],
  });

export const KnownLessonBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: z.string().min(1) }),
  z.object({ type: z.literal('paragraph'), text: z.string().min(1) }),
  z.object({ type: z.literal('bullets'), items: z.array(z.string().min(1)).min(1) }),
  z.object({
    type: z.literal('callout'),
    tone: z.enum(['info', 'warning', 'success']).default('info'),
    title: z.string().optional(),
    text: z.string().min(1),
  }),
  z.object({ type: z.literal('image'), url: AssetUrl, caption: z.string().optional() }),
  /** Self-hosted video file (played natively). Third-party players are `embed`. */
  z.object({ type: z.literal('video'), url: AssetUrl, caption: z.string().optional() }),
  EmbedBlock,
  /** A downloadable document (e.g. a PDF), opened in the system browser / viewer. */
  z.object({
    type: z.literal('file'),
    url: AssetUrl,
    name: z.string().min(1).max(200),
    mime: z.string().max(100).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal('link'), url: WebUrl, label: z.string().min(1).max(200) }),
]);
export type KnownLessonBlock = z.infer<typeof KnownLessonBlock>;

export const KNOWN_LESSON_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'bullets',
  'callout',
  'image',
  'video',
  'embed',
  'file',
  'link',
] as const satisfies readonly KnownLessonBlock['type'][];
const KNOWN_TYPES: ReadonlySet<string> = new Set(KNOWN_LESSON_BLOCK_TYPES);

/** A block type this schema version doesn't know: passed through untouched (fields kept). */
export const UnknownLessonBlock = z.looseObject({
  type: z
    .string()
    .min(1)
    .refine((t) => !KNOWN_TYPES.has(t), 'known block type in an invalid shape'),
});
export type UnknownLessonBlock = z.infer<typeof UnknownLessonBlock>;

/** Wire / server schema: strict for known types, unknown types pass through (see above). */
export const LessonBlock = z.union([KnownLessonBlock, UnknownLessonBlock]);
export type LessonBlock = z.infer<typeof LessonBlock>;

export const isKnownLessonBlock = (b: LessonBlock): b is KnownLessonBlock => KNOWN_TYPES.has(b.type);

/** What a client renders for a block it can't: a neutral card, plus an "open" link when there is a URL. */
export type UnsupportedLessonBlock = { type: 'unsupported'; originalType: string; url?: string };

function toUnsupported(raw: unknown): UnsupportedLessonBlock {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  // Idempotent: a cached, already-degraded block re-parses to itself.
  const originalType =
    o.type === 'unsupported' && typeof o.originalType === 'string'
      ? o.originalType
      : typeof o.type === 'string'
        ? o.type
        : 'unbekannt';
  return { type: 'unsupported', originalType, ...(typeof o.url === 'string' && o.url ? { url: o.url } : {}) };
}

/** Client schema: never fails — anything not a valid known block degrades to `unsupported`. */
export const LenientLessonBlock = z.union([KnownLessonBlock, z.unknown().transform(toUnsupported)]);
export type LenientLessonBlock = z.infer<typeof LenientLessonBlock>;

function courseSchemas<B extends z.ZodType>(block: B) {
  const Lesson = z.object({
    slug: Slug,
    title: z.string().min(1).max(120),
    durationMin: z.number().int().positive().optional(),
    /** Open to everyone even when the course is members-only (the teaser that sells it). */
    preview: z.boolean().optional(),
    blocks: z.array(block).min(1),
  });
  const Course = z.object({
    slug: Slug,
    title: z.string().min(1).max(120),
    subtitle: z.string().max(240).optional(),
    level: z.enum(['einsteiger', 'fortgeschritten', 'profi']).optional(),
    access: Access.default('public'),
    /** Which members area lists it (Mitglieder: SPA Garden Club or the Orangerie). */
    area: z.enum(['club', 'orangerie']).optional(),
    accent: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    order: z.number().int().default(0),
    lessons: z.array(Lesson).min(1),
  });
  return { Lesson, Course };
}

const strictCourse = courseSchemas(LessonBlock);
export const Lesson = strictCourse.Lesson;
export type Lesson = z.infer<typeof Lesson>;
export const Course = strictCourse.Course;
export type Course = z.infer<typeof Course>;

/** Client-side course: same shape, lenient blocks (see the forward-compat note above). */
export const LenientCourse = courseSchemas(LenientLessonBlock).Course;
export type LenientCourse = z.infer<typeof LenientCourse>;
export type LenientLesson = LenientCourse['lessons'][number];

export const CourseSummary = Course.omit({ lessons: true }).extend({
  lessonCount: z.number().int().nonnegative(),
  totalMin: z.number().int().nonnegative(),
  lessons: z.array(Lesson.pick({ slug: true, title: true, durationMin: true, preview: true })),
});
export type CourseSummary = z.infer<typeof CourseSummary>;

// ---------------------------------------------------------------- read API responses

export const HealthResponse = z.object({
  ok: z.literal(true),
  version: z.string(),
  serverTime: IsoDate,
  posts: z.number().int().nonnegative(),
  /** The server exposes the presenter demo endpoints (`POST /v1/demo/run|reset`). */
  demoControls: z.boolean().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/**
 * POST /v1/demo/run — presenter demo: the server replays a scripted signal sequence into
 * `channel` (posts appear live, one by one). `startedAt` lets a client hide everything
 * older, so the feed starts empty. Only when the server runs with DEMO_CONTROLS=1.
 */
export const DemoRunResponse = z.object({
  channel: Slug,
  startedAt: IsoDate,
  steps: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});
export type DemoRunResponse = z.infer<typeof DemoRunResponse>;

/** POST /v1/demo/reset — stops a running demo and deletes every demo post. */
export const DemoResetResponse = z.object({ deleted: z.number().int().nonnegative() });
export type DemoResetResponse = z.infer<typeof DemoResetResponse>;

export const ChannelsResponse = z.object({ channels: z.array(ChannelSummary) });
export type ChannelsResponse = z.infer<typeof ChannelsResponse>;

/** Newest first. Pass `nextBefore` back as `?before=` to page older. */
export const PostsPage = z.object({
  posts: z.array(Post),
  nextBefore: z.string().nullable(),
});
export type PostsPage = z.infer<typeof PostsPage>;

export const PostThread = z.object({
  post: Post,
  parent: Post.nullable(),
  /** Oldest first — a thread reads top-down. */
  replies: z.array(Post),
  /**
   * Id of the top of this post's reply chain (the post itself when it replies to
   * nothing). A client opened on a reply re-opens the root to show the whole trade.
   */
  rootId: z.string().optional(),
  /** Every descendant of `post` at any depth, oldest first (the trade's timeline). */
  timeline: z.array(Post).optional(),
});
export type PostThread = z.infer<typeof PostThread>;

export const CoursesResponse = z.object({ courses: z.array(CourseSummary) });
export type CoursesResponse = z.infer<typeof CoursesResponse>;

export const CourseResponse = z.object({ course: Course });
export type CourseResponse = z.infer<typeof CourseResponse>;

/** What clients parse GET /v1/courses/:slug with: never rejects a course over one block. */
export const LenientCourseResponse = z.object({ course: LenientCourse });
export type LenientCourseResponse = z.infer<typeof LenientCourseResponse>;

// ---------------------------------------------------------------- live (WebSocket /v1/live)

export const LiveEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), serverTime: IsoDate }),
  z.object({ type: z.literal('post.upsert'), post: Post, isNew: z.boolean() }),
  z.object({ type: z.literal('post.delete'), id: z.string(), channel: Slug }),
  z.object({ type: z.literal('ping'), serverTime: IsoDate }),
]);
export type LiveEvent = z.infer<typeof LiveEvent>;

// ---------------------------------------------------------------- ingest API (producers; bearer token)

/** PUT /v1/ingest/channels/:id — body is the channel minus its id. */
export const IngestChannel = Channel.omit({ id: true });
export type IngestChannel = z.input<typeof IngestChannel>;

/** PUT /v1/ingest/posts/:channel/:sourceId — idempotent upsert (re-PUT = edit). */
export const IngestPost = z.object({
  text: z.string().max(8000).default(''),
  signal: SignalLevels.optional(),
  /** Ids returned by POST /v1/ingest/media, in display order. */
  mediaIds: z.array(z.string().min(1)).max(10).default([]),
  /** Producer-side id of the parent post in the SAME channel. */
  replyToSourceId: SourceId.optional(),
  /** Original publish time; defaults to server receive time. */
  createdAt: IsoDate.optional(),
  editedAt: IsoDate.optional(),
});
export type IngestPost = z.input<typeof IngestPost>;

export const IngestPostResponse = z.object({ post: Post, isNew: z.boolean() });
export type IngestPostResponse = z.infer<typeof IngestPostResponse>;

/** POST /v1/ingest/media — raw image bytes (Content-Type image/jpeg|png|webp). */
export const IngestMediaResponse = z.object({ media: Media });
export type IngestMediaResponse = z.infer<typeof IngestMediaResponse>;

export const ApiError = z.object({ error: z.string(), details: z.unknown().optional() });
export type ApiError = z.infer<typeof ApiError>;
