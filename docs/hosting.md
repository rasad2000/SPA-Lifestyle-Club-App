# Hosting decision: Hetzner vs AWS

Research date: 2026-10-10. Prices are monthly and **before VAT** unless marked otherwise. A
figure marked *unverified* comes from a third party or could not be confirmed from a primary
source. Cost totals are our own arithmetic from the cited figures.

**Decision:** keep the POC on the dev host, optionally exposed through Tailscale Funnel for
free ([demo.md](demo.md)). Production goes to **Hetzner Cloud CX23 or CX33 in Nuremberg or
Falkenstein**. The deployment sketch at the end is a **plan, not yet done**.

## Staged cost estimate

Nothing is spent until other people install the app. Hosting figures are from the tables
below, before VAT. The Apple fee is the eurozone list price, *unverified* against Apple's
German page.

| Stage | One-time | Recurring | What it buys |
| --- | --- | --- | --- |
| **Demo** (now) | €0 | €0 | Expo Go on a reviewer's iPhone (no Apple account needed) or the web build, served from the dev host via Tailscale Funnel / a Cloudflare quick tunnel |
| **Pilot**: TestFlight, closed group | Google Play $25 (only if Android is included) | Apple Developer Program ≈ €99/yr · Hetzner CX23 + IPv4 + backups ≈ €7.09/mo (≈ €8.44 gross) · domain ≈ €1/mo | D-U-N-S number is free (~1 week lead time). The EAS free tier (15 iOS + 15 Android builds/month) is enough. |
| **Launch**: a few thousand users | — | Apple ≈ €99/yr · Hetzner CX33 + Object Storage ≈ €17.18/mo (≈ €20.44 gross) | Optional: EAS Starter $19/mo; video hosting (unlisted YouTube free, Bunny Stream usage-based) |

Free at every stage: push notifications (APNs/FCM/Expo push), self-hosted Directus
(free below $5M revenue), TLS (Caddy + Let's Encrypt). Roughly: **€0 demo → ≈ €200/yr pilot →
≈ €350/yr launch**. The equivalent AWS footprint is ≈ $44/mo small and ≈ $153/mo medium,
mostly because of egress.

## Hetzner Cloud

- **Two price rises in 2026:**
  - 1 Apr 2026, all products. CX23 went from €2.99 to €3.99 and Object Storage base from
    €4.99 to €6.49. Source: third-party https://agentdeals.dev/hetzner-pricing-2026;
    background https://heise.de/-11185981.
  - 15 Jun 2026, 08:00 CEST, **new orders and rescales only**; existing servers keep their
    price. Source: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
    (updated 2026-07-08), https://heise.de/-11333037.
- **Current prices for DE (FSN/NBG) and FI (HEL)**, from the June table at the docs URL above:

  | Line | Types |
  | --- | --- |
  | CX (shared Intel/AMD) | CX23 €5.49 · CX33 €8.49 · CX43 €15.99 · CX53 €29.49 |
  | CAX (shared Arm) | CAX11 €5.99 · CAX21 €10.49 · CAX31 €20.99 · CAX41 €40.99 |
  | CPX (shared AMD) | CPX22 €19.49 · CPX32 €35.49 |
  | CCX (dedicated) | CCX13 €42.99 · CCX23 €85.99 |

- **Specs:** CX23 and CAX11 have 2 vCPU, 4 GB and 40 GB NVMe. CX33 and CAX21 have 4 vCPU, 8 GB and
  80 GB. CX43 has 8 vCPU, 16 GB and 160 GB. **20 TB of traffic is included.** Source:
  https://www.hetzner.com/cloud/cost-optimized. When fetched, the page showed these plans as
  "not available" (stock), so check the Console before relying on CX23.
- **Locations:** `fsn1` and `nbg1` (eu-central) and `hel1`. Object Storage is available only in
  fsn1, nbg1 and hel1. Source: https://docs.hetzner.com/cloud/general/locations/
- **Primary IPv4:** €0.50; IPv6 is free. Source: https://docs.hetzner.com/general/others/ipv4-pricing/.
  *Unverified after April 2026: the page was last updated 2023-04-13.*
- **Backups** cost 20 % of the server price and keep 7 slots. Snapshots are billed per GB, and
  traffic overage in 100 MB blocks. Source: https://docs.hetzner.com/cloud/billing/faq/.
  *The snapshot price per GB and the overage price per TB are unverified* (third parties say
  $0.0143/GB and about €1/TB).
- **Object Storage:** €6.49 base (*third-party price*), which includes 1 TB storage and 1 TB
  egress. Uploads and API calls are free. Limits: 100 buckets, 100 TB per bucket, 5 TB per
  object. Source: https://docs.hetzner.com/storage/object-storage/overview/
- **GDPR / AVV (Art. 28):** this is **not concluded automatically**; you conclude it in the
  customer account. Source: https://www.hetzner.com/legal/terms-and-conditions/

## AWS (Frankfurt, eu-central-1)

Source for EC2, IPv4, EBS, S3 and transfer: AWS's public price data (published 2026-10-07), as
loaded by https://aws.amazon.com/ec2/pricing/on-demand/.

| Item | Price |
| --- | --- |
| t4g.small (2 vCPU, 2 GiB) | $0.0192/h ≈ $14.02/mo |
| t4g.medium (2 vCPU, 4 GiB) | $0.0384/h ≈ $28.03/mo |
| t4g.large (2 vCPU, 8 GiB) | $0.0768/h ≈ $56.06/mo |
| t3.small / t3.medium | $0.024/h / $0.048/h |
| Public IPv4 (in use or idle) | $0.005/h ≈ $3.65/mo |
| EBS gp3 / snapshots | $0.0952 / $0.054 per GB-month |
| Egress to the internet | first 100 GB/mo free (all services), then $0.09/GB (next 10 TB), $0.085 (next 40 TB), $0.07 (next 100 TB) |
| S3 Standard | $0.0245/GB-month (first 50 TB) |

- **Lightsail (FRA),** with IPv4 and 2 vCPU: $5 (0.5 GB, 1 TB transfer), $7 (1 GB, 2 TB),
  $12 (2 GB, 3 TB), $24 (4 GB, 4 TB) and $44 (8 GB, 5 TB). IPv6-only bundles start at $3.50.
  Overage is $0.09/GB. Object storage: $1 for 5 GB, $3 for 100 GB, $5 for 250 GB. Sources:
  https://aws.amazon.com/lightsail/pricing/, https://aws.amazon.com/lightsail/faq/.
  *The free-tier terms are unverified.*
- **CloudFront:** always free for 1 M requests and 100 GB per month. Flat plans: Free, Pro
  $15, Business $200. Source: https://aws.amazon.com/cloudfront/pricing/
- **GDPR:** the AWS DPA is part of the Service Terms, and the 2021 SCCs "apply automatically"
  to transfers outside the EEA. Source: https://aws.amazon.com/compliance/gdpr-center/
- **US CLOUD Act:** applies to providers with a US presence. AWS commits to challenging
  overbroad requests and reports zero enterprise-content disclosures from outside the US since
  2020. Source: https://aws.amazon.com/compliance/cloud-act/
- **European Sovereign Cloud:** generally available since 14 Jan 2026 (`eusc-de-east-1`,
  Brandenburg, priced in EUR). Source:
  https://press.aboutamazon.com/aws/2026/1/aws-launches-aws-european-sovereign-cloud-and-announces-expansion-across-europe
- **Schrems II (our reading, not a source):** with AWS the data stays in Frankfurt, but CLOUD
  Act exposure remains, which you handle with SCCs and a transfer impact assessment. Hetzner (a
  German GmbH, German locations) doesn't raise it.

## Rough monthly cost (our arithmetic)

| | Hetzner (NBG/FSN) | AWS Lightsail (FRA) | AWS EC2 (FRA) |
| --- | --- | --- | --- |
| **Small**: POC up to ~1k users, 4 GB RAM, ~200 GB egress | CX23 €5.49 + IPv4 €0.50 + backups €1.10 = **≈ €7.09** (≈ €8.44 gross at 19 %) | $24 bundle + snapshots ≈ **$25–28** | t4g.medium $28.03 + IPv4 $3.65 + 40 GB gp3 $3.81 + 100 GB egress $9 ≈ **$44.50** |
| **Medium**: a few thousand users, 8 GB, ~1 TB egress, media in object storage | CX33 €8.49 + €0.50 + backups €1.70 + Object Storage €6.49 = **≈ €17.18** (≈ €20.44 gross) | $44 bundle + $3 bucket + snapshots ≈ **$50** | t4g.large $56.06 + $3.65 + 80 GB gp3 $7.62 + ~924 GB egress $83 + S3 ~$2.50 ≈ **$153** |

The 19 % VAT gross figures are our own calculation for German B2C, not Hetzner figures.

## Recommendation: Hetzner CX23 or CX33, NBG or FSN

1. **The 20 TB included traffic** removes AWS's main cost driver, which is egress for media
   and WebSocket traffic.
2. **GDPR is simplest:** a German provider, a German location and a self-concluded AVV, with
   no CLOUD Act transfer analysis.
3. **It is about 3–9× cheaper** than EC2 at this size.
4. **Stay on CX or CAX.** The 2026 rises hit CX/CAX by about 33–38 % but CPX/CCX by up to about
   176 %. Rescaling always uses the new prices, so start with headroom (CX33 if in doubt).
5. **A single node with SQLite fits "a few thousand users."** Add Object Storage for media when
   `data/media` grows.

Choose AWS only if the app later needs managed push, CDN or Postgres services, or a
sovereign-cloud certification.

## Deployment sketch — PLAN, NOT YET DONE

Target: one CX23/CX33 VM (Debian/Ubuntu) in `nbg1`, with a DNS name such as
`app.<spa-domain>` (to be decided). The server binds to loopback only, and Caddy terminates TLS.

**1. Server user and code**

```bash
adduser --system --group --home /srv/spa spa
# Node 22 from your distro or NodeSource; then, as spa:
git clone <private remote> /srv/spa/app && cd /srv/spa/app && npm ci
(cd apps/mobile && npx expo export -p web)   # web build; it calls its own origin (base-url.ts)
```

`/srv/spa/app/apps/server/.env`, mode 600:

```
PORT=8790
HOST=127.0.0.1
DATA_DIR=/var/lib/spa-app
INGEST_TOKEN=<openssl rand -hex 32>
```

**2. systemd system unit** `/etc/systemd/system/spa-app.service`:

```ini
[Unit]
Description=SPA app server
After=network-online.target
Wants=network-online.target

[Service]
User=spa
Group=spa
WorkingDirectory=/srv/spa/app
ExecStart=/usr/bin/node --import tsx apps/server/src/main.ts
Restart=on-failure
RestartSec=5
TimeoutStopSec=15
StateDirectory=spa-app
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/spa-app
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`StateDirectory=spa-app` creates `/var/lib/spa-app` owned by `spa`. The command is the same
`node --import tsx` launch as `deploy/spa-app-server.service`, which handles SIGTERM gracefully.

**3. Caddy** (automatic HTTPS; `reverse_proxy` passes WebSocket upgrades through, so
`/v1/live` needs nothing extra). `/etc/caddy/Caddyfile`:

```
app.<spa-domain> {
	encode zstd gzip
	# Optional: only the producer may reach ingest (it still needs the bearer token).
	@ingest_foreign {
		path /v1/ingest/*
		not remote_ip <producer IP or tailnet range>
	}
	respond @ingest_foreign 403
	reverse_proxy 127.0.0.1:8790
}
```

The app server sets its own `Cache-Control` and ETags, so Caddy doesn't need cache rules.
A producer on a private machine could reach ingest over Tailscale instead of the public
internet; that fits the `remote_ip` guard.

**4. Backups**

- **Hetzner Backups** (+20 %): whole-VM, 7 slots. This is the disaster-recovery floor.
- **Consistent SQLite copies:** don't copy `spa.sqlite` while it runs (WAL). Make a nightly
  `sqlite3 /var/lib/spa-app/spa.sqlite ".backup /var/backups/spa/spa-$(date +%F).sqlite"`
  from a systemd timer, keep 14 days, and push them off-box to an Object Storage bucket.
- **Media:** `/var/lib/spa-app/media` is content-addressed and append-only, so incremental
  sync to Object Storage (`rclone sync`) is cheap. Snapshots can be re-seeded from their
  producers, but live posts cannot.
- **Restore drill:** stop the service, put a `.backup` file in place as `spa.sqlite`, sync
  `media/` back, then start. Migrations run automatically, and a DB newer than the code refuses to start.

**5. Before go-live:** sign the AVV in the Hetzner account. Set a privacy policy URL (also
needed by the App Store, see [testflight.md](testflight.md)). Point the app build's
`EXPO_PUBLIC_API_URL` at `https://app.<spa-domain>` and leave `SPA_ALLOW_CLEARTEXT` off.
