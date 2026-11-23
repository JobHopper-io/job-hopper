import assert from "node:assert/strict";
import { buildPayload } from "./src/index.mjs";

const msg = { from: "envelope@ex.com", headers: new Map([["subject", "hdr subj"]]) };

// Prefers parsed header From + parsed subject/text.
let p = buildPayload(
  { from: { address: "human@partner.edu" }, subject: "Re: partnership", text: "yes let's talk" },
  msg,
);
assert.equal(p.fromEmail, "human@partner.edu");
assert.equal(p.subject, "Re: partnership");
assert.equal(p.body, "yes let's talk");

// Falls back to envelope sender, header subject, and html body.
p = buildPayload({ from: null, subject: null, text: null, html: "<p>hi</p>" }, msg);
assert.equal(p.fromEmail, "envelope@ex.com");
assert.equal(p.subject, "hdr subj");
assert.equal(p.body, "<p>hi</p>");

assert.ok(!Number.isNaN(Date.parse(p.receivedAt)));

// Message-ID: parsed first, then the raw header, else null.
assert.equal(buildPayload({ messageId: "<a1@mail.x>" }, msg).messageId, "<a1@mail.x>");
assert.equal(buildPayload({}, { from: "e@x.com", headers: new Map([["message-id", "<h2@mail.x>"]]) }).messageId, "<h2@mail.x>");
assert.equal(buildPayload({}, msg).messageId, null);
console.log("ok");
