import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postcss from "postcss";

const CSS_DIRECTORY = path.resolve("src/recipes");
const BUDGET = {
  bytes: 85_000,
  files: 6,
  importantDeclarations: 3,
  rules: 700,
};

const directoryEntries = await fs.readdir(CSS_DIRECTORY, { withFileTypes: true });
const cssFiles = directoryEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
  .map((entry) => path.join(CSS_DIRECTORY, entry.name))
  .sort();

const totals = {
  bytes: 0,
  files: cssFiles.length,
  importantDeclarations: 0,
  rules: 0,
  selectors: 0,
};

for (const cssFile of cssFiles) {
  const source = await fs.readFile(cssFile, "utf8");
  const root = postcss.parse(source, { from: cssFile });

  totals.bytes += Buffer.byteLength(source);
  root.walkRules((rule) => {
    totals.rules += 1;
    totals.selectors += rule.selectors?.length ?? 0;
  });
  root.walkDecls((declaration) => {
    if (declaration.important) totals.importantDeclarations += 1;
  });
}

console.log(
  `CSS audit: ${totals.files} files, ${totals.bytes.toLocaleString()} bytes, ` +
    `${totals.rules} rules, ${totals.selectors} selectors, ` +
    `${totals.importantDeclarations} !important declarations.`,
);

const failures = Object.entries(BUDGET)
  .filter(([metric, limit]) => totals[metric] > limit)
  .map(
    ([metric, limit]) =>
      `${metric}: ${totals[metric].toLocaleString()} exceeds ${limit.toLocaleString()}`,
  );

if (failures.length > 0) {
  console.error("CSS growth budget exceeded:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
