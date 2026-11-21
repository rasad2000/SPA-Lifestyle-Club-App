# Design: SPA Garden Club, day palette

A fictional private members' club, **SPA · Society · Prosperity · Abundance**: a sunlit
white-marble glasshouse (a "Garden of Eden" orangery), deep crimson and gold. The structure
(the hall as a picture frame, cards that open like apps, the trade cockpit) carried over from
an earlier dark "black marble and champagne gold" identity; this file describes the current one.

## Identity

- **Palette** (`src/ui/theme.ts`, `palette` + the `colors` tokens). Light-only.
  - Ivory `#F7F2E8` (ground), Porcelain `#FFFDF8` (cards), Ink `#2B1A17` (text)
  - Crimson `#8E1B2C`: THE accent (headlines, lines, primary buttons, the selected tab)
  - Gold `#C9A24A`: ornament only (rules, rims, hairlines). It is 2.2:1 on ivory, so never text.
  - Deep gold `#76591A`: small accent text and icons (5.9:1 on ivory, 6.4:1 on porcelain)
  - Buy `#2F7A4C`, sell `#C2312A` (both ≥ 4.7:1 on ivory; white on either badge ≥ 5:1)
  - metal gradient (gold) for the logo and effects only, never a surface

  Every text token clears WCAG AA on ivory and porcelain (ratios in the file header). Text
  that sits directly on the hall (screen titles, lesson bodies, the thread rail) is helped by
  `BACKGROUND_SCRIM`, an ivory veil that is stronger toward the bottom, where the artwork's
  roses spill inward. Measured over the hall's text column at 390×844 with that veil: ink
  ≥ 4.5:1 everywhere; secondary, tertiary, crimson and deep gold ≥ 4.5:1 on 91–97 % of it,
  the rest being rose petals and the gold capitals.
- **Type:** Bodoni Moda for headings, the pair and the engraved section titles (`section`/`hero`
  variants: caps, wide tracking, a short crimson rule under them). Manrope for UI, JetBrains
  Mono for prices.
- **Marks** (`tools/make_brand.py`): the **tree-of-life symbol** (a gold pomegranate tree inside a
  glasshouse arch, crimson fruit) is the in-app mark (`spa-mark.png`, Home hero, poster heads);
  the **monogram** (crimson Didone "SPA" in a gold laurel wreath) is the app icon, Android
  layers, monochrome icon, splash and favicon, because letters still read at icon size and
  the symbol's hairlines don't.
- **Glass:** cards on the hall are porcelain glass (`colors.glassCard`, 0.84) with a gold
  hairline, a faint gold sheen (`CARD_SHEEN`) and a gold rim on top; controls use light blur
  (`systemUltraThinMaterialLight`) or Liquid Glass with the light colour scheme. Media
  viewers (posters, images, embedded video) stay on black, as photo viewers do.

## Layout

- **The hall is the ONE image, and it is a picture frame.** `bg-hall.jpg` (1080×2340) is drawn
  once at the app root, behind the navigator (`app/_layout.tsx`; theme and stack backgrounds
  are transparent). Its two rose-covered pillars bound the content: `src/ui/frame.ts` computes
  the pillars' inner edge on the current screen (13.5 % of the artwork, measured, from the
  cover/bottom fit) and every screen pads its content to `frame.pad`. Tab roots draw their
  title INSIDE the frame (`ui/ScreenTitle.tsx`, native header hidden); detail screens keep the
  native header for the back button.
  - **Carousels** (`components/Carousel.tsx`) span the full width: cards rest inside the frame
    and can be swiped INTO the pillars, where `EdgeFade` dissolves them with a per-pixel alpha
    mask (masked-view natively, CSS `mask-image` on web). The next card always peeks in on the
    right, and page dots under the row show there is more.
  - **No photo textures on cards.** Cards are porcelain glass + hairline + sheen; type does the rest.
  - **Materials live INSIDE opened articles:** each welcome article's video frame is its
    material: the host's welcome = **Licht** (sunbeams through the glasshouse roof), the short
    presentation = **Glas** (glass panes and gold mullions).
- **Opening a card = opening an app** (`components/Expander.tsx`): a news post or a welcome
  video grows out of its own card into a full-screen page (rounded corners easing to square;
  the page is scaled, never reflowed), and the card blanks while open. Swiping DOWN shrinks the
  page back, following the finger like closing an iOS app. The X and Android back run the same close.
  - **News page** (`components/home/NewsPage.tsx`): the poster full screen on black. If it has
    text, faded white chevrons pulse at the right edge; swiping sideways slides the text in
    while the image darkens.
  - **Article page** (`components/home/ArticlePage.tsx`): a welcome video is an article with the
    video inside it (16:9 frame on top, then title and text).
- **Android tab bar:** NativeTabs' `backgroundColor` paints the WHOLE Android tabs container,
  not just the bar, so an opaque value hides the hall. On Android it is `transparent`, and the
  root layout draws the bar's floor itself (`TabBarFloor`: ivory fading up into the hall).
- **Navigation:** Home · Mitglieder · Signale.
  - **Home:** a newsletter for everyone, guests included. Hero (symbol, wordmark, tagline),
    News (Garden Salon, Copytrader, a private session with a guest speaker; their viewer text
    lives in `src/content/home.ts`), the host's videos, the next webinar with a countdown,
    this week's sessions, events, "Jetzt starten", WhatsApp, risk notice.
  - **Mitglieder:** SPA Garden Club | Orangerie areas. Locked items stay visible ("Gesperrt",
    dimmed), and courses keep their `preview` lessons open. On a demo server the presenter
    "Ansicht" switch (Gast / Club / Orangerie) shows what membership unlocks.
  - **Signale:** the trade cockpit (below).

## Trade cockpit (user request, 2026-10-12)

"Read less like a message board, more like a cockpit for trades coming in":

- **Trades | Alle toggle** (sticky, `components/feed/ViewToggle.tsx`; remembered per
  device). **Trades** (default) lists signal cards only, fetched server-side with
  `?only=signals`. Each card tracks its own trade: the TP tiles light as `signal.progress`
  climbs (a newly hit tile flashes gold once), and a footer shows the newest update with
  the update count (`post.thread`, the server's summary of the whole reply tree). **Alle**
  is every post, chatter included.
- **Finished trades are greyed out** (`lib/trade.ts`: all listed TPs hit, stopped or
  closed). The badge turns grey and states the result (`SELL · ALL TPs HIT`).
  Running and risk-free trades stay bright.
- **Timeline:** tapping a card or any update opens the trade's timeline (`post/[id]`):
  the signal on top, then every update at any reply depth, oldest first, on a rail. Gold
  nodes mark milestones, each entry shows time since entry, and nested answers get a "↳"
  context line. Tapping an update ("TP3 HIT") opens the ROOT, scrolled to and highlighting
  that update (server `rootId` + `?focus=`).
- **Live arrivals:** a row inserted live slides in and gets a gold ring that fades
  (`ui/Enter.tsx` + `FreshGlow`). New timeline entries slide in too. This deliberately does
  not use Reanimated layout animations (`entering`): on web they left the list layout
  stale, so the footer overlapped the new row.

## Dropped (and why)

- **Invented operational claims:**
  - "Institutional Execution Feed · Node #04", "24ms Latency", "Desk verifiziert", "Verifizierte
    Order-Protokolle", "Auto-broadcast node"
  - "Encrypted HSM", an invented pass id and internal node hostname, "Zurich · London ·
    Singapore", "Founder Patron · Tier I", "Zertifikat freigeschaltet"
  - made-up market commentary, "Ertrag +4.2 %", "Max Drawdown", "KW 42 · 2024"

  These are fabricated facts in an app about real money.
- **Wording that reads as regulated asset management:** "Mandatsführung", "Kapitalerhalt",
  "Private Sovereign Allocation", "Diskretionsvereinbarungen gemäß Club-Kodex". In Germany
  that implies licensed portfolio management. The plain "Keine Anlageberatung" notice stays on
  feeds and threads.
- **Sections with no content behind them:** the "Market News / Desk Meetings" segments, the "Nächstes
  Desk Meeting" card and the push-notification row. Push is a later feature (Expo notifications).
- **The Stitch HTML itself:** it is Tailwind/web markup and of no use to React Native. Only the
  tokens and the layout were taken.

## Assets

`tools/make_brand.py` derives every image in `apps/mobile/assets/images/` from the source artwork
(see its docstring): the hall (scaled to the screen height and centre-cropped, so the pillars
land at the measured 13.5 %), the symbol keyed off its white ground, the monogram icon set
(1024 icon, Android adaptive layers inside the 66 % safe zone, monochrome, splash, favicon),
the three news posters (art below, type set above it on an ivory veil, a footer line) and the
two article frames. The source images were generated text-free with an image model
(Antigravity's image generator, Gemini Flash Image, 768×1376 / 1376×768); they and their
prompts live outside the repo. Expo Go shows its own splash and icon, so the icon set only
shows in a real build.
