import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the investor site intelligence workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Alpha Turkistan \| Investment Site Intelligence<\/title>/i);
  assert.match(html, /Find the right place to build\./);
  assert.match(html, /Investment site filters/);
  assert.match(html, /Land &amp; ownership/);
  assert.match(html, /AI classification/);
  assert.match(html, /demonstration dataset/);
  assert.match(html, /TURAN Greenfield/);
  assert.doesNotMatch(html, /codex-preview|loading skeleton|react-loading-skeleton/i);
});

test("includes the map, infrastructure layers and representative site data", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /from "maplibre-gl"/);
  assert.match(page, /tile\.openstreetmap\.org/);
  assert.match(page, /power-lines/);
  assert.match(page, /rail-lines/);
  assert.match(page, /material-zones/);
  assert.match(page, /Municipal reserve · unallocated/);
  assert.match(page, /Private operator · no free parcel/);
  assert.match(page, /Show free land only/);
  assert.match(page, /Compare site/);
  assert.match(layout, /Alpha Turkistan \| Investment Site Intelligence/);
  assert.match(packageJson, /"maplibre-gl": "\^5\.24\.0"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
