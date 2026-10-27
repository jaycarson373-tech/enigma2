import { notFound } from "next/navigation";
import ReleaseConsole from "@/components/release-console";
export const dynamic = "force-dynamic";
export default function LocalDeployment() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ReleaseConsole />;
}
