/**
 * Categorical series colors.
 *
 * Eight fixed slots, assigned in order and never cycled. The set was validated
 * against the dashboard's chart surface (#13243f) for the dark lightness band,
 * chroma floor, adjacent colorblind separation, normal-vision separation and
 * 3:1 contrast. A ninth series would break that guarantee, so callers fold the
 * tail into "Other" (see aggregate.topNWithOther) instead of adding a hue.
 *
 * The UI accent cyan is deliberately absent: chrome and data never share a color.
 */
export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
];

export const OTHER_COLOR = "#6f8ba6";
export const MAX_SERIES = SERIES.length;

/** Color for slot `i`; anything past the last slot is "Other" gray. */
export function seriesColor(i) {
  return i < SERIES.length ? SERIES[i] : OTHER_COLOR;
}
