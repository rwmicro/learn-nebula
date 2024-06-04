import { getDirectoryStructure } from "../lib/Structure";
import General from "../components/General";

export default async function Page() {
  const tree = await getDirectoryStructure("./articles");

  return (
    <>
      <div className="h-screen w-screen bg-white">
        <General tree={tree} />
      </div>
    </>
  );
}
