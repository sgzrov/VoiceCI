import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

export async function uploadBundle(
  filePath: string,
  uploadUrl: string
): Promise<void> {
  const { size } = statSync(filePath);
  const nodeStream = createReadStream(filePath);

  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(size),
    },
    body: webStream,
    duplex: "half",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} ${text}`);
  }
}
