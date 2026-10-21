import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFutureDraftForDate, extractVacationRangeInitialState, withClientIds } from "./timesheet-drafts.ts";

describe("timesheet production draft helpers", () => {
  it("gives future vacations distinct nonempty IDs and preserves allowance settings", () => {
    const draft = createFutureDraftForDate("2026-11-02");
    const entry = draft.entries[0];
    assert.ok(entry.clientId);
    assert.equal(entry.kind, "VACATION");
    assert.equal(entry.vacationDeductsAllowance, true);
    assert.equal(withClientIds(draft).entries[0].clientId, entry.clientId);

    const exempt = createFutureDraftForDate("2026-11-02", "포상휴가", 4, "CONFIRMED", false).entries[0];
    assert.ok(exempt.clientId);
    assert.notEqual(exempt.clientId, entry.clientId);
    assert.equal(exempt.vacationDeductsAllowance, false);
    assert.equal(exempt.hours, 4);
  });

  it("preserves client IDs, falls back to persisted IDs, and fills missing IDs once", () => {
    const draft = createFutureDraftForDate("2026-11-05");
    const entry = draft.entries[0];
    const decorated = withClientIds({
      ...draft,
      entries: [
        { ...entry, clientId: "existing", id: "" },
        { ...entry, clientId: "", id: "persisted" },
        { ...entry, clientId: "", id: "" }
      ]
    });

    assert.equal(decorated.entries[0].clientId, "existing");
    assert.equal(decorated.entries[1].clientId, "persisted");
    assert.ok(decorated.entries[2].clientId);
    assert.equal(new Set(decorated.entries.map((item) => item.clientId)).size, 3);
    assert.deepEqual(withClientIds(decorated), decorated);
  });

  it("captures the selected vacation's allowance flag for the range modal", () => {
    const entry = createFutureDraftForDate("2026-07-20", "하계휴가", 4, "TEMPORARY").entries[0];
    for (const flag of [false, true, undefined]) {
      assert.deepEqual(extractVacationRangeInitialState({ ...entry, vacationDeductsAllowance: flag }), {
        hours: 4,
        vacationDeductsAllowance: flag !== false,
        vacationName: "하계휴가",
        vacationStatus: "TEMPORARY"
      });
    }
    assert.deepEqual(extractVacationRangeInitialState(), {
      hours: 8,
      vacationDeductsAllowance: true,
      vacationName: "",
      vacationStatus: "CONFIRMED"
    });
  });
});
