/**
 * The plants the cost system issues a Job Cost Report for.
 *
 * This file used to translate Concrete Vision plant names into cost-report
 * plants, for the join to the production schedule: CV splits Hillsboro into an
 * architectural and a structural plant, and runs Jacksonville and Pearland,
 * which have no cost report. That join went with Production on 2026-09-25
 * (docs/cost-and-time-focus.md).
 *
 * What remains is the list itself, which `plantFromFileName` reads to rescue a
 * drifted filename. It is the one place to edit when a plant is added or
 * renamed.
 *
 * **The timesheet's `Location` is not a plant** — it is the person's office
 * (CLAUDE.md §12). Never map it through this list.
 */
export const COST_PLANTS = ["Ashland City", "Hillsboro", "Kissimmee", "Monroeville"];
