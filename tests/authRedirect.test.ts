import test from "node:test";
import assert from "node:assert/strict";

import { buildGoogleAuthRedirect, getInviteTokenFromUrl, getLoginErrorFromUrl, stripLoginErrorFromUrl } from "../src/authRedirect.ts";

test("preserva query params al construir redirect de OAuth", () => {
  const url = new URL("https://caja-chica-bot.web.app/?invite=abc123&foo=bar");

  assert.equal(
    buildGoogleAuthRedirect(url),
    "https://caja-chica-bot.web.app/?invite=abc123&foo=bar",
  );
});

test("extrae invite token de la URL cuando existe", () => {
  const url = new URL("https://caja-chica-bot.web.app/?invite=abc123");

  assert.equal(getInviteTokenFromUrl(url), "abc123");
});

test("devuelve null cuando no hay invite token", () => {
  const url = new URL("https://caja-chica-bot.web.app/");

  assert.equal(getInviteTokenFromUrl(url), null);
});


test("extrae invite token legacy desde /join?token", () => {
  const url = new URL("https://caja-chica-bot.web.app/join?token=legacy123");
  assert.equal(getInviteTokenFromUrl(url), "legacy123");
});

// ---------------------------------------------------------------------------
// Login rejected by the auth hook — Supabase sends the reason back in the URL
// ---------------------------------------------------------------------------

const NOT_INVITED = "Tu email no está autorizado. Pedile una invitación al administrador.";

test("getLoginErrorFromUrl: reads the hook rejection from the hash (implicit flow)", () => {
  const url = new URL(
    "https://caja-chica-bot.web.app/#error=access_denied&error_code=403&error_description=" +
      encodeURIComponent(NOT_INVITED),
  );
  assert.equal(getLoginErrorFromUrl(url), NOT_INVITED);
});

test("getLoginErrorFromUrl: reads the hook rejection from the query (PKCE flow)", () => {
  const url = new URL(
    "https://caja-chica-bot.web.app/?error=access_denied&error_description=" + encodeURIComponent(NOT_INVITED),
  );
  assert.equal(getLoginErrorFromUrl(url), NOT_INVITED);
});

test("getLoginErrorFromUrl: unknown provider errors get a generic Spanish message, never raw text", () => {
  const url = new URL("https://caja-chica-bot.web.app/#error=server_error&error_description=Unexpected+failure");
  assert.equal(getLoginErrorFromUrl(url), "No se pudo iniciar sesión. Probá de nuevo en unos minutos.");
});

test("getLoginErrorFromUrl: no error params → null", () => {
  assert.equal(getLoginErrorFromUrl(new URL("https://caja-chica-bot.web.app/?invite=abc")), null);
});

test("stripLoginErrorFromUrl: removes only the error params and keeps the rest", () => {
  const url = new URL(
    "https://caja-chica-bot.web.app/app?invite=abc#error=access_denied&error_code=403&error_description=x",
  );
  assert.equal(stripLoginErrorFromUrl(url), "https://caja-chica-bot.web.app/app?invite=abc");
  const query = new URL("https://caja-chica-bot.web.app/?error=access_denied&error_description=x&invite=abc");
  assert.equal(stripLoginErrorFromUrl(query), "https://caja-chica-bot.web.app/?invite=abc");
});
