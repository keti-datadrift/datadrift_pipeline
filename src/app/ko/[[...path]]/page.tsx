import Dashboard from "@/components/dashboard";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const path = (await params).path || ["workspaces"];
  if (
    path.length > 2 ||
    ![
      "workspaces",
      "models",
      "reconstruction",
      "training",
      "evaluation",
      "monitoring",
    ].includes(path[0]) ||
    (path[0] === "monitoring" && !["training", "drift"].includes(path[1]))
  )
    notFound();
  return <Dashboard path={path} />;
}
