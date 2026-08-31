/**
 * Missing drawings, grouped by whoever the report names in "Drawn By".
 *
 * A blank is not a person — it is a piece with no drafter assigned, which for
 * an engineering manager is a different and usually worse problem than one that
 * is assigned and late. It keeps its own row rather than being folded into a
 * total, which is why this is a tab of its own rather than a sort option.
 */
import React, { useMemo } from "react";
import { Badge } from "../../../components/ui.jsx";
import { count } from "../../../core/format.js";
import { byDrafter } from "../../production/tickets.js";

export default function ByDrafter({ rows }) {
  const drafters = useMemo(() => byDrafter(rows), [rows]);

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Drawn By</th>
              <th className="num">Pieces</th>
              <th className="num">Jobs</th>
              <th>Earliest bed date</th>
            </tr>
          </thead>
          <tbody>
            {drafters.map((d) => (
              <tr key={d.drawnBy || "(unassigned)"}>
                <td>{d.assigned ? d.drawnBy : <Badge tone="amber">No drafter assigned</Badge>}</td>
                <td className="num">{count(d.pieces)}</td>
                <td className="num">{d.jobs}</td>
                <td className="nowrap muted">{d.range.min || "—"}</td>
              </tr>
            ))}
            {!drafters.length && (
              <tr><td colSpan={4} className="muted" style={{ padding: 18 }}>Nothing in this bucket.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        <strong>Drawn By is blank on most rows</strong> in the reports seen so far. A blank is
        not a person — it is a piece nobody is assigned to, which is why it gets its own row
        rather than being folded into a total.
      </p>
    </>
  );
}
