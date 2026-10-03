import assert from "node:assert/strict";
import { test } from "node:test";

import {
  characters,
  fitNote,
  logoFileProblem,
  logoSizeProblem,
  sharpShapes,
  textProblem,
} from "../frontend/src/amazonSpec.js";

test("counts an emoji as one character, as Postgres does", () => {
  assert.equal("🙂".length, 2);
  assert.equal(characters("🙂"), 1);
  assert.equal(characters("Café 🙂"), 6);
});

test("headline: up to 50 characters after trimming; empty is fine", () => {
  assert.equal(textProblem("", 50), null);
  assert.equal(textProblem("h".repeat(50), 50), null);
  assert.equal(textProblem(`  ${"h".repeat(50)}  `, 50), null);
  assert.equal(textProblem("🙂".repeat(50), 50), null);
  assert.equal(textProblem("h".repeat(51), 50), "1 character over the 50-character limit.");
  assert.equal(textProblem("h".repeat(53), 50), "3 characters over the 50-character limit.");
});

test("logo file: PNG or JPEG, up to 1,000,000 bytes", () => {
  assert.equal(logoFileProblem({ type: "image/png", size: 1_000_000 }), null);
  assert.equal(logoFileProblem({ type: "image/jpeg", size: 5 }), null);
  assert.match(logoFileProblem({ type: "image/webp", size: 5 }), /PNG or JPEG/);
  assert.match(logoFileProblem({ type: "image/svg+xml", size: 5 }), /PNG or JPEG/);
  assert.equal(
    logoFileProblem({ type: "image/png", size: 1_000_001 }),
    "The logo is 1001 KB; Amazon's limit is 1,000 KB.",
  );
});

test("logo size: at least 600×100", () => {
  assert.equal(logoSizeProblem({ width: 600, height: 100 }), null);
  assert.equal(logoSizeProblem({ width: 1200, height: 300 }), null);
  assert.match(logoSizeProblem({ width: 599, height: 300 }), /^The logo is 599×300 px/);
  assert.match(logoSizeProblem({ width: 800, height: 99 }), /at least 600×100/);
});

const keys = (size) => sharpShapes(size).map((shape) => shape.key);

test("a photo fills a shape sharply only if it has the pixels for it", () => {
  assert.deepEqual(keys({ width: 3000, height: 4000 }), ["square", "tall", "wide"]);
  assert.deepEqual(keys({ width: 1200, height: 1600 }), ["square", "tall", "wide"]);
  assert.deepEqual(keys({ width: 1600, height: 900 }), ["wide"]);
  assert.deepEqual(keys({ width: 1200, height: 1200 }), ["square", "wide"]);
  // Tall needs 900 wide and 1600 high, whatever the photo's own shape.
  assert.deepEqual(keys({ width: 899, height: 5000 }), []);
  assert.deepEqual(keys({ width: 800, height: 600 }), []);
});

test("notes which shapes will be blurry", () => {
  assert.equal(fitNote({ width: 3000, height: 3000 }), null);
  assert.equal(
    fitNote({ width: 1600, height: 900 }),
    "1600×900 px fills Wide sharply; Square and Tall will be blurry.",
  );
  assert.equal(
    fitNote({ width: 1200, height: 1200 }),
    "1200×1200 px fills Square and Wide sharply; Tall will be blurry.",
  );
  assert.equal(
    fitNote({ width: 800, height: 600 }),
    "800×600 px is too small to fill any ad shape sharply.",
  );
});
