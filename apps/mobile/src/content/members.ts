/**
 * Mitglieder (slide 2) layout per area: SPA Garden Club and the Orangerie. Courses
 * themselves come from the server (`course.area`); this file holds the non-course tiles:
 * tools, videos and outbound links. ALL PLACEHOLDERS: a link without `url` is inert,
 * a video without `url` shows "Bald".
 */
import type { IconName } from '@/ui/Icon';

import type { HomeVideo } from './home';

export type MemberLink = { title: string; subtitle: string; icon: IconName; url?: string };
export type MemberTool = { title: string; subtitle: string; icon: IconName };

export const members = {
  club: {
    tools: [
      { title: 'Positionsgrößen-Rechner', subtitle: 'Lots aus Risiko und Stop-Abstand', icon: 'tools' },
      { title: 'Pip-Rechner', subtitle: 'Pip-Wert je Paar und Kontowährung', icon: 'tools' },
      { title: 'Wirtschaftskalender', subtitle: 'Termine, die den Markt bewegen', icon: 'calendar' },
    ] satisfies MemberTool[],
    /** "Noch nicht in der Orangerie?" → explainer video. */
    noOrangerie: {
      id: 'no-orangerie',
      title: 'Noch nicht in der Orangerie?',
      subtitle: 'Erklärvideo · Was die Orangerie bietet',
    } satisfies HomeVideo,
  },
  orangerie: {
    firstSteps: {
      id: 'orangerie-first-steps',
      title: 'Erste Schritte in der Orangerie',
      subtitle: 'Erklärvideo · So funktioniert alles',
    } satisfies HomeVideo,
    links: [
      { title: 'Orangerie Live', subtitle: 'Live-Sessions auf der Plattform', icon: 'live' },
      { title: 'Bootcamps', subtitle: 'Alle Orangerie-Bootcamps', icon: 'academy' },
      { title: 'WhatsApp-Community', subtitle: 'Die Orangerie-Gruppen', icon: 'community' },
    ] satisfies MemberLink[],
  },
};
