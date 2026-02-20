import { execSync } from "node:child_process";
import { createReadStream, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { platform } from "node:os";

export interface BundleResult {
  filePath: string;
  hash: string;
  size: number;
}

export async function createBundle(projectRoot: string): Promise<BundleResult> {
  const outFile = join(tmpdir(), `voiceci-bundle-${randomUUID()}.tar.gz`);

  // Build exclude list from .gitignore + defaults
  const excludes = [
    "--exclude=node_modules",
    "--exclude=.git",
    "--exclude=dist",
    "--exclude=.next",
    "--exclude=.turbo",
    "--exclude=coverage",
    "--exclude=*.tar.gz",
  ];

  // GNU tar supports --sort and --mtime for reproducibility; BSD tar (macOS) does not
  const gnuFlags = platform() === "darwin" ? "" : ' --sort=name --mtime="2000-01-01"';

  execSync(
    `tar -czf ${outFile} ${excludes.join(" ")}${gnuFlags} -C ${projectRoot} .`,
    { stdio: "pipe" }
  );

  const hash = await computeHash(outFile);
  const { size } = statSync(outFile);

  return { filePath: outFile, hash, size };
}

function computeHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => h.update(chunk));
    stream.on("end", () => resolve(h.digest("hex")));
    stream.on("error", reject);
  });
}
