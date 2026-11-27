# Risk policy (enforced in code: risk.py / execution.py; independent of strategies and AI)
Initial TEST parameters (editable, validated, not guaranteed safe): risk/trade 0.5%, daily loss 1.5%, weekly 3%, max 3 open positions,
min R:R 1:2, max 3 consecutive losses, max position 20% of capital, total allocation 60%, sector 35%, leverage 1x.
- Capital is never assumed: no capital configured means no orders.
- Every entry needs stop + target before submission; quantity = risk amount / stop distance, rounded down to lots.
- Entry order of checks: kill switch, locks, segment, time window, price geometry, R:R, spread, duplicates, position/trade counts, size, leverage,
  total allocation, sector exposure.
- A position without a confirmed protective stop is flattened immediately and the bot locks (STOPFAIL).
- Stops only tighten; a replacement stop is placed and validated before the old one is cancelled.
- Daily loss counts realised + unrealised. Hitting it locks new entries for the session; weekly lock lasts to the next ISO week.
- Locks of kind MANUAL / RECON / STOPFAIL need an explicit human unlock naming who approved it. Daily/consecutive locks clear next session.
- Emergency kill: lock, cancel unfilled entries, flatten, verify positions at the broker. Policy default: flatten at market.
- The bot never raises capital, leverage, risk limits or permissions on its own. LIVE requires validated config, `live_confirmed`, 30 paper sessions, no kill switch.
