import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { parseStaticQris, qrisCrc } from "./qris.ts";
import { inspectQrisImage, renderQris } from "./qris-image.ts";
import { MAX_UPLOAD_BYTES } from "./upload-limits.ts";

// Fictional structural fixture only. No issuer account is supplied, NMID is all
// zeroes, and no artifact is published or sent to a payment provider.
const MERCHANT = "LARIS TEST ONLY";
function tlv(tag: string, value: string): string {
  assert.ok(/^\d{2}$/.test(tag)); assert.ok(value.length <= 99);
  return tag + String(value.length).padStart(2, "0") + value;
}
function checksum(body: string): string {
  const prefix = body + "6304";
  return prefix + qrisCrc(prefix);
}
function fixture(overrides: Record<string, string | null> = {}, suffix = ""): string {
  const values: Record<string, string> = {
    "00": "01", "01": "11",
    "51": tlv("00", "ID.CO.QRIS.WWW") + tlv("02", "ID0000000000000") + tlv("03", "UMI"),
    "52": "5812", "53": "360", "58": "ID", "59": MERCHANT, "60": "TEST CITY",
  };
  for (const [tag, value] of Object.entries(overrides)) {
    if (value === null) delete values[tag]; else values[tag] = value;
  }
  // Numeric-like object keys otherwise sort ahead of the required leading 00.
  const tags = Object.keys(values).sort((a, b) => Number(a) - Number(b));
  return checksum(tags.map(tag => tlv(tag, values[tag])).join("") + suffix);
}
const PAYLOAD = fixture();
async function png(payload = PAYLOAD): Promise<Buffer> {
  return QRCode.toBuffer(payload, { type: "png", errorCorrectionLevel: "M", width: 768, margin: 4 });
}
async function decodedImage(dataUrl: string): Promise<string> {
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const { data, info } = await sharp(Buffer.from(dataUrl.split(",")[1], "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
  assert.ok(decoded, "Canonical image must still decode");
  return decoded.data;
}

test("QRIS CRC matches the independent CCITT-FALSE check vector", () => {
  assert.equal(qrisCrc("123456789"), "29B1");
  assert.equal(qrisCrc(""), "FFFF");
});

test("static QRIS parsing retains the exact recipient payload and merchant labels", () => {
  assert.deepEqual(parseStaticQris(PAYLOAD), { merchantName: MERCHANT, merchantCity: "TEST CITY", payload: PAYLOAD });
  const withoutOptionalInitiation = fixture({ "01": null });
  assert.equal(parseStaticQris(withoutOptionalInitiation).payload, withoutOptionalInitiation);
});

test("QRIS rejects corrupted checksum and invalid framing", () => {
  for (const value of ["", "https://example.invalid/pay", PAYLOAD.replace(MERCHANT, "LARIS FAKE ONLY"), PAYLOAD.slice(0, -1), PAYLOAD + "0000", PAYLOAD + "\n", "x".repeat(4097)]) {
    assert.throws(() => parseStaticQris(value));
  }
});

test("QRIS rejects malformed or duplicate TLV fields even with a valid checksum", () => {
  const body = PAYLOAD.slice(0, -8);
  for (const value of [
    checksum(body + "AA01x"), checksum(body + "6100"), checksum(body + "6199x"),
    checksum(body + tlv("59", "SECOND NAME")), checksum(body + tlv("63", "0000")),
    fixture({ "51": tlv("00", "ID.CO.QRIS.WWW") + tlv("00", "ID.CO.QRIS.WWW") }),
    fixture({ "51": tlv("00", "ID.CO.QRIS.WWW") + "0299x" }),
  ]) assert.throws(() => parseStaticQris(value));
});

test("QRIS rejects dynamic, fixed-amount and surcharge payloads", () => {
  for (const value of [
    fixture({ "01": "12" }), fixture({ "01": "00" }),
    fixture({ "54": "10000" }), fixture({ "54": "0" }),
    fixture({ "55": "01" }), fixture({ "56": "100" }), fixture({ "57": "5" }),
  ]) assert.throws(() => parseStaticQris(value));
});

test("QRIS rejects non-Indonesian, non-IDR and incomplete merchant details", () => {
  const invalidChanges: Array<Record<string, string | null>> = [
    { "53": "840" }, { "58": "SG" }, { "51": null },
    { "51": tlv("00", "EXAMPLE.INVALID") }, { "52": "58xx" }, { "52": null },
    { "59": " " }, { "59": "X".repeat(26) }, { "59": null },
    { "60": " " }, { "60": "X".repeat(16) }, { "60": null },
  ];
  for (const change of invalidChanges) assert.throws(() => parseStaticQris(fixture(change)));
});

test("QRIS renderer round-trips the original payload without adding a payment amount", async () => {
  const image = await renderQris(PAYLOAD);
  assert.equal(await decodedImage(image), PAYLOAD);
  assert.ok(image.length < 300_000, "Canonical image must fit the database bound");
  await assert.rejects(renderQris(fixture({ "01": "12" })));
});

test("QRIS image inspection decodes PNG, JPEG and WebP and re-renders the same recipient", async t => {
  const original = await png();
  for (const [mime, bytes] of [
    ["image/png", original],
    ["image/jpeg", await sharp(original).jpeg({ quality: 95 }).toBuffer()],
    ["image/webp", await sharp(original).webp({ lossless: true }).toBuffer()],
  ] as const) {
    await t.test(mime, async () => {
      const preview = await inspectQrisImage(bytes, mime);
      assert.equal(preview.merchantName, MERCHANT); assert.equal(preview.merchantCity, "TEST CITY");
      assert.equal(preview.payload, PAYLOAD); assert.equal(await decodedImage(preview.imageDataUrl), PAYLOAD);
    });
  }
});

test("QRIS image inspection handles rotated merchant images", async () => {
  const rotated = await sharp(await png()).rotate(90).png().toBuffer();
  assert.equal((await inspectQrisImage(rotated, "image/png")).payload, PAYLOAD);
});

test("QRIS image inspection rejects incorrect media types, broken images and excessive bytes", async () => {
  const original = await png();
  await assert.rejects(inspectQrisImage(original, "image/jpeg"), /format/);
  await assert.rejects(inspectQrisImage(original, "image/svg+xml"), /format/);
  await assert.rejects(inspectQrisImage(Buffer.from("not an image"), "image/png"), /rusak|dibaca/);
  await assert.rejects(inspectQrisImage(new Uint8Array(), "image/png"), /maksimal/);
  await assert.rejects(inspectQrisImage(new Uint8Array(MAX_UPLOAD_BYTES + 1), "image/png"), /maksimal/);
});

test("QRIS image inspection rejects ordinary images and unrelated QR codes", async () => {
  const ordinary = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(inspectQrisImage(ordinary, "image/png"), /tidak terbaca/);
  await assert.rejects(inspectQrisImage(await png("https://example.invalid/not-a-payment"), "image/png"));
  await assert.rejects(inspectQrisImage(await png(fixture({ "01": "12" })), "image/png"), /dinamis/);
});

test("QRIS image inspection rejects decompression-sized pixel dimensions", async () => {
  const oversizedPixels = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
  assert.ok(oversizedPixels.length < MAX_UPLOAD_BYTES);
  await assert.rejects(inspectQrisImage(oversizedPixels, "image/png"));
});

test("QRIS image inspection rejects a merchant image containing two readable QR codes", async () => {
  const first = await QRCode.toBuffer(PAYLOAD, { width: 512, margin: 4 });
  const second = await QRCode.toBuffer(fixture({ "59": "SECOND TEST ONLY" }), { width: 300, margin: 4 });
  const combined = await sharp({ create: { width: 1100, height: 1000, channels: 3, background: "white" } })
    .composite([{ input: first, left: 20, top: 20 }, { input: second, left: 700, top: 650 }]).png().toBuffer();
  await assert.rejects(inspectQrisImage(combined, "image/png"), /lebih dari satu QR/);
});
