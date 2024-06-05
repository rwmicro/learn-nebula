import { getDirectoryStructure } from "../lib/Structure";
import General from "@/components/General";

export default async function FileTreePage() {
  const tree = await getDirectoryStructure("articles");
  return <General tree={tree} />;
}
