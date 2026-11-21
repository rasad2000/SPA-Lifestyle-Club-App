import type { Post } from '@spa/contract';

/** Minimal valid post; `minute` sets createdAt so ordering is easy to read. */
export function post(id: string, minute: number, extra: Partial<Post> = {}): Post {
  return {
    id: `ch:${id}`,
    channel: 'ch',
    sourceId: id,
    text: `post ${id}`,
    media: [],
    replyCount: 0,
    createdAt: new Date(Date.UTC(2026, 9, 8, 10, minute)).toISOString(),
    ...extra,
  };
}

export const ids = (posts: readonly Post[]) => posts.map((p) => p.sourceId);
