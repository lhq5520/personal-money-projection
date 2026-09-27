# Personal Money Projection

[简体中文](README.md) · **English**

A personal finance projection tool that goes from your payslip to long-term investing.
It models the tax systems of **China, the United States, and Canada**, with a bilingual (Chinese/English) UI.
Taxes and mandatory contributions are computed per country and per jurisdiction; every result is reported
in both **nominal terms** and **today's purchasing power**; and uncertainty is expressed as a **distribution**
rather than a single curve.

Its ancestor is [`docs/legacy/money-calculator.html`](docs/legacy/money-calculator.html) — an 11 KB single-file
page, kept around as a baseline for comparison.

## What this adds over the prototype

| Problem in the prototype | What it does now |
|---|---|
| Typing 7% meant exactly 7% every year — one deterministic curve | Monte Carlo P10–P90 fan chart plus probability of loss |
| China's comprehensive-income bracket table **stopped at 30%**, missing the 35% and 45% brackets | All seven brackets present; high earners are no longer systematically undertaxed |
| Year-end bonus always taxed at the 10% bracket (`bonus*.10-210`) | Looks up `bonus/12` in the monthly table and picks the better of "separate" vs. "merged into comprehensive income", year by year |
| **No special additional deductions at all** | All six are implemented (children's education / infant care / continuing education / housing / elder support) — worth six figures of deductions in a single year |
| Social insurance hard-coded at 10.5%, housing fund at 12%, no contribution-base floor or ceiling | Per-city base floors/ceilings and rates for 35 cities, all overridable from your payslip |
| Salary and expenses frozen for 40 years | Annual raise rate plus promotion step-ups; expense inflation |
| No notion of inflation | Every result carries both nominal and today's-purchasing-power figures, toggled with one click |
| Cross-border friction ignored | Fund expense ratios, dividend withholding tax; warns when you exceed the USD 50k FX purchase quota |
| Housing-fund net balance could go negative and then be extrapolated negative for 20 years | Balance conservation, 1.5% interest crediting, withdrawals constrained by the balance |
| Refresh and everything's gone | Local autosave + URL sharing + optional cloud account sync |
| Zero tests on the financial math | 162 unit tests, concentrated on bracket boundaries in all three countries and on the statistical properties of the Monte Carlo |
| China only, Chinese only | Three tax systems (CN/US/CA), bilingual UI |

## Coverage

| Country | Jurisdictions | Tax modeling | Savings plan |
|---|---|---|---|
| 🇨🇳 China | **35 cities** | Seven-bracket progressive comprehensive income tax, six special additional deductions, year-end bonus taxed separately vs. merged (best option chosen per year), contribution-base floors/ceilings for the "five insurances + one fund" | Housing Provident Fund (1.5% interest, withdrawable) |
| 🇺🇸 United States | **32 states** (New York City broken out separately) | Federal brackets for all four filing statuses, standard/itemized deduction, FICA (Social Security wage base cap + Additional Medicare Tax threshold), Child Tax Credit, state and local income tax | 401(k) (pre-tax, market growth) |
| 🇨🇦 Canada | **10 provinces** | Federal + provincial, Basic Personal Amount handled as a non-refundable credit, CPP basic exemption and two-tier ceilings, EI, Ontario surtax, Quebec QPP/QPIP and the 16.5% federal abatement | RRSP (deductible, market growth) |

UI language (Simplified Chinese / English) is **orthogonal** to currency formatting — a user in China can read
the English UI while working in CNY.

## Architecture

```
packages/engine    Pure TypeScript calculation engine, zero runtime deps, 162 Vitest tests
  tax/             Generic progressive-bracket and credit computation
  regions/cn|us|ca Per-country tax implementations, all behind one RegionModule interface
  regions/registry Region registry; generic flows only reach implementations through it
packages/shared    Zod schemas — frontend form validation / backend input validation / URL codec, defined once
apps/api           Hono + Prisma + PostgreSQL + Better Auth
apps/web           Vite + React + TypeScript (i18n under src/i18n/)
```

**Region abstraction**: every country-specific difference is confined behind the `RegionModule` interface.
The generic flows — timeline, investing, inflation — are country-agnostic. Adding a fourth country means
adding one `regions/xx/` directory and registering it; no generic code changes.

**The engine emits no natural language**: warnings are structured `{ code, params }` values and translation
happens in the UI layer. This is the precondition for multilingual support — otherwise warning text would be
locked to one language forever.

The engine is a pure function: `ProjectionInput → array of monthly states`. The UI only renders; the server
only stores and retrieves. That's what makes it unit-testable, what lets 2,000 Monte Carlo paths run in the
browser, and what lets the whole scenario be encoded into a URL.

**Local-first**: `localStorage` is always the source of truth. Without an account, offline, or even with the
single-file build copied onto a USB stick and opened by double-clicking, the tool is fully functional. Cloud
sync is a backup layer on top, not a prerequisite.

## Quick start

```bash
pnpm install
cp .env.example .env          # the same variables also need a copy in apps/api/.env
pnpm db:up                    # PostgreSQL via Docker (mapped to 5433, to dodge an existing local 5432)
pnpm db:migrate               # create tables
pnpm dev                      # web on :5173, API on :8787
```

If you just want the calculator and don't need account sync, skip `db:up` / `db:migrate` and run `pnpm dev:web`.

## Common commands

| Command | What it does |
|---|---|
| `pnpm test` | All unit tests |
| `pnpm typecheck` | Typecheck the whole workspace |
| `pnpm build` | Regular static-site build |
| `pnpm --filter @pmp/web build:singlefile` | Bundle into a **single HTML file** (~322 KB) — double-click to use, works offline |
| `pnpm db:studio` | Inspect data in Prisma Studio |

## Deployment

The frontend and API deploy separately, and **both must sit on subdomains of one registrable
domain**:

| Part | Platform | Domain |
|---|---|---|
| Frontend (static site) | Vercel | `app.your-domain` |
| API (long-lived process) | Render | `api.your-domain` |
| Database | Neon (managed Postgres) | — |

> ⚠️ **Do not use the platform default domains** (`*.vercel.app` + `*.onrender.com`). Their
> registrable domains differ, so the browser treats the pair as cross-site and never sends the
> `sameSite: 'lax'` session cookie — sign-in returns 200 and the very next request is
> unauthenticated. Two subdomains of one domain are **same-site**, and the existing cookie
> configuration then needs no changes at all.

### API → Render

In Render, pick **New → Blueprint** and select this repo; it reads `render.yaml` from the repo
root and creates the service. You'll be prompted for three values:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon's **direct** connection string (no `-pooler`), with `?sslmode=require` |
| `BETTER_AUTH_URL` | `https://api.your-domain` |
| `WEB_ORIGIN` | `https://app.your-domain` |

`BETTER_AUTH_SECRET` is generated by Render, so you can ignore it. Once the service exists, add
`api.your-domain` under Settings → Custom Domain.

Migrations run from `render.yaml`'s `preDeployCommand` *before* the new version takes traffic;
if they fail the deploy aborts and the previous version keeps serving.

`region` must match the Neon region (Singapore for both) — Prisma issues several round trips per
request, so a cross-continent mismatch makes the app feel noticeably slow, and Render's region
**cannot be changed** once the service is created. Because the API is a long-lived process
rather than a serverless function, `DATABASE_URL` can be Neon's **direct** connection string for
both the app and migrations; no pooler is needed.

> Render's free tier sleeps after 15 minutes of inactivity, so the next visitor waits roughly a
> minute for a cold start. A paid instance stays always-on.

### Frontend → Vercel

Set Root Directory to the **repo root**; `vercel.json` supplies the rest of the build settings.
Only one environment variable is required:

```
VITE_API_URL = https://api.your-domain
```

It is baked into the bundle at **build time**, so changing it requires a redeploy.

### Just the calculator, no accounts

`pnpm --filter @pmp/web build:singlefile` produces a single HTML file that runs on any static
host, with no backend and no database.

## Data and privacy

Scenarios are stored in Postgres as **relational plaintext** (not an encrypted blob). What that buys is a
server that can query, aggregate, and eventually compare scenarios against each other. The protection is TLS,
disk encryption, and API authorization — not cryptography. Every query is forced to carry a `userId`
condition, and unauthorized access returns 404 rather than 403, so it doesn't leak whether a resource exists.
Passwords are hashed by Better Auth; no part of this project ever touches the plaintext.

If you care more about the privacy ceiling, you can switch to end-to-end encryption: replace `Scenario` with a
single `ciphertext Bytes` column and encrypt in the browser with WebCrypto before upload. The cost is that
forgetting your password means losing the data, and every server-side feature has to move to the client.

## Data sources and how they stay current

**None of the three countries publishes an official tax-rate API.** Rate tables are published through
legislation and administrative notices (IRS Rev. Proc., CRA web pages, annual notices from local human
resources and social security bureaus) — not as data services. So what's built here is not a "live data feed"
but a mechanism that makes sure **data is never silently used past its expiry**.

| | Upstream | Automation |
|---|---|---|
| 🇺🇸 US federal | [PolicyEngine/policyengine-us](https://github.com/PolicyEngine/policyengine-us) — versioned by effective date, YAML with statutory citations | ✅ fully automated via `pnpm data:sync` |
| 🇺🇸 US states | Same. State YAML layouts aren't uniform, but three patterns cover them | ✅ 19 states synced automatically; OH deliberately excluded, MA structurally unusual — both stay manual |
| 🇨🇦 Canada federal | [PolicyEngine/policyengine-canada](https://github.com/PolicyEngine/policyengine-canada) | ✅ fully automated via `pnpm data:sync` |
| 🇨🇦 Canada provinces | Same source, but **upstream is stuck on 2022–2023 — older than this repo** | ⚠️ maintained by hand; the sync script actively warns you not to trust upstream |
| 🇨🇳 China | None. The National Bureau of Statistics' easyquery endpoint returns `403 UrlACL` to automated access | ❌ `pnpm data:check:cn` change detection + manual verification |

### Four commands

```bash
pnpm data:sync     # pull the automatable US/CA parameters from PolicyEngine (add --write to touch files)
pnpm data:audit    # walk all 31 datasets; exit non-zero if any is past its effective period
pnpm data:check    # detect changes on official pages that have no upstream (China MOHRSS + Canada CRA)
pnpm data:verify   # feed the same households to this engine and to PolicyEngine's live API, then diff
```

### "Always current" is impossible; "expiry is always detected" is not

That's the central trade-off of the whole mechanism, and it's worth stating plainly.

None of the three countries has an official data interface. Everything syncable has been synced (US federal +
19 states, Canada federal). The remaining **27 datasets have no automatable source at all** — every Chinese
provincial contribution base, Canadian CPP/EI and provincial brackets, two US states, and every state's
standard deduction.

So `data:audit` aims at a different target: it doesn't promise the data is always fresh, it **guarantees that
staleness is always detected**. Every dataset registers an effective period;
[data-sync.yml](.github/workflows/data-sync.yml) runs the audit weekly and automatically opens an issue the
moment something expires, nagging until someone verifies it. On PRs it warns but never blocks — stale data is
a maintenance-cadence problem and shouldn't stand in the way of unrelated code changes.

For China, the calendar is more reliable than any scraper: the social insurance year rolls over on July 1 and
notices cluster in July–August, so "effective period expired" is itself the most accurate trigger available.
Fingerprinting the MOHRSS homepage is too noisy to be more than a hint.

### Manual updates are policed by identities

Data with no upstream has to be transcribed by hand, and a mistyped digit produces no error at all — unless
there's an identity to check it against. Canada's CPP/EI, for instance:

```
max CPP contribution  = (YMPE − basic exemption) × rate
max CPP2 contribution = (YAMPE − YMPE) × second-tier rate
max EI premium        = maximum insurable earnings × rate
```

These relationships are written as tests. Each year, after transcribing the new numbers from the CRA, running
the tests tells you whether you transcribed them correctly.

`data:verify` is the most valuable of the four: syncing can only guarantee "the numbers were copied right",
while differential verification catches "the algorithm is wrong". Current results:

- Federal tax matches **exactly** at $45k / $90k / $180k across all states
- State tax: Pennsylvania and all four Massachusetts brackets match exactly; Texas (no state tax) is 0;
  California's largest deviation is 3.6%
- The remaining gaps are **modeling scope, not stale data**: New York's supplemental-tax recapture at high
  incomes, Ohio's AGI-phased personal exemption and business-income deduction, and the SALT itemized
  deduction that PolicyEngine models at $400k (Texas, with no state tax, still matches exactly — which is
  precisely the counter-proof)

Differential verification doesn't just report gaps; it has directly driven fixes. Two examples:

- California's low-income segment was originally off by 18.8%. Working backwards revealed an unmodeled
  **personal exemption credit** ($149, subtracted from tax rather than from taxable income). Adding it brought
  the gap down to 3.6%.
- Massachusetts was off by exactly $100 in every bracket. Working backwards revealed the $2,000
  **FICA deduction allowance** (a Massachusetts-specific rule). Adding it made all four brackets match exactly.

Fixed-amount discrepancies are the easiest to chase down — they usually correspond precisely to one unmodeled rule.

### Don't trust upstream blindly

The sync script actively warns about two traps, both of which were hit in practice:

1. **Upstream goes stale too** — PolicyEngine's Canadian provincial data is stuck on 2022–2023, older than
   the hand-verified values in this repo. The script flags it in red: do not trust.
2. **Upstream may encode its own implementation tricks** — Ohio's first bracket rate is `0.0127448` upstream,
   but that isn't a real rate. It's an implied average rate reverse-engineered to simulate "a fixed amount
   added on crossing a bracket". Treated as an ordinary marginal rate starting at zero, an Ohioan earning
   $20k would be charged $254 of tax where the statutory answer is $0. So Ohio is **deliberately excluded**
   from syncing.

[.github/workflows/data-sync.yml](.github/workflows/data-sync.yml) runs those three commands weekly and opens
a PR when something changes — **but never auto-merges**. Upstream goes stale too; a human has to judge.

### Data is never used silently

Every jurisdiction's data carries a `Provenance` record: effective period, source URL, verification date,
confidence. The engine emits structured warnings when data is expired or unverified, and the UI shows a
prominent data-vintage badge.

**"Stale" and "incompletely modeled" are two separate dimensions, expressed separately**: the effective period
(`effectiveTo`) governs the first, confidence (`confidence`) governs the second. So California reads "synced,
but incompletely modeled (estimated)", Pennsylvania reads "fully clean (derived)", and Ohio reads "expired" —
three distinct states with three distinct meanings.

The easiest way for a financial tool to mislead you isn't getting the arithmetic wrong — it's computing
meticulously from two-year-old parameters.

## ⚠️ On data accuracy

- **City-level social insurance parameters are approximate defaults**, drawn from published figures for the
  2024–2025 social insurance year. Base floors and ceilings are adjusted annually with the local average wage,
  and housing-fund rates vary by employer. Check them against your own payslip — every parameter in the UI is
  directly editable.
- **The separate taxation of year-end bonuses in China runs through 2027-12-31.** If the policy isn't extended
  again, turn off the corresponding switch in the UI.
- Monthly tax is displayed as the annual amount spread evenly, which differs from the actual cumulative
  withholding method month to month, though the annual totals agree.
- Monte Carlo percentiles are a simulated distribution under one set of assumptions. They are **not a forecast,
  and certainly not a promise of returns**.
- Exchange-rate volatility, capital gains tax on investments, debt and mortgages, and interruptions such as
  unemployment or serious illness are all outside the model.

This tool is for personal planning reference only and does not constitute investment advice.

## Roadmap

After P0 and multi-region / multi-language (both done): scenario comparison (including cross-country),
goal solving and FIRE numbers, a life-event timeline, historical-sequence stress tests (2000 / 2008 / 2022),
mortgage and prepayment comparison, CSV/PDF export.

## License

[Apache License 2.0](LICENSE)
