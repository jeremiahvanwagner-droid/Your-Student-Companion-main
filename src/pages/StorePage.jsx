import { useParams } from "react-router-dom";

import StoreBrowser from "@/components/store/StoreBrowser";

export default function StorePage() {
  const { degreeSlug } = useParams();

  return <StoreBrowser key={degreeSlug || "all-degrees"} initialDegreeSlug={degreeSlug} />;
}
