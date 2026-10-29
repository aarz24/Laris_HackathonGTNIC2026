import type { Metadata } from "next";
import LarisApp from "@/components/laris-app";

export const metadata: Metadata = {
  title: "Demo Laris",
  description: "Coba workspace demo Laris dengan data fiktif Kopi Senja. Perubahan hanya tersimpan di browser ini.",
};

export default function DemoPage() {
  return <LarisApp mode="local" />;
}
