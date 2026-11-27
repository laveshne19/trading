"""Groww live adapter: INTENTIONALLY NOT IMPLEMENTED.

Reasons (see documentation/PHASE1_AUDIT.md): the Groww MCP in the build environment is read-only (no order tools) and
api.groww.in is unreachable from it, so this adapter cannot be written AND tested here. It must be implemented against
the official `growwapi` SDK on the machine that will run the bot (static IP, Groww-approved), then pass the same
contract tests as PaperBroker (tests/test_broker_contract.py) before any LIVE use.
"""
from .broker import Broker


class GrowwBroker(Broker):
    def __init__(self, *a, **k):
        raise NotImplementedError("GrowwBroker is not implemented/tested. See module docstring.")

    # abstract methods satisfied for typing only
    def place_order(self, *a, **k): raise NotImplementedError
    def get_order(self, *a, **k): raise NotImplementedError
    def find_order_by_ref(self, *a, **k): raise NotImplementedError
    def cancel_order(self, *a, **k): raise NotImplementedError
    def get_positions(self, *a, **k): raise NotImplementedError
    def get_ltp(self, *a, **k): raise NotImplementedError
    def get_funds(self, *a, **k): raise NotImplementedError
