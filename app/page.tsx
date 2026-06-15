import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "AmberField Energy — Your Property. Your Power.",
  description:
    "AmberField Energy designs residential solar, heat pump, and EV charging plans with trusted Canadian specialist partners.",
};

export default function HomePage() {
  redirect("/amberfield-offline.html");
}
