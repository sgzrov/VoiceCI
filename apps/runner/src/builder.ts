import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { RUNNER_CALLBACK_HEADER } from "@voiceci/shared";

const WORK_DIR = "/work";

async function main() {
  const lockfileHash = requireEnv("LOCKFILE_HASH");
  const bundleDownloadUrl = requireEnv("BUNDLE_DOWNLOAD_URL");
  const imageRef = requireEnv("IMAGE_REF");
  const baseImage = process.env["BASE_IMAGE"] ?? "registry.fly.io/voiceci-runner:latest";
  const callbackUrl = requireEnv("BUILDER_CALLBACK_URL");
  const callbackSecret = process.env["RUNNER_CALLBACK_SECRET"] ?? "";
  const flyApiToken = requireEnv("FLY_API_TOKEN");

  console.log(`Builder starting for lockfile_hash=${lockfileHash.slice(0, 12)}...`);

  // 1. Download and extract bundle
  mkdirSync(WORK_DIR, { recursive: true });

  console.log("Downloading bundle...");
  const response = await fetch(bundleDownloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download bundle: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  writeFileSync("/tmp/bundle.tar.gz", Buffer.from(arrayBuffer));

  console.log("Extracting bundle...");
  execSync(`tar -xzf /tmp/bundle.tar.gz -C ${WORK_DIR}`, { stdio: "inherit" });

  // 2. Detect package manager and install dependencies
  const pm = detectPackageManager(WORK_DIR);
  console.log(`Detected package manager: ${pm.name}`);
  console.log("Installing dependencies...");
  execSync(pm.installCmd, { cwd: WORK_DIR, stdio: "inherit", timeout: 180_000 });

  // 3. Create tar layer of node_modules with path matching /work
  console.log("Creating node_modules layer...");
  execSync("cd / && tar cf /tmp/deps-layer.tar work/node_modules", { stdio: "inherit" });

  // 4. Authenticate crane with Fly registry
  console.log("Authenticating with Fly registry...");
  execSync(`crane auth login registry.fly.io -u x -p "${flyApiToken}"`, {
    stdio: "inherit",
  });

  // 5. Append layer and push new image tag
  console.log(`Appending deps layer: ${baseImage} -> ${imageRef}`);
  execSync(
    `crane append --base "${baseImage}" --new_tag "${imageRef}" --new_layer /tmp/deps-layer.tar`,
    { stdio: "inherit", timeout: 180_000 },
  );

  console.log("Image pushed successfully");

  // 6. Notify API that image is ready
  await reportCallback(callbackUrl, callbackSecret, {
    lockfile_hash: lockfileHash,
    image_ref: imageRef,
    status: "ready",
  });

  console.log("Builder complete");
}

interface PackageManager {
  name: string;
  installCmd: string;
}

function detectPackageManager(workDir: string): PackageManager {
  if (existsSync(`${workDir}/pnpm-lock.yaml`)) {
    return { name: "pnpm", installCmd: "corepack enable && pnpm install --frozen-lockfile" };
  }
  if (existsSync(`${workDir}/yarn.lock`)) {
    return { name: "yarn", installCmd: "corepack enable && yarn install --frozen-lockfile" };
  }
  return { name: "npm", installCmd: "npm install" };
}

async function reportCallback(
  url: string,
  secret: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [RUNNER_CALLBACK_HEADER]: secret,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`Callback failed: ${res.status} ${await res.text()}`);
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

main().catch(async (err) => {
  console.error("Builder failed:", err);

  // Try to report failure
  const callbackUrl = process.env["BUILDER_CALLBACK_URL"];
  const callbackSecret = process.env["RUNNER_CALLBACK_SECRET"] ?? "";
  const lockfileHash = process.env["LOCKFILE_HASH"];

  if (callbackUrl && lockfileHash) {
    await reportCallback(callbackUrl, callbackSecret, {
      lockfile_hash: lockfileHash,
      image_ref: process.env["IMAGE_REF"] ?? "",
      status: "failed",
      error_text: err instanceof Error ? err.message : String(err),
    }).catch((e) => console.error("Failed to report builder failure:", e));
  }

  process.exit(1);
});
