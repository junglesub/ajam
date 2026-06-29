import { access, cp, copyFile, mkdir } from "node:fs/promises";

const requiredStaticFiles = ["manifest.json", "popup.html", "popup.css"];
const optionalStaticFiles = ["test-page.html"];

await mkdir("dist", { recursive: true });

for (const file of requiredStaticFiles) {
  await copyFile(`src/${file}`, `dist/${file}`);
}

await cp("src/icons", "dist/icons", { recursive: true });

for (const file of optionalStaticFiles) {
  const source = `src/${file}`;

  try {
    await access(source);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue;
    }

    throw error;
  }

  await copyFile(source, `dist/${file}`);
}
