/** Pure access rules for the members area (unit-tested; the viewer store lives in api/viewer.ts). */
export type Viewer = 'prospect' | 'club' | 'orangerie';
export type Area = 'club' | 'orangerie';

/** Demo unlock rule: club members open the club area; Orangerie members open both. */
export function canAccess(v: Viewer, area: Area): boolean {
  if (area === 'club') return v === 'club' || v === 'orangerie';
  return v === 'orangerie';
}

/** A lesson is open when its course's area is open, or it is a marked preview. */
export function canOpenLesson(v: Viewer, area: Area | undefined, access: 'public' | 'member', preview?: boolean): boolean {
  if (access === 'public' || preview) return true;
  return canAccess(v, area ?? 'club');
}
