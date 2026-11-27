import json, os, sys, unittest
from datetime import datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from tradingbot.config import BotConfig, ConfigError, validate, live_gate
from tradingbot.costs import equity_intraday_costs, options_costs
from tradingbot.risk import RiskEngine, Signal, position_size
from tradingbot.ledger import Ledger
from tradingbot.paper_broker import PaperBroker
from tradingbot.execution import ExecutionEngine
from tradingbot.reconcile import reconcile
from tradingbot import indicators as ind

T = datetime(2026, 11, 26, 10, 0)


def cfg(**kw):
    c = BotConfig.from_dict({"mode": "PAPER", "enabled": True, "risk": {"capital": 100000}})
    for k, v in kw.items():
        setattr(c, k, v)
    return c


def sig(sym="REL", sid="s1", entry=1000.0, stop=980.0, target=1040.0, sector="ENERGY", side="BUY", **kw):
    return Signal(sid, "TEST", sym, side, entry, stop, target, sector=sector, **kw)


def rig(**kw):
    c = cfg(**kw)
    b, l = PaperBroker(), Ledger()
    b.set_price("REL", 1000.0)
    b.set_price("ABC", 500.0)
    r = RiskEngine(c)
    return c, b, l, r, ExecutionEngine(c, b, l, r)


class TestConfig(unittest.TestCase):
    def test_default_file_loads_and_demands_capital(self):
        path = os.path.join(os.path.dirname(__file__), "..", "backend", "config", "default_config.json")
        c = BotConfig.from_file(path)
        errs, _ = validate(c)
        self.assertTrue(any("capital" in e for e in errs))
        self.assertEqual(c.mode, "RESEARCH")
        self.assertFalse(c.enabled)

    def test_unknown_key_is_error(self):
        with self.assertRaises(ConfigError):
            BotConfig.from_dict({"risk": {"capitl": 5}})
        with self.assertRaises(ConfigError):
            BotConfig.from_dict({"mood": "LIVE"})

    def test_bad_values_rejected(self):
        c = cfg()
        c.risk.risk_per_trade_pct = 5
        self.assertTrue(validate(c)[0])
        c = cfg()
        c.risk.max_weekly_loss_pct = 1.0
        self.assertTrue(validate(c)[0])
        c = cfg(last_entry="16:00")
        self.assertTrue(validate(c)[0])

    def test_live_gate(self):
        c = cfg(mode="LIVE")
        ok, why = live_gate(c)
        self.assertFalse(ok)
        self.assertTrue(any("live_confirmed" in w for w in why))
        self.assertTrue(any("0/30" in w for w in why))
        c.live_confirmed, c.paper_sessions_completed = True, 29
        self.assertFalse(live_gate(c)[0])
        c.paper_sessions_completed = 30
        self.assertTrue(live_gate(c)[0])
        c.kill_switch = True
        self.assertFalse(live_gate(c)[0])


class TestSizingAndCosts(unittest.TestCase):
    def test_position_size(self):
        self.assertEqual(position_size(100000, 0.5, 1000, 980), 25)
        self.assertEqual(position_size(100000, 0.5, 25000, 24900, lot_size=75), 0)   # one lot risks too much
        self.assertEqual(position_size(1000000, 0.5, 25000, 24900, lot_size=75), 0 + 75 * int(5000 / 100 / 75))
        with self.assertRaises(ValueError):
            position_size(100000, 0.5, 1000, 1000)

    def test_equity_costs_hand_checked(self):
        c = equity_intraday_costs(100000, 101000)
        self.assertAlmostEqual(c["brokerage"], 40.0, places=2)
        self.assertAlmostEqual(c["stt"], 25.25, places=2)
        self.assertAlmostEqual(c["stamp"], 3.0, places=2)
        self.assertAlmostEqual(c["total"], 82.73, places=1)

    def test_option_costs_use_budget_2026_stt(self):
        c = options_costs(10000, 11000)
        self.assertAlmostEqual(c["stt"], 16.5, places=2)     # 0.15% of sell premium
        self.assertAlmostEqual(c["total"], 72.70, places=1)


class TestRisk(unittest.TestCase):
    def test_approve_and_size(self):
        d = RiskEngine(cfg()).check_entry(sig(), T)
        self.assertTrue(d.approved)
        self.assertEqual(d.qty, 20)                       # capped by 20% position limit
        self.assertEqual(d.risk_amount, 400)

    def test_rr_and_geometry(self):
        r = RiskEngine(cfg())
        self.assertFalse(r.check_entry(sig(target=1030), T).approved)           # RR 1.5
        self.assertFalse(r.check_entry(sig(stop=1010), T).approved)             # stop above entry for BUY
        self.assertTrue(r.check_entry(sig(side="SELL", entry=1000, stop=1020, target=960), T).approved)

    def test_window_segment_spread(self):
        r = RiskEngine(cfg())
        self.assertFalse(r.check_entry(sig(), datetime(2026, 11, 26, 9, 0)).approved)
        self.assertFalse(r.check_entry(sig(), datetime(2026, 11, 26, 15, 0)).approved)
        self.assertFalse(r.check_entry(sig(segment="FNO"), T).approved)
        self.assertFalse(r.check_entry(sig(bid=999, ask=1010), T).approved)

    def test_max_positions_sector_and_duplicates(self):
        r = RiskEngine(cfg())
        r.record_open("A", 10000, "S1", 100); r.record_open("B", 10000, "S2", 100); r.record_open("C", 10000, "S3", 100)
        self.assertIn("max open positions", " ".join(r.check_entry(sig(), T).reasons))
        r = RiskEngine(cfg())
        r.record_open("A", 20000, "ENERGY", 100)
        self.assertIn("sector", " ".join(r.check_entry(sig(), T).reasons))
        self.assertTrue(r.check_entry(sig(sector="IT"), T).approved)
        self.assertIn("already", " ".join(r.check_entry(sig(sym="A", sector="IT"), T).reasons))

    def test_daily_loss_locks_then_next_day_clears(self):
        r = RiskEngine(cfg())
        r.record_close("X", -1500, T)
        self.assertEqual(r.lock_kind, "DAILY")
        self.assertFalse(r.check_entry(sig(), T).approved)
        self.assertTrue(r.check_entry(sig(), datetime(2026, 11, 27, 10, 0)).approved)

    def test_unrealized_loss_counts(self):
        r = RiskEngine(cfg())
        r.update_unrealized(-1600, T)
        self.assertEqual(r.lock_kind, "DAILY")

    def test_consecutive_losses_lock(self):
        r = RiskEngine(cfg())
        for _ in range(3):
            r.record_close("X", -100, T)
        self.assertEqual(r.lock_kind, "CONSEC")
        self.assertFalse(r.check_entry(sig(), T).approved)

    def test_weekly_loss_lock_persists_across_days_until_new_week(self):
        r = RiskEngine(cfg())
        for d in (23, 24):
            r.record_close("X", -1400, datetime(2026, 11, d, 10, 0))
        r.record_close("X", -300, datetime(2026, 11, 25, 10, 0))
        self.assertEqual(r.lock_kind, "WEEKLY")
        self.assertFalse(r.check_entry(sig(), datetime(2026, 11, 26, 10, 0)).approved)
        self.assertTrue(r.check_entry(sig(), datetime(2026, 11, 30, 10, 0)).approved)

    def test_kill_switch_and_manual_unlock(self):
        c = cfg(kill_switch=True)
        self.assertFalse(RiskEngine(c).check_entry(sig(), T).approved)
        r = RiskEngine(cfg())
        r.lock("RECON", "x")
        self.assertFalse(r.check_entry(sig(), T).approved)
        with self.assertRaises(ValueError):
            r.unlock("")
        r.unlock("lavesh")
        self.assertTrue(r.check_entry(sig(), T).approved)

    def test_invalid_config_blocks_everything(self):
        c = cfg()
        c.risk.capital = None
        d = RiskEngine(c).check_entry(sig(), T)
        self.assertFalse(d.approved)


class TestLedger(unittest.TestCase):
    def test_idempotent_intent(self):
        l = Ledger()
        _, created = l.register_intent("k", "A", "BUY", 10, "MARKET", "ENTRY")
        _, again = l.register_intent("k", "A", "BUY", 10, "MARKET", "ENTRY")
        self.assertTrue(created); self.assertFalse(again)
        self.assertEqual(len(l.orders()), 1)

    def test_net_positions_from_fills(self):
        l = Ledger()
        l.register_intent("a", "A", "BUY", 10, "MARKET", "ENTRY"); l.update("a", filled_qty=10, status="FILLED")
        l.register_intent("b", "A", "SELL", 4, "MARKET", "EXIT"); l.update("b", filled_qty=4, status="FILLED")
        self.assertEqual(l.net_positions(), {"A": 6})
        with self.assertRaises(ValueError):
            l.update("a", symbol="Z")


class TestExecution(unittest.TestCase):
    def test_research_and_disabled_and_live_gate_place_nothing(self):
        for kw in ({"mode": "RESEARCH"}, {"enabled": False}, {"mode": "LIVE"}):
            c, b, l, r, e = rig(**kw)
            res = e.submit_entry(sig(), T)
            self.assertIn(res["status"], ("RESEARCH_ONLY", "REJECTED"))
            self.assertEqual(len(b.orders), 0)

    def test_happy_path_places_entry_and_stop(self):
        c, b, l, r, e = rig()
        res = e.submit_entry(sig(), T)
        self.assertEqual(res["status"], "ENTERED")
        self.assertEqual(res["qty"], 20)
        self.assertEqual(b.positions, {"REL": 20})
        stops = [o for o in b.orders.values() if o.order_type == "SL_M"]
        self.assertEqual(len(stops), 1)
        self.assertEqual((stops[0].status, stops[0].side, stops[0].qty, stops[0].trigger), ("OPEN", "SELL", 20, 980.0))
        self.assertEqual(reconcile(c, l, b, r)["ok"], True)

    def test_lost_timeout_not_retried(self):
        c, b, l, r, e = rig()
        b.fail_mode = "timeout_lost"
        self.assertEqual(e.submit_entry(sig(), T)["status"], "NOT_PLACED")
        self.assertEqual(e.submit_entry(sig(), T)["status"], "DUPLICATE")      # same signal never re-sent
        self.assertEqual(len(b.orders), 0)
        self.assertEqual(e.submit_entry(sig(sid="s2"), T)["status"], "ENTERED")  # a new signal is fine

    def test_accepted_timeout_adopts_existing_order_no_double(self):
        c, b, l, r, e = rig()
        b.fail_mode = "timeout_accepted"
        self.assertEqual(e.submit_entry(sig(), T)["status"], "ENTERED")
        self.assertEqual(len([o for o in b.orders.values() if o.order_type == "MARKET"]), 1)
        self.assertEqual(b.positions, {"REL": 20})

    def test_unknown_state_locks_and_reconcile_flags(self):
        c, b, l, r, e = rig()
        b.fail_mode, b.lookup_down = "timeout_accepted", True
        self.assertEqual(e.submit_entry(sig(), T)["status"], "UNRESOLVED")
        self.assertEqual(r.lock_kind, "RECON")
        self.assertFalse(reconcile(c, l, b, r)["ok"])          # broker holds 20, ledger recorded no fill

    def test_rejected_and_rate_limited_are_definitive(self):
        for mode in ("reject", "rate_limited"):
            c, b, l, r, e = rig()
            b.fail_mode = mode
            self.assertEqual(e.submit_entry(sig(), T)["status"], "NOT_PLACED")
            self.assertEqual(b.positions, {})

    def test_insufficient_funds(self):
        c, b, l, r, e = rig()
        b.funds = 1000
        self.assertEqual(e.submit_entry(sig(), T)["status"], "REJECTED")
        self.assertEqual(len(b.orders), 0)

    def test_partial_fill_stop_sized_to_filled_qty(self):
        c, b, l, r, e = rig()
        b.partial_fraction = 0.5
        res = e.submit_entry(sig(), T)
        self.assertEqual((res["status"], res["qty"], res["partial"]), ("ENTERED", 10, True))
        stop = [o for o in b.orders.values() if o.order_type == "SL_M"][0]
        self.assertEqual(stop.qty, 10)
        self.assertEqual(l.get_open_trade("REL")["qty"], 10)

    def test_stop_placement_failure_flattens_and_locks(self):
        c, b, l, r, e = rig()
        b.reject_stops = True
        self.assertEqual(e.submit_entry(sig(), T)["status"], "ENTERED_NO_STOP_FLATTENED")
        self.assertEqual(b.positions, {})
        self.assertEqual(r.lock_kind, "STOPFAIL")
        self.assertEqual(l.open_trades(), [])

    def test_stop_hit_detected_by_sync(self):
        c, b, l, r, e = rig()
        e.submit_entry(sig(), T)
        b.set_price("REL", 975.0)
        out = e.sync(T)
        self.assertEqual(out[0]["reason"], "STOP_HIT")
        self.assertLess(out[0]["net"], 0)
        self.assertEqual(b.positions, {})
        self.assertEqual(r.open, {})
        self.assertLess(r.realized_today, 0)

    def test_normal_exit_cancels_stop_and_verifies_flat(self):
        c, b, l, r, e = rig()
        e.submit_entry(sig(), T)
        b.set_price("REL", 1010.0)
        res = e.exit_position("REL", "TARGET", T)
        self.assertEqual(res["status"], "EXITED")
        self.assertGreater(res["gross"], 0)
        self.assertEqual(b.positions, {})
        self.assertEqual([o.status for o in b.orders.values() if o.order_type == "SL_M"], ["CANCELLED"])
        self.assertEqual(e.exit_position("REL", "AGAIN", T)["status"], "NO_POSITION")

    def test_exit_mismatch_locks(self):
        c, b, l, r, e = rig()
        e.submit_entry(sig(), T)
        b.positions["REL"] += 5            # broker disagrees with us
        res = e.exit_position("REL", "X", T)
        self.assertEqual(res["status"], "EXIT_MISMATCH")
        self.assertEqual(r.lock_kind, "RECON")

    def test_trailing_only_tightens_and_never_leaves_gap(self):
        c, b, l, r, e = rig()
        e.submit_entry(sig(), T)
        b.set_price("REL", 1020.0)
        self.assertEqual(e.trail_stop("REL", 970.0)["status"], "REJECTED")      # loosening (below current 980)
        self.assertEqual(e.trail_stop("REL", 980.0)["status"], "REJECTED")      # no change is not a tighten
        self.assertEqual(e.trail_stop("REL", 1030.0)["status"], "REJECTED")     # above price
        self.assertEqual(e.trail_stop("REL", 1005.0)["status"], "TRAILED")
        stops = [o for o in b.orders.values() if o.order_type == "SL_M"]
        self.assertEqual(sorted((o.trigger, o.status) for o in stops), [(980.0, "CANCELLED"), (1005.0, "OPEN")])
        self.assertEqual(l.get_open_trade("REL")["stop"], 1005.0)
        b.reject_stops = True
        self.assertEqual(e.trail_stop("REL", 1010.0)["status"], "TRAIL_FAILED_KEPT_OLD")
        self.assertEqual(len([o for o in b.orders.values() if o.status == "OPEN" and o.order_type == "SL_M"]), 1)

    def test_kill_flattens_everything_and_blocks_new_entries(self):
        c, b, l, r, e = rig()
        e.submit_entry(sig(), T)
        e.submit_entry(sig(sym="ABC", sid="s2", entry=500, stop=490, target=520, sector="IT"), T)
        self.assertEqual(len(b.positions), 2)
        e.kill("manual test", T)
        self.assertEqual(b.positions, {})
        self.assertEqual(l.open_trades(), [])
        self.assertEqual(r.lock_kind, "MANUAL")
        self.assertEqual(e.submit_entry(sig(sid="s9"), T)["status"], "REJECTED")

    def test_reconcile_foreign_positions_are_warnings_unless_strict(self):
        c, b, l, r, e = rig()
        b.positions["MANUAL_OPT"] = 550
        rep = reconcile(c, l, b, r)
        self.assertTrue(rep["ok"]); self.assertEqual(rep["foreign"], {"MANUAL_OPT": 550})
        c.strict_account_scope = True
        self.assertFalse(reconcile(c, l, b, r)["ok"])
        self.assertEqual(r.lock_kind, "RECON")


class TestIndicators(unittest.TestCase):
    def test_ema_values_and_causality(self):
        v = list(range(1, 11))
        e = ind.ema(v, 3)
        self.assertEqual(e[:5], [None, None, 2.0, 3.0, 4.0])
        self.assertEqual(ind.ema(v[:7], 3), e[:7])       # prefix gives identical values: no look-ahead

    def test_rsi(self):
        self.assertTrue(all(x == 100.0 for x in ind.rsi(list(range(1, 21)), 14)[14:]))
        self.assertAlmostEqual(ind.rsi([10, 11] * 8, 14)[14], 50.0, places=6)
        self.assertAlmostEqual(ind.rsi([10, 11] * 8, 14)[15], 100 - 100 / (1 + (0.5 * 13 + 1) / (0.5 * 13)), places=6)

    def test_atr_and_vwap(self):
        self.assertAlmostEqual(ind.atr([11] * 20, [10] * 20, [10.5] * 20, 14)[-1], 1.0, places=9)
        self.assertEqual(ind.vwap([10, 20], [10, 20], [10, 20], [100, 300])[1], 17.5)


if __name__ == "__main__":
    unittest.main()
