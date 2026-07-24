const worker = (await import("../dist/server/index.js")).default;
const origin = "https://sites-verification.invalid";

async function expectResponse(pathname, expectedType) {
  const response = await worker.fetch(new Request(`${origin}${pathname}`));
  if (response.status !== 200) {
    throw new Error(`${pathname} returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith(expectedType)) {
    throw new Error(
      `${pathname} returned ${contentType || "no content type"}; expected ${expectedType}`,
    );
  }

  return response;
}

const root = await expectResponse("/", "text/html");
const html = await root.text();
const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(
  (match) => new URL(match[1], `${origin}/`).pathname,
);

if (assetPaths.length === 0) {
  throw new Error("The generated index did not reference any client assets.");
}

for (const pathname of assetPaths) {
  const expectedType = pathname.endsWith(".css")
    ? "text/css"
    : "text/javascript";
  await expectResponse(pathname, expectedType);
}

await expectResponse("/pcm-processor.js", "text/javascript");

const missing = await worker.fetch(new Request(`${origin}/missing.js`));
if (missing.status !== 404) {
  throw new Error(`/missing.js returned HTTP ${missing.status}; expected 404`);
}

console.log(
  `Sites worker verified: /, ${assetPaths.join(", ")}, /pcm-processor.js`,
);
