import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

// Start the Admin dev server with https://catalogue-fixture.supabase.co as its Supabase URL.
const playwrightPath = process.env.SORA_PLAYWRIGHT_MODULE;
if (!playwrightPath) throw new Error("Set SORA_PLAYWRIGHT_MODULE to the local Playwright Core index.mjs path.");
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const origin = process.env.SORA_CATALOGUE_TEST_URL ?? "http://127.0.0.1:3148";
const user = { id: "10000000-0000-4000-8000-000000000001", email: "staff@example.test", app_metadata: {}, user_metadata: {} };
const claims = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
const groups = Array.from({ length: 26 }, (_, i) => ({
  kind: "group", id: String(i + 1), title: i === 0 ? "Example Series" : `Standalone ${i}`,
  author: "Test Author", cover: null, volumes: i === 0 ? 3 : 1, copies: 3, statuses: { "In-Shelf": 3 },
}));
const copy = { kind: "copy", id: "14", copy_id: 14, copy_number: 1, book_id: 1, barcode: "COPY-123",
  title: "Example Series, Vol. 1", author: "Test Author", volume: 1, copy_status: "In-Shelf", shelf_location: "Shelf A2", condition_notes: "Scuffed cover" };

try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const requests = [];
    const pageErrors = [];
    await context.addInitScript(({ user, claims }) => {
      localStorage.setItem("sb-catalogue-fixture-auth-token", JSON.stringify({
        access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${claims}.bW9jaw`, refresh_token: "mock",
        expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user,
      }));
    }, { user, claims });
    await context.route("https://catalogue-fixture.supabase.co/**", async route => {
      const request = route.request();
      const key = new URL(request.url()).pathname.split("/").at(-1);
      let response = [];
      if (key === "is_librarian") response = true;
      if (key === "admin_catalogue_summary") response = { titles: 26, volumes: 28, copies: 78, damaged: 0, returns: 0, unregistered: 0, genres: ["Adventure"], shelves: ["Shelf A2"] };
      if (key === "admin_catalogue_page") {
        const params = request.postDataJSON();
        requests.push(params);
        const rows = params.p_view === "inventory" ? [copy] : params.p_query ? [groups[0]] : groups;
        const start = (params.p_page - 1) * params.p_size;
        response = { count: rows.length, rows: rows.slice(start, start + params.p_size) };
      }
      if (key === "admin_catalogue_volumes") {
        const { p_group } = request.postDataJSON();
        const selected = groups.find(group => group.id === p_group);
        response = { count: selected.volumes, rows: Array.from({ length: selected.volumes }, (_, i) => ({
          book_id: Number(p_group) * 10 + i, title: selected.volumes > 1 ? `${selected.title}, Vol. ${i + 1}` : selected.title,
          display_volume: i + 1, copies: 1, reads: 0, book_genre: "Adventure", authors: { author_firstname: "Test", author_lastname: "Author" },
        })) };
      }
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "content-range": "0-0/0" }, body: JSON.stringify(response) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(origin);
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.getByRole("button", { name: "Book Management", exact: true }).click();
    const table = page.getByRole("table");
    const title = table.getByRole("button", { name: /Example Series/ });
    await title.waitFor();
    assert.equal(await table.locator("tbody tr").count(), 25);
    await title.focus();
    const scrollPosition = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Example Series" });
    await drawer.getByRole("button", { name: /Vol\. 3/ }).waitFor();
    assert.equal(await page.evaluate(() => window.scrollY), scrollPosition);
    assert.equal(await drawer.evaluate(node => node.matches(":modal")), width < 768);
    if (width >= 768) {
      await table.getByRole("button", { name: /Standalone 1 Test Author/ }).click();
      await page.getByRole("dialog", { name: "Standalone 1", exact: true }).getByRole("button", { name: "Edit volume" }).waitFor();
      assert.equal(await page.getByRole("dialog").count(), 1);
    }
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.closest("table") !== null);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await table.getByRole("button", { name: /Standalone 25/ }).waitFor();
    const search = page.getByRole("textbox", { name: "Search books and copies" });
    await search.fill("ISBN-EXAMPLE");
    await title.waitFor();
    assert.equal(requests.at(-1).p_page, 1);
    assert.equal(requests.at(-1).p_query, "ISBN-EXAMPLE");
    await title.click();
    await drawer.getByRole("button", { name: "Close title details" }).click();
    assert.equal(await search.inputValue(), "ISBN-EXAMPLE");
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("button", { name: "Physical Inventory", exact: true }).click();
    await table.getByText("Scuffed cover").waitFor();
    await table.getByText("In Shelf", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
  console.log("Catalog browser checks passed on desktop and mobile.");
} finally {
  await browser.close();
}
