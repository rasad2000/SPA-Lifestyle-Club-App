/**
 * Home (slide 1) content: the newsletter every visitor sees, prospects included.
 * ALL FICTIONAL (portfolio demo): the host's videos, the webinar, sessions, events and the
 * news posts (newest first; the newsletter for non-members). A post's `text` is what the
 * full-screen viewer slides in next to the image. A video
 * without `url` shows "Bald"; the WhatsApp button without `whatsappUrl` is inert.
 * Dates are generated relative to today so the demo never shows a past event.
 * Kept client-side for the demo; moves to the server/CMS later (docs/membership-model.md).
 */
import { TEXTURE_GLAS, TEXTURE_LICHT } from '@/ui/textures';

export type HomeVideo = {
  id: string;
  title: string;
  subtitle: string;
  /** YouTube / Vimeo / direct link; unset → "Bald". */
  url?: string;
  /** The article around the video (Home: tapping the tile opens it). */
  article?: string;
  /** The video frame's poster in the article: a palette material (ui/textures.ts). */
  texture?: number;
};

/** A newsletter post: a poster image (in the brand colours) + optional text. Newest first. */
export type NewsPost = { id: string; image: number; title: string; text?: string };

export type Session = { weekday: number; time: string; title: string; host: string };
export type HomeEvent = { date: Date; title: string; place: string };

/** Next occurrence of a weekday (1 = Monday … 5 = Friday) at hh:mm, local time. */
function nextWeekday(weekday: number, hh: number, mm: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(hh, mm, 0, 0);
  const delta = (weekday - (d.getDay() || 7) + 7) % 7;
  d.setDate(d.getDate() + delta);
  if (d <= from) d.setDate(d.getDate() + 7);
  return d;
}

function inDays(n: number, hh = 19, mm = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export const home = {
  videos: [
    // Article texts are fictional placeholders.
    {
      id: 'welcome',
      title: 'Willkommen im SPA Garden Club',
      subtitle: 'Livia Rosen · Begrüßung',
      // "Licht": sunlight through the glasshouse roof (the host's welcome).
      texture: TEXTURE_LICHT,
      article:
        'Schön, dass du da bist. Im SPA Garden Club triffst du Menschen, die ihre finanzielle Zukunft ' +
        'selbst in die Hand nehmen: mit klaren Regeln, echtem Austausch und einer Community, die dich weiterbringt.\n\n' +
        'In diesem Video erzählt Livia, wofür der Club steht und was dich in den nächsten Wochen erwartet.',
    },
    {
      id: 'intro',
      title: 'Was dich hier erwartet',
      subtitle: 'Livia Rosen · Kurze Präsentation',
      // "Glas": glasshouse panes and gold mullions (the presentation).
      texture: TEXTURE_GLAS,
      article:
        'Live-Webinare mit Marktanalyse, Signale mit klarem Entry und Stop Loss, die Trading Basic Academy ' +
        'und der Copytrader: ein kurzer Überblick, wie alles zusammenspielt.\n\n' +
        'Livia zeigt in wenigen Minuten, wie du als Mitglied startest.',
    },
  ] satisfies HomeVideo[],

  news: [
    {
      id: 'garden-salon',
      image: require('@/assets/images/news-garden-salon.jpg'),
      title: 'Garden Salon · On Tour',
      text:
        'Private Members Only.\n\nGespräche. Genuss. Wachstum.\n\n' +
        'Hamburg – jeden Sonntag, 15:00–18:00 Uhr\nWien – jeden Sonntag, 15:00–18:00 Uhr\n' +
        'Weitere Städte: coming soon.\n\nDer genaue Ort wird noch bekannt gegeben.',
    },
    {
      id: 'copytrader',
      image: require('@/assets/images/news-copytrader.jpg'),
      title: 'Copytrader',
      text: 'Ihr habt gewartet.\n\nDie Strategie unserer Mentoren, gespiegelt auf dein Konto.\n\nAb morgen live.',
    },
    {
      id: 'helena-voss',
      image: require('@/assets/images/news-private-session.jpg'),
      title: 'Become More · Private Session',
      text:
        'Special Speaker: Dr. Helena Voss\nDienstag · 21:00 Uhr\n\n' +
        'Wachstum beginnt mit dem, was du pflegst.\n\n' +
        'Private Session über: höhere Standards, klare Entscheidungen, einen starken Kopf. ' +
        'Es beginnt damit, wer du wirst.',
    },
  ] satisfies NewsPost[],

  webinar: {
    title: 'Marktanalyse: Gold & Forex',
    host: 'Clara Weiss',
    startsAt: nextWeekday(2, 19, 0),
    url: undefined as string | undefined,
  },

  sessions: [
    { weekday: 1, time: '19:00', title: 'Marktanalyse zum Wochenstart', host: 'Clara Weiss' },
    { weekday: 2, time: '19:00', title: 'Live-Webinar: Marktanalyse', host: 'Clara Weiss' },
    { weekday: 3, time: '18:30', title: 'Trading Basic Q&A', host: 'SPA Team' },
    { weekday: 4, time: '19:00', title: 'Copytrader-Sprechstunde', host: 'SPA Team' },
    { weekday: 5, time: '17:00', title: 'Wochenrückblick', host: 'Livia Rosen' },
  ] satisfies Session[],

  events: [
    { date: inDays(9, 19, 0), title: 'SPA Members Dinner', place: 'Frankfurt am Main' },
    { date: inDays(16, 10, 0), title: 'Forex Bootcamp · Live-Tag', place: 'Online' },
    { date: inDays(30, 18, 0), title: 'SPA Garden Night', place: 'Düsseldorf' },
  ] satisfies HomeEvent[],
  /** "Für mehr Infos" → WhatsApp SPA Garden Club (unset: the button is inert). */
  whatsappUrl: process.env.EXPO_PUBLIC_WHATSAPP_URL || undefined,
};
