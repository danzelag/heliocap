import type { Metadata } from "next";
import PublicHomePage from "./PublicHomePage";

export const metadata: Metadata = {
  title: "AmberField Energy — Your Property. Your Power.",
  description:
    "AmberField Energy designs residential solar, heat pump, and EV charging plans with trusted Canadian specialist partners.",
};

export default function HomePage() {
  return <PublicHomePage />;
}
