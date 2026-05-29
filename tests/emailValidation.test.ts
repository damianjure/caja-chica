import test from "node:test";
import assert from "node:assert/strict";

// -----------------------------------------------------------------------
// P2-T10: RED tests for parseEmailSettingsRequest + parseTestSendRequest
// (REQ-S1.5, REQ-S3.2)
// -----------------------------------------------------------------------

test("parseEmailSettingsRequest: valid body returns {from_email, from_name}", async () => {
  const { parseEmailSettingsRequest } = await import("../src/server/validation.ts");

  const result = parseEmailSettingsRequest({ from_email: "sender@example.com", from_name: "My Sender" });
  assert.ok(result !== null, "Should return a non-null result for valid body");
  assert.equal(result!.from_email, "sender@example.com");
  assert.equal(result!.from_name, "My Sender");
});

test("parseEmailSettingsRequest: missing from_email returns null", async () => {
  const { parseEmailSettingsRequest } = await import("../src/server/validation.ts");

  const result = parseEmailSettingsRequest({ from_name: "My Sender" });
  assert.equal(result, null, "Should return null when from_email is missing");
});

test("parseEmailSettingsRequest: missing from_name returns null", async () => {
  const { parseEmailSettingsRequest } = await import("../src/server/validation.ts");

  const result = parseEmailSettingsRequest({ from_email: "sender@example.com" });
  assert.equal(result, null, "Should return null when from_name is missing");
});

test("parseEmailSettingsRequest: non-email from_email returns null", async () => {
  const { parseEmailSettingsRequest } = await import("../src/server/validation.ts");

  const result = parseEmailSettingsRequest({ from_email: "not-an-email", from_name: "My Sender" });
  assert.equal(result, null, "Should return null when from_email is not an email");
});

test("parseTestSendRequest: valid email returns {to}", async () => {
  const { parseTestSendRequest } = await import("../src/server/validation.ts");

  const result = parseTestSendRequest({ to: "recipient@example.com" });
  assert.ok(result !== null, "Should return non-null result for valid email");
  assert.equal(result!.to, "recipient@example.com");
});

test("parseTestSendRequest: invalid email shape returns null", async () => {
  const { parseTestSendRequest } = await import("../src/server/validation.ts");

  const result = parseTestSendRequest({ to: "not-an-email" });
  assert.equal(result, null, "Should return null for invalid email");
});

test("parseTestSendRequest: missing to field returns null", async () => {
  const { parseTestSendRequest } = await import("../src/server/validation.ts");

  const result = parseTestSendRequest({});
  assert.equal(result, null, "Should return null when to field is missing");
});

test("parseTestSendRequest: non-object input returns null", async () => {
  const { parseTestSendRequest } = await import("../src/server/validation.ts");

  const result = parseTestSendRequest("not-an-object");
  assert.equal(result, null, "Should return null for non-object input");
});
