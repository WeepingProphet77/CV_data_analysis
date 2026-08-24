/**
 * The module registry — the single place a module is declared.
 *
 * Adding a module means adding one entry here plus its folder under
 * src/modules/. The nav, the router and the landing page all read from this.
 */
import EmployeeTimeModule from "./employee-time/index.jsx";
import ProductionModule from "./production/index.jsx";
import ScheduleModule from "./schedule/index.jsx";

export const MODULES = [
  {
    id: "employee-time",
    label: "Employee Time",
    blurb: "Timesheet hours by person, project, task and date — with cumulative burn plots.",
    status: "ready",
    Component: EmployeeTimeModule,
  },
  {
    id: "production",
    label: "Production",
    blurb: "Cast output, yield and plan-versus-actual. Not built yet.",
    status: "planned",
    Component: ProductionModule,
  },
  {
    id: "schedule",
    label: "Schedule",
    blurb: "Planned versus actual dates, slip and weekly load. Not built yet.",
    status: "planned",
    Component: ScheduleModule,
  },
];

export const DEFAULT_MODULE = "employee-time";

export const findModule = (id) => MODULES.find((m) => m.id === id);
