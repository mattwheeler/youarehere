import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

test("server-renders the On Your Behalf mission library", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");

  const html = await response.text();
  assert.match(html, /<title>On Your Behalf — Learn AI by doing it<\/title>/i);
  assert.match(html, /On Your Behalf/);
  assert.match(html, /Learn AI by doing it/);
  assert.match(html, /20 practice missions/);
  assert.match(html, /Cancel a subscription/);
  assert.match(html, /Book a flight/);
  assert.doesNotMatch(html, /Capability map|What are you trying to get done today/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps the starter preview removed from the product shell", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<MissionExperience \/>/);
  assert.match(layout, /On Your Behalf/);
  assert.doesNotMatch(layout, /next\/font\/google|Starter Project/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await Promise.all([
    assert.rejects(
      access(
        new URL(
          "../app/_sites-preview/SkeletonPreview.tsx",
          import.meta.url,
        ),
      ),
    ),
    assert.rejects(
      access(new URL("../app/_sites-preview/preview.css", import.meta.url)),
    ),
  ]);
});
