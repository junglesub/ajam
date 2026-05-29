import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const files = [
  ["nodes/Ajam/Ajam.node.json", "dist/nodes/Ajam/Ajam.node.json"],
  ["nodes/Ajam/ajam.svg", "dist/nodes/Ajam/ajam.svg"]
];

for (const [from, to] of files) {
  await mkdir(dirname(to), { recursive: true });
  await copyFile(join(process.cwd(), from), join(process.cwd(), to));
}
