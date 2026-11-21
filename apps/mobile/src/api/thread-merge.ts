/**
 * Apply one live event to an open thread (pure; tested). Returns the same
 * object when the event doesn't touch this thread, so callers can bail out.
 *
 * A re-PUT may move a reply to another parent (the server then re-broadcasts the
 * reply plus both parents): a reply that no longer points at this post leaves the
 * list, and if this post itself got a new parent, the held parent is dropped —
 * the event doesn't carry the new parent, and showing the old one would be wrong.
 */
import type { LiveEvent, Post, PostThread } from '@spa/contract';

import { removePost, upsertPost } from './feed-merge';

/** Oldest first, the server's thread order (createdAt, then id). */
function byTime(a: Post, b: Post): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The trade TIMELINE (every descendant, any depth): a post belongs while its
 * `replyTo` is the thread's post or another timeline entry. An update to a held
 * entry replaces it (or drops it if it left the tree); a new one is inserted in
 * time order. Returns the same array when nothing changed.
 */
function applyTimeline(thread: PostThread, e: LiveEvent): Post[] | undefined {
  const timeline = thread.timeline;
  if (!timeline) return timeline;
  if (e.type === 'post.delete') {
    return timeline.some((p) => p.id === e.id) ? timeline.filter((p) => p.id !== e.id) : timeline;
  }
  if (e.type !== 'post.upsert') return timeline;
  const p = e.post;
  const inTree = (id: string | undefined) => id != null && (id === thread.post.id || timeline.some((t) => t.id === id && t.id !== p.id));
  const held = timeline.some((t) => t.id === p.id);
  if (held) {
    return inTree(p.replyTo) ? timeline.map((t) => (t.id === p.id ? p : t)) : timeline.filter((t) => t.id !== p.id);
  }
  return inTree(p.replyTo) ? [...timeline, p].sort(byTime) : timeline;
}

export function applyThreadEvent(thread: PostThread, e: LiveEvent): PostThread {
  const timeline = applyTimeline(thread, e);
  const next = applyDirect(thread, e);
  return timeline === thread.timeline ? next : { ...next, timeline };
}

function applyDirect(thread: PostThread, e: LiveEvent): PostThread {
  if (e.type === 'post.upsert') {
    const p = e.post;
    if (p.id === thread.post.id) {
      const parentMoved = thread.parent != null && p.replyTo !== thread.parent.id;
      return { ...thread, post: p, ...(parentMoved ? { parent: null } : {}) };
    }
    if (thread.parent && p.id === thread.parent.id) return { ...thread, parent: p };
    if (p.replyTo === thread.post.id) {
      // Replies read oldest-first; upsertPost keeps newest-first order, so reverse around it.
      const replies = upsertPost(thread.replies.slice().reverse(), p).reverse();
      return { ...thread, replies };
    }
    if (thread.replies.some((r) => r.id === p.id)) {
      return { ...thread, replies: removePost(thread.replies, p.id) }; // moved to another parent
    }
    return thread;
  }
  if (e.type === 'post.delete') {
    if (thread.replies.some((p) => p.id === e.id)) {
      return { ...thread, replies: removePost(thread.replies, e.id) };
    }
    if (thread.parent?.id === e.id) return { ...thread, parent: null };
  }
  return thread;
}
