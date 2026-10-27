import { test } from "node:test";
import assert from "node:assert/strict";
import { xProfileUrl } from "../lib/site-links.mjs";
import { rpcFailureMessage } from "../lib/http.mjs";
test("header accepts only an exact HTTPS X profile, never another destination", () => {
  assert.equal(xProfileUrl("https://twitter.com/enigma_test/"), "https://x.com/enigma_test");
  for (const value of [undefined, "", "https://x.com/home", "https://x.com/intent/tweet", "https://x.com/user/status/123", "https://x.com.evil.example/user", "https://user:password@x.com/user", "http://x.com/user", "https://x.com/user?next=other", "javascript:alert(1)"])
    assert.equal(xProfileUrl(value), null);
});
test("a failed public read or rejected preparation cannot imply a saved or submitted payment", () => {
  assert.doesNotMatch(rpcFailureMessage("getBalance"), /saved|submitted|transaction/i);
  assert.match(rpcFailureMessage("sendTransaction", false), /Nothing was submitted/);
  assert.match(rpcFailureMessage("simulateTransaction"), /Nothing was submitted/);
  assert.match(rpcFailureMessage("sendTransaction"), /Check the saved transaction/);
  assert.match(rpcFailureMessage("sendTransaction", false, true), /deployment and verification/);
});
