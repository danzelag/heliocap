import type { Metadata } from "next";
import ResidentialLandingPage from "../ResidentialLandingPage";

export const metadata: Metadata = {
  title: "AmberField Energy — Free Home Energy Estimate",
  description:
    "Request a free residential solar, heat pump, and EV charger estimate from AmberField Energy.",
};

export default function EstimatePage() {
  return <ResidentialLandingPage />;
}
