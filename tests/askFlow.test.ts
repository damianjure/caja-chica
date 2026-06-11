import test from "node:test";
import assert from "node:assert/strict";

import { runAskFlow } from "../src/flows/ask.ts";
import { FakeChannel, fakeIncoming } from "../src/channels/fake.ts";

function fakeSupabase() {
  const builder: any = {
    select: () => builder,
    is: () => builder,
    eq: () => builder,
    order: () => builder,
    range: () => Promise.resolve({ data: [], error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
  };
  return { from: () => builder } as any;
}

function fakeGenAI(text: string) {
  return {
    models: { async generateContent() { return { text }; } },
  } as any;
}

const identityScope = (q: any) => q;

test("runAskFlow: typing + responde la respuesta del agente", async () => {
  const ch = new FakeChannel(fakeIncoming({ text: "cuánto gasté" }));
  await runAskFlow(
    ch,
    { supabase: fakeSupabase(), genAI: fakeGenAI('{"answer": "Gastaste $8.000 este mes."}') },
    identityScope,
    "¿cuánto gasté este mes?",
  );
  assert.equal(ch.outbound[0].kind, "typing");
  const last = ch.last();
  assert.equal(last?.kind, "text");
  assert.equal(last && last.kind === "text" && last.text, "Gastaste $8.000 este mes.");
});

test("runAskFlow: respuesta no parseable → fallback del agente, igual contesta", async () => {
  const ch = new FakeChannel(fakeIncoming());
  await runAskFlow(
    ch,
    { supabase: fakeSupabase(), genAI: fakeGenAI("esto no es json") },
    identityScope,
    "qué onda",
  );
  const texts = ch.ofKind("text");
  assert.equal(texts.length, 1);
  assert.match(texts[0].text, /No pude resolver|reformul/i);
});

test("runAskFlow: error de datos → mensaje de error amable", async () => {
  const brokenSupabase: any = {
    from: () => ({
      select: () => ({ is: () => ({ order: () => ({ range: () => Promise.reject(new Error("boom")) }) }) }),
    }),
  };
  const ch = new FakeChannel(fakeIncoming());
  await runAskFlow(ch, { supabase: brokenSupabase, genAI: fakeGenAI("{}") }, identityScope, "x");
  const last = ch.last();
  assert.equal(last?.kind, "text");
  assert.match(last && last.kind === "text" ? last.text : "", /No pude responder/);
});
