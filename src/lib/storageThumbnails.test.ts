import test from "node:test";
import assert from "node:assert/strict";
import { storageThumbnailUrl } from "./storageThumbnails";

const OBJECT_URL =
  "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/object/public/generated-images/org/abc.png";

test("rewrites a public storage object URL to a sized webp rendition", () => {
  assert.equal(
    storageThumbnailUrl(OBJECT_URL, { width: 500, quality: 75 }),
    "https://likkskifwsrvszxdvufw.supabase.co/storage/v1/render/image/public/generated-images/org/abc.png?width=500&quality=75&format=webp&resize=contain",
  );
});

test("defaults to 500px webp at quality 75", () => {
  assert.match(storageThumbnailUrl(OBJECT_URL), /\?width=500&quality=75&format=webp&resize=contain$/);
});

test("leaves non-Supabase URLs untouched", () => {
  for (const url of [
    "https://cdn.shopify.com/s/files/1/0/product.jpg",
    "https://cdn.sanity.io/images/abc/production/x-2080x2288.png",
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:http://localhost:5180/9f2c",
  ]) {
    assert.equal(storageThumbnailUrl(url), url);
  }
});

test("does not double-transform a render URL", () => {
  const rendered = storageThumbnailUrl(OBJECT_URL);
  assert.equal(storageThumbnailUrl(rendered), rendered);
});

test("leaves URLs that already carry a query string alone", () => {
  const signed = `${OBJECT_URL}?token=abc`;
  assert.equal(storageThumbnailUrl(signed), signed);
});

test("returns an empty string for missing input", () => {
  assert.equal(storageThumbnailUrl(null), "");
  assert.equal(storageThumbnailUrl(undefined), "");
});

test("ignores a nonsensical width rather than emitting a broken URL", () => {
  assert.equal(storageThumbnailUrl(OBJECT_URL, { width: 0 }), OBJECT_URL);
  assert.equal(storageThumbnailUrl(OBJECT_URL, { width: Number.NaN }), OBJECT_URL);
});
