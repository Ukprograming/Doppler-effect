import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { extname, relative, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
};

function getContentType(fileName: string) {
  const extension = extname(fileName);
  return contentTypes[extension] ?? "application/octet-stream";
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const pathname = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(pathname) : [pathname];
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "sites-static-worker",
      writeBundle(options) {
        const outputDirectory = resolve(options.dir ?? "dist");
        const workerPath = resolve(outputDirectory, "server/index.js");
        const files = listFiles(outputDirectory)
          .filter((pathname) => pathname !== workerPath)
          .map((pathname) => {
            const fileName = relative(outputDirectory, pathname).replaceAll(
              "\\",
              "/",
            );
            return [
              `/${fileName}`,
              {
                body: readFileSync(pathname).toString("base64"),
                contentType: getContentType(fileName),
              },
            ] as const;
          });

        const workerSource = `
const files = ${JSON.stringify(Object.fromEntries(files))};

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    if (pathname === "/") pathname = "/index.html";
    const file =
      files[pathname] ??
      (pathname.endsWith("/") ? files["/index.html"] : undefined) ??
      (!pathname.split("/").pop().includes(".") ? files["/index.html"] : undefined);

    if (!file) return new Response("Not found", { status: 404 });

    const headers = new Headers({
      "Content-Type": file.contentType,
      "Cache-Control": pathname === "/index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });

    if (request.method === "HEAD") return new Response(null, { headers });
    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    return new Response(decodeBase64(file.body), { headers });
  },
};
`;

        mkdirSync(resolve(outputDirectory, "server"), { recursive: true });
        writeFileSync(workerPath, workerSource.trimStart(), "utf8");
      },
    },
  ],
  base: "./",
  worker: {
    format: "es",
  },
});
