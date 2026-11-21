# iOS runbook: TestFlight → Unlisted App Store

Research date: 2026-10-10. Each fact links its source. Items marked *(not re-verified)*
were not checked in that research, and items marked *(our note)* are our own reading.
Nothing here has been done yet: there is no Apple account, no EAS project and no App Store
Connect record.

## 0. What already exists in the code

| Item | State |
| --- | --- |
| Bundle id | `SPA_IOS_BUNDLE_ID`, default `club.spa.garden`, is a **placeholder** (`apps/mobile/app.config.ts`). |
| EAS project id | Read from `SPA_EAS_PROJECT_ID`, currently unset. |
| Export compliance | `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` is set already. |
| API URL | `EXPO_PUBLIC_API_URL`. A release build without it shows a German configuration error. |
| Cleartext | `SPA_ALLOW_CLEARTEXT=1` adds `NSAllowsArbitraryLoads`. POC only; **leave it off for TestFlight**. |
| `eas.json` | `development` (dev client, internal), `preview` (internal; http tailnet URL plus cleartext), `production` (store, `autoIncrement`, **no API URL yet**), and `submit.production.ios: {}` (needs `ascAppId`). |

`distribution: "internal"` on iOS means **ad hoc** (registered UDIDs), not TestFlight. So the
`preview` profile cannot go to TestFlight. Use a store-distribution profile (step 4).

## 1. Accounts

1. **Apple Developer Program, as an organization.** 99 USD per membership year ("varies by
   region"). You need:
   - a legal entity (no DBAs or trade names);
   - a **D-U-N-S number**;
   - signing authority;
   - an email on the organization's domain;
   - a public website on that domain;
   - an Apple Account with 2FA.

   Source: https://developer.apple.com/programs/enroll/. *The local price in Germany is unverified.*
2. **D-U-N-S** is free. Dun & Bradstreet takes up to 5 business days, then Apple up to 2 more,
   and expediting doesn't help. Contact D&B after 2 weeks. Source:
   https://developer.apple.com/help/account/membership/D-U-N-S/. *Apple's enrollment review
   time after that is unverified.*
3. **Expo account and EAS.** The Free plan gives 15 iOS builds a month, a low-priority queue
   and a 45-minute timeout. Starter is $19/mo. Source: https://expo.dev/pricing
4. **Legal (our note).** Under guideline 5.1.1(ix), apps in regulated fields should be submitted by a
   legal entity. Under 3.2.1(viii), apps "used for financial trading, investing, or money management
   should be submitted by the financial institution". No guideline explicitly bans signal or
   education apps, and whether a signals feed counts as "financial trading" is untested. Source:
   https://developer.apple.com/app-store/review/guidelines/

## 2. Bundle id and project

1. Choose the final reverse-DNS id. It is permanent for the App Store Connect record. Set it in
   every build profile's `env` as `SPA_IOS_BUNDLE_ID` (and `SPA_ANDROID_PACKAGE`). The bundle id
   must be in the app config. Source: https://docs.expo.dev/submit/ios/
2. In `apps/mobile`, run `npx eas-cli@latest init` and put the printed project id in
   `SPA_EAS_PROJECT_ID`. *(Not re-verified: the config is dynamic, `app.config.ts`, so EAS
   can't write the id into it itself.)*
3. EAS registers the bundle id and manages the distribution certificate, provisioning profile and
   push key. The first run needs an Apple Developer login; after that, collaborators only need an
   Expo account. Sources: https://docs.expo.dev/submit/testflight/,
   https://docs.expo.dev/app-signing/managed-credentials/

## 3. Make the POC server reachable over HTTPS

**App Transport Security (ATS)** requires HTTPS and blocks connections that fail its TLS checks.
Source: https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity

So a TestFlight build needs `https://` and `wss://`. For the POC on the dev host, that is **Tailscale Funnel**:

- **Before you start:** an admin enables **HTTPS certificates** and **Funnel** for the tailnet. Today
  the host has no cert domain and no `funnel` attribute. Funnel needs client v1.38.3 or later
  (installed: 1.102.4), MagicDNS, HTTPS certs and the `funnel` node attribute. It can listen only
  on 443, 8443 or 10000. Source: https://tailscale.com/kb/1223/funnel
- **Start it:** `tailscale funnel --bg 8790`. `--bg` keeps it running across reboots and
  `tailscale down`/`up`. Stop it with `tailscale funnel reset`. Source:
  https://tailscale.com/kb/1311/tailscale-funnel
- **URLs:** `https://<host>.<tailnet>.ts.net` and `wss://<host>.<tailnet>.ts.net/v1/live`. DNS
  can take up to 10 minutes.
- **WebSockets through Funnel are reported to work (third parties).** There is an open issue about
  query strings being stripped on WebSocket upgrades
  (https://github.com/tailscale/tailscale/issues/18651). Our client connects to `/v1/live` without one.
- **This exposes ingest publicly as well** *(our note)*. The ingest API is protected only by the bearer
  token, so keep `INGEST_TOKEN` long and random.

A Cloudflare quick tunnel won't do: its `*.trycloudflare.com` URL changes on every run, so the URL
baked into the build breaks. Source:
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/

## 4. Build

Add a store-distribution profile for the POC to `apps/mobile/eas.json` (a proposal; it is not in the file yet):

```json
"testflight": {
  "extends": "production",
  "env": {
    "EXPO_PUBLIC_API_URL": "https://<host>.<tailnet>.ts.net",
    "SPA_IOS_BUNDLE_ID": "<final id>",
    "SPA_EAS_PROJECT_ID": "<project id>"
  }
}
```

- **Upload requirement:** since 28 Apr 2026, builds must use **Xcode 26 or later with the iOS 26
  SDK**, and since 9 Sep 2026 they must target iOS 13 or later. Source:
  https://developer.apple.com/news/upcoming-requirements/. This is also what lights up Liquid
  Glass: `glass-mode.ts` falls back to blur below it.
- **Option A, EAS cloud build from Linux (this box):**
  `npx eas-cli@latest build -p ios --profile testflight`. No Mac is needed. Source:
  https://docs.expo.dev/submit/testflight/
- **Option B, a local build on a MacBook Neo:**
  - The Neo was announced 4 Mar 2026: A18 Pro, 8 GB, from $599. Sources:
    https://www.apple.com/newsroom/2026/03/say-hello-to-macbook-neo/,
    https://support.apple.com/en-us/126322
  - Xcode 26.4.1–26.6 needs macOS Tahoe 26.2 or later. Source:
    https://developer.apple.com/xcode/system-requirements/
  - *(Our inference:)* Apple silicon on Tahoe meets that requirement; 8 GB is tight but workable.
  - Build with `eas build -p ios --profile testflight --local`, or `npx expo prebuild` plus an
    Xcode archive. *(Not re-verified.)*
- **The 2017 MacBook Pro can't:** it can't run macOS Sonoma, so it can't reach Sequoia 15.6, so no
  Xcode 26. Source: https://support.apple.com/en-us/105113

## 5. Submit to TestFlight

1. Add `submit.production.ios.ascAppId` once the App Store Connect app exists, or let the first
   submit create it: `eas submit` "creates an app record automatically on App Store Connect when you
   submit your first build". Source: https://docs.expo.dev/submit/testflight/
2. `npx eas-cli@latest submit -p ios --profile production`, or build and submit in one go with
   `eas build -p ios --profile testflight --auto-submit`. `--groups "<name>" --what-to-test "…"`
   targets a tester group. The build appears in TestFlight after about 10–15 minutes of processing.
   EAS Submit runs on Linux. Sources: https://docs.expo.dev/submit/ios/,
   https://docs.expo.dev/submit/testflight/
3. **Export compliance** is answered by `ITSAppUsesNonExemptEncryption = NO` (already set). Without
   the key, App Store Connect asks on every upload. Standard HTTPS through the OS is typically exempt. Sources:
   https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption,
   https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations

## 6. Internal testers

- **Internal testers:** up to **100** App Store Connect users with access to the app. Builds for
  internal testers only need **no review**. Source:
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
- **Expiry:** each build is testable for **up to 90 days**, so plan a rebuild cadence. Same source.

## 7. External testers

- **External testers:** up to **10,000**. The first build added to an external group needs
  **TestFlight App Review**; later builds may not. Public invitation links can be limited by
  criteria. Same source as step 6.
- **Guideline 2.2 (quoted in full):**

  > "Demos, betas, and trial versions of your app don't belong on the App Store – use TestFlight
  > instead. Any app submitted for beta distribution via TestFlight should be intended for public
  > distribution and should comply with the App Review Guidelines. Note, however, that apps using
  > TestFlight cannot be distributed to testers in exchange for compensation of any kind, including
  > as a reward for crowd-sourced funding. Significant updates to your beta build should be
  > submitted to TestFlight App Review before being distributed to your testers."
  > — https://developer.apple.com/app-store/review/guidelines/

  **For a paid club:** TestFlight access **must not be part of a paid membership**. TestFlight is for
  testing, not for delivering the product to paying members.
- **Before external review:**
  - Have a **privacy policy URL**. It is required, as is the App Privacy label, which covers
    third-party SDKs too. "Collect" means data that leaves the device and is kept beyond serving
    the request. Source: https://developer.apple.com/app-store/app-privacy-details/
    *(Our note:)* with no login and a read-only feed, the POC likely collects little or nothing.
  - Check the **privacy manifest**: `ios.privacyManifests` in the app config. Required-reason
    APIs such as UserDefaults (e.g. reason `CA92.1`) may need restating because Apple doesn't
    always parse Expo packages' own manifests. Sources:
    https://developer.apple.com/documentation/bundleresources/privacy-manifest-files,
    https://docs.expo.dev/guides/apple-privacy/

## 8. Long term: Unlisted App Store distribution

- **What it is:** reachable only by direct link, not in search or charts. It must have passed App
  Review and **can't be beta or prerelease**. Source:
  https://developer.apple.com/support/unlisted-app-distribution/
- **How to request it:**
  1. Write "unlisted" in the Review Notes.
  2. Submit https://developer.apple.com/contact/request/unlisted-app/. Same source.
- **Gate it in the app:** Apple advises building your own access control, because anyone with the
  link can install. That is the moment for the `access: 'member'` login gate
  ([architecture.md](architecture.md#migration-path-when-it-outgrows-the-poc)).
- **Point it at a real host:** production builds should use the real host
  (`https://app.<spa-domain>`, [hosting.md](hosting.md)), not Funnel.

## Android, for comparison (quick distribution)

- **EAS internal APK:** a profile with `"distribution": "internal"` and
  `android.buildType: "apk"` produces a shareable install URL. Source:
  https://docs.expo.dev/build/internal-distribution/. The current `preview` profile has
  `distribution: internal` but no `buildType`.
- **Play internal testing:** up to 100 testers, available "within minutes". Source:
  https://support.google.com/googleplay/android-developer/answer/9845334. New **personal** Play
  accounts (created after 13 Nov 2023) need 12 testers opted in for 14 continuous days before
  production. Source: https://support.google.com/googleplay/android-developer/answer/14151465
- **Developer verification:** enforcement starts 30 Sep 2026 in BR, ID, SG and TH, with a global
  rollout in 2027 and later. There is **no enforcement in Germany yet**, so a sideloaded APK
  installs normally. Source: https://developer.android.com/developer-verification
