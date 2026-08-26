/**
 * Plant names across two systems.
 *
 * The cost reports and Concrete Vision do not use the same plant list. CV
 * splits Hillsboro into an architectural and a structural plant; the cost
 * system bills them as one. CV also runs Jacksonville and Pearland, which have
 * no cost report at all.
 *
 * This map exists so the join works today. It is the one place to edit when a
 * plant is added, renamed or split — nothing else should hard-code a plant.
 */

/** cost-report plant -> the Concrete Vision plant names it covers. */
export const COST_TO_PRODUCTION = {
  "Ashland City": ["Ashland City"],
  Hillsboro: ["Hillsboro", "Hillsboro Structural"],
  Kissimmee: ["Kissimmee"],
  Monroeville: ["Monroeville"],
};

const PRODUCTION_TO_COST = (() => {
  const m = new Map();
  for (const [cost, prods] of Object.entries(COST_TO_PRODUCTION)) for (const p of prods) m.set(p, cost);
  return m;
})();

/**
 * The cost-report plant a Concrete Vision plant rolls up to. An unmapped plant
 * returns its own name, so it still groups sensibly and is visibly unmatched
 * rather than silently folded into another plant.
 */
export const costPlantFor = (productionPlant) =>
  PRODUCTION_TO_COST.get(productionPlant) || productionPlant;

export const productionPlantsFor = (costPlant) => COST_TO_PRODUCTION[costPlant] || [costPlant];

/** True when this CV plant has no cost report defined for it at all. */
export const isUnmappedProductionPlant = (productionPlant) =>
  !PRODUCTION_TO_COST.has(productionPlant);
