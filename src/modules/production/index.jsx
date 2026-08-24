import React from "react";
import ModulePlaceholder from "../../components/ModulePlaceholder.jsx";

export default function ProductionModule() {
  return (
    <ModulePlaceholder
      title="Production"
      summary="Analysis of Concrete Vision production data — what was cast, when, where, and how actual output compared with what was planned."
      planned={[
        "Output by product / mix / form over time, cumulative and per day",
        "Yield and scrap rates by plant and by shift",
        "Planned versus actual production, with variance called out",
        "Cross-link to Employee Time: labor hours per unit produced",
      ]}
      expects={["Production Date", "Plant / Location", "Job Name", "Product / Piece Mark", "Quantity", "Unit", "Shift", "Status"]}
    />
  );
}
