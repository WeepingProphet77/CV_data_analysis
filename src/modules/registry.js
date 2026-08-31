/**
 * The section registry — the metadata in sections.js, with each section's
 * component attached.
 *
 * The split exists so sections.js stays plain ESM: the routing rules are tested
 * in node, which cannot load .jsx. Everything that needs a component imports
 * from here; everything that only needs to know what the sections *are* imports
 * from sections.js.
 */
import Home from "./home/index.jsx";
import Projects from "./projects/index.jsx";
import ProductionModule from "./production/index.jsx";
import Drawings from "./drawings/index.jsx";
import CostModule from "./job-cost/index.jsx";
import TimeModule from "./employee-time/index.jsx";
import SourcesModule from "./sources/index.jsx";
import JobPage from "./job/index.jsx";
import { SECTIONS as META, UTILITY as UTILITY_META, DEFAULT_SECTION } from "./sections.js";

const COMPONENTS = {
  "home": Home,
  "projects": Projects,
  "production": ProductionModule,
  "drawings": Drawings,
  "cost": CostModule,
  "time": TimeModule,
  "sources": SourcesModule,
  "job": JobPage,
};

const attach = (list) => list.map((s) => ({ ...s, Component: COMPONENTS[s.id] }));

export const SECTIONS = attach(META);
export const UTILITY = attach(UTILITY_META);

const ALL = [...SECTIONS, ...UTILITY];

export const findSection = (id) => ALL.find((s) => s.id === id);

export { DEFAULT_SECTION };
export { tabsFor, paramsFor, isSection } from "./sections.js";
