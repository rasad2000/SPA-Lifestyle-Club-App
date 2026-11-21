/**
 * Every user-visible string. German only (the community is German); kept in one
 * typed object so a later English locale is a second object of the same shape.
 */
import { formatNumber } from '../lib/format';

export const de = {
  tabs: { home: 'Home', members: 'Mitglieder', feed: 'Signale' },

  common: {
    retry: 'Erneut versuchen',
    loading: 'Lädt …',
    demo: 'Demo',
    edited: 'bearbeitet',
    close: 'Schließen',
    showMore: 'Mehr anzeigen',
    showLess: 'Weniger anzeigen',
    offlineCached: 'Offline – gespeicherte Inhalte',
  },

  errors: {
    network: 'Server nicht erreichbar. Prüfe deine Verbindung.',
    http: (status: number) => `Der Server hat mit Fehler ${status} geantwortet.`,
    schema: 'Die Antwort des Servers hatte ein unerwartetes Format.',
    notFound: 'Nicht gefunden.',
    config: 'Diese App-Version ist ohne Server-Adresse gebaut worden und kann keine Inhalte laden.',
    title: 'Laden fehlgeschlagen',
  },

  live: {
    state: 'Live-Status',
    live: 'Live',
    connecting: 'Verbinde …',
    offline: 'Offline',
  },

  // Presenter demo (header button; only when the server enables DEMO_CONTROLS).
  demo: {
    start: 'Demo',
    stop: 'Beenden',
    startHint: 'Leert den Feed und spielt eine Live-Signalfolge ab',
    stopHint: 'Beendet die Demo und zeigt wieder den ganzen Feed',
    waiting: 'Warte auf Signale …',
  },

  feed: {
    title: 'Signale',
    empty: 'Noch keine Beiträge in diesem Kanal.',
    noChannels: 'Keine Kanäle verfügbar.',
    end: 'Du bist am Anfang des Kanals angekommen.',
    newPosts: (n: number) => (n === 1 ? '1 neuer Beitrag' : `${n} neue Beiträge`),
    replies: (n: number) => (n === 1 ? '1 Antwort' : `${n} Antworten`),
    openThread: 'Verlauf',
    replyTo: 'Antwort auf',
    media: 'Bild',
    // Neutral on purpose: covers both the static snapshots AND the scripted
    // live-push demo channel (which is demo data but very much not static).
    demoSnapshot: 'Demo-Daten',
    posts: (n: number) => (n === 1 ? '1 Beitrag' : `${formatNumber(n)} Beiträge`),
    // Shown under every channel header and thread: a reader must not see actionable
    // levels without a risk notice just because they never opened the Info tab.
    risk: 'Keine Anlageberatung · Handel mit hohem Verlustrisiko',
    riskHint: 'Zeigt den vollständigen Risikohinweis',
  },

  // The trade cockpit: "Trades" = signal cards only (updates tracked ON the card),
  // "Alle" = every post incl. chatter. Trading terms stay English.
  trade: {
    views: { trades: 'Trades', all: 'Alle' },
    viewsLabel: 'Ansicht',
    updates: (n: number) => (n === 1 ? '1 Update' : `${n} Updates`),
    timeline: 'Verlauf',
    noUpdates: 'Noch keine Updates zu diesem Trade.',
    state: {
      won: 'ALL TPs HIT',
      stopped: 'STOPPED',
      closed: 'CLOSED',
    },
    newTrade: 'Neuer Trade',
  },

  thread: {
    title: 'Beitrag',
    parent: 'Bezieht sich auf',
    replies: 'Antworten',
    noReplies: 'Noch keine Antworten.',
    deleted: 'Dieser Beitrag wurde gelöscht.',
    toFeed: 'Zum Feed',
  },

  // Trading terms stay in English, as the community uses them (BUY/SELL, NOW/LIMIT,
  // ENTRY, STOP LOSS, TP1, "TP3 HIT"); the surrounding UI is German.
  signal: {
    buy: 'BUY',
    sell: 'SELL',
    neutral: 'SIGNAL',
    entry: 'Entry',
    entryZone: 'Entry Zone',
    entryMarket: 'Market',
    zoneTo: (high: string) => `bis ${high}`,
    stop: 'Stop Loss',
    targets: 'Take Profit',
    target: (i: number) => `TP${i}`,
    timeframe: 'Zeitrahmen',
    author: (name: string) => `von ${name}`,
    orderType: {
      market: 'NOW',
      limit: 'LIMIT',
      stop: 'STOP',
    },
    highRisk: 'High Risk',
    copied: 'Kopiert',
    copyHint: 'Tippen zum Kopieren',
    // Demo snapshots: the status is frozen at scrape time, so it is labelled as such
    // (a green "aktiv" days later reads as "running now").
    statusAtCapture: (status: string) => `Status bei Erfassung: ${status}`,
    notes: 'Notizen',
    status: {
      active: 'aktiv',
      inactive: 'inaktiv',
      invalid: 'ungültig',
      closed: 'geschlossen',
    },
    none: '–',
    // Trade milestone from the desk's own follow-ups (SignalProgress). Pips are the
    // desk's stated figure, so they are attributed, never presented as our metric.
    progress: {
      tp: (tp: number) => `TP${tp} HIT`,
      breakeven: 'RISK FREE',
      sl: 'SL HIT',
      closed: 'CLOSED',
      closedAfterTp: (tp: number) => `CLOSED · TP${tp}`,
      pips: (pips: string) => `${pips} Pips`,
      pipsSource: 'laut Desk',
      reached: 'erreicht',
    },
  },

  courses: {
    title: 'Kurse',
    empty: 'Noch keine Kurse veröffentlicht.',
    lessons: (n: number) => (n === 1 ? '1 Lektion' : `${n} Lektionen`),
    lesson: 'Lektion',
    members: 'Mitglieder',
    next: 'Nächste Lektion',
    // Progress = lessons OPENED on this device (no accounts yet), so the wording is
    // "angesehen", never "abgeschlossen"/certified.
    lastLesson: 'Das war die letzte Lektion dieses Kurses.',
    progress: (seen: number, total: number) => `${seen} / ${total} angesehen`,
    progressHint: 'Fortschritt auf diesem Gerät',
    start: 'Kurs starten',
    resume: (n: number) => `Lektion ${String(n).padStart(2, '0')} fortsetzen`,
    again: 'Von vorn beginnen',
    seen: 'angesehen',
    modules: 'Lektionen',
    minutes: (n: number) => `${n} Min.`,
    lockedEyebrow: 'Gesperrt',
    previews: (n: number) => (n === 1 ? '1 Vorschau' : `${n} Vorschauen`),
    lockedCount: (n: number) => `${n} gesperrt`,
    lessonLocked: 'Diese Lektion ist für Mitglieder.',
    lockedTitle: 'Fortgeschrittene Module',
    lockedSoon: 'Bald',
    toOverview: 'Zur Kursübersicht',
    lessonNotFound: 'Diese Lektion gibt es nicht (mehr).',
    block: {
      unsupported: 'Inhalt in dieser App-Version nicht darstellbar',
      unsupportedHint: 'Aktualisiere die App, um diesen Inhalt hier zu sehen.',
      open: 'Freigeschaltet',
      openVideo: 'Video öffnen',
      openFile: 'Dokument öffnen',
      video: 'Video',
      document: 'Dokument',
      link: 'Link',
    },
  },

  // Full risk notice (Home footer, and the expandable one-liner under feeds/threads).
  risk: {
    title: 'Risikohinweis',
    text:
      'Keine Anlageberatung. Alle Inhalte dienen ausschließlich der Information und Bildung ' +
      'und stellen keine Aufforderung zum Kauf oder Verkauf von Finanzinstrumenten dar. Der ' +
      'Handel mit Devisen, CFDs und anderen gehebelten Produkten ist mit einem hohen Risiko ' +
      'verbunden und kann zum vollständigen Verlust des eingesetzten Kapitals führen. ' +
      'Vergangene Ergebnisse sind kein verlässlicher Indikator für zukünftige Ergebnisse. ' +
      'Handle nur mit Geld, dessen Verlust du dir leisten kannst.',
  },

  // Home (slide 1): the newsletter every visitor sees, prospects included.
  home: {
    title: 'Home',
    brand: 'SPA Garden Club',
    tagline: 'Society · Prosperity · Abundance',
    videos: 'Willkommen',
    soon: 'Bald',
    play: 'Abspielen',
    webinar: 'Nächstes Live-Webinar',
    webinarIn: (d: number, h: number, m: number) =>
      d > 0 ? `in ${d} T ${h} Std` : h > 0 ? `in ${h} Std ${m} Min` : `in ${m} Min`,
    webinarLive: 'Jetzt live',
    remind: 'Erinnern',
    sessions: 'Sessions diese Woche',
    events: 'Nächste Events',
    news: 'News',
    newsMore: 'Wischen für mehr',
    close: 'Schließen',
    moreInfo: 'Für mehr Infos',
    whatsapp: 'WhatsApp SPA Garden Club',
    start: 'Jetzt starten',
    login: 'Log in',
    example: 'Beispiel',
  },

  // Mitglieder (slide 2): SPA Garden Club and Orangerie areas; locked items stay visible.
  members: {
    title: 'Mitglieder',
    areas: { club: 'SPA Garden Club', orangerie: 'Orangerie' },
    areasLabel: 'Bereich',
    locked: 'Gesperrt',
    preview: 'Vorschau',
    open: 'Freigeschaltet',
    // Presenter-only (server demoControls): preview what each audience sees.
    viewAs: 'Ansicht',
    viewer: { prospect: 'Gast', club: 'Club', orangerie: 'Orangerie' },
    courses: 'Academy & Bootcamps',
    tools: 'Tools',
    links: 'Orangerie',
    community: 'Community',
  },
} as const;

export type Strings = typeof de;
