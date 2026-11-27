# System configuration (backend/config/default_config.json; unknown keys are rejected)
| Key | Default | Notes |
|---|---|---|
| mode | RESEARCH | RESEARCH (signals only), PAPER (simulated), LIVE (real; gated) |
| enabled | false | master switch |
| kill_switch | false | blocks all new orders |
| live_confirmed | false | only you may set it |
| paper_sessions_completed / required_paper_sessions | 0 / 30 | LIVE needs completed >= required |
| trading_start / last_entry / square_off | 09:30 / 14:45 / 15:15 | must be ordered |
| allowed_segments | ["CASH"] | add "FNO" only with options_enabled |
| options_enabled | false | requires tested options strategy |
| strict_account_scope | false | true: positions the bot did not create lock the bot |
| risk.capital | null (REQUIRED INPUT) | never assumed |
| risk.* | see risk_policy.md | validated on every entry |
Secrets (Groww key/secret/TOTP, Telegram token) live ONLY in environment variables or a secret manager, never in this file or any Sheet.
