# Regulatory and broker constraints (verify before deployment)

Researched 2026-11-26 from secondary sources plus one NSE circular. Nothing here is legal advice; confirm with Groww and the exchange.
- SEBI retail algo framework (Feb 2025): per SEBI's 30 Sep 2025 circular it applies to all brokers from **1 Apr 2026**. Brokers that missed
  glide-path milestones were barred from onboarding new retail API-algo clients from 5 Jan 2026.
- NSE circular dated 20 Nov 2026 (Ref. 58/2026) warns about misuse of static-IP facilities and asks brokers to take an undertaking that
  "tech-savvy" retail clients genuinely write their own algos. Expect Groww to ask for this.
- An "under about 10 orders/second needs no exchange registration" threshold is quoted by blogs; **not found in the NSE primary text. Verify.**
- Groww API rate limits are per category: non-trading 20/s and 500/min; access-token endpoint 150 per 24h. Order and live-data limits are
  reported inconsistently (10 vs 15 per second, 250/min); live feed up to 1000 subscriptions. Treat as unverified; read current docs.
- Static IP requirement and algo-registration details for Groww: **not verified.**
Design rules: no workarounds; own-account use only; no sharing of credentials; MIS positions squared off before the broker/exchange cut-off
(square_off setting, default 15:15); every order idempotent and logged.
