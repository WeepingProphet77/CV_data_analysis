import React from "react";
import ModulePlaceholder from "../../components/ModulePlaceholder.jsx";

export default function ScheduleModule() {
  return (
    <ModulePlaceholder
      title="Schedule"
      summary="Analysis of Concrete Vision scheduling data — planned dates against actuals, and where a job is drifting."
      planned={[
        "Gantt-style timeline of scheduled versus actual job phases",
        "Slip analysis: days early or late by job, phase and crew",
        "Load by week — scheduled hours or units against available capacity",
        "Cross-link to Employee Time: did charged hours follow the schedule?",
      ]}
      expects={["Job Name", "Phase / Activity", "Scheduled Start", "Scheduled Finish", "Actual Start", "Actual Finish", "Crew / Resource", "Status"]}
    />
  );
}
