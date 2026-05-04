import test from "node:test";
import assert from "node:assert/strict";

import { buildGoogleAuthRedirect, getInviteTokenFromUrl } from "../src/authRedirect.ts";

test("preserva query params al construir redirect de OAuth", () => {
  const url = new URL("https://balancediario.web.app/?invite=abc123&foo=bar");

  assert.equal(
    buildGoogleAuthRedirect(url),
    "https://balancediario.web.app/?invite=abc123&foo=bar",
  );
});

test("extrae invite token de la URL cuando existe", () => {
  const url = new URL("https://balancediario.web.app/?invite=abc123");

  assert.equal(getInviteTokenFromUrl(url), "abc123");
});

test("devuelve null cuando no hay invite token", () => {
  const url = new URL("https://balancediario.web.app/");

  assert.equal(getInviteTokenFromUrl(url), null);
});
