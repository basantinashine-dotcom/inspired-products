import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_BYTES,
  photoPath,
  photoProblem,
  productName,
} from "../frontend/src/photos.js";

const file = (name, type, size = 1000) => ({ name, type, size });

test("accepts JPEG, PNG and WebP photos", () => {
  assert.equal(photoProblem(file("a.jpg", "image/jpeg")), null);
  assert.equal(photoProblem(file("a.png", "image/png")), null);
  assert.equal(photoProblem(file("a.webp", "image/webp")), null);
});

test("refuses other file types, naming the file", () => {
  assert.match(photoProblem(file("logo.gif", "image/gif")), /^logo\.gif: only JPEG/);
  assert.match(photoProblem(file("brief.pdf", "application/pdf")), /only JPEG/);
  assert.match(photoProblem(file("odd", "constructor")), /only JPEG/);
});

test("refuses photos over 20 MB, and accepts exactly 20 MB", () => {
  assert.equal(photoProblem(file("a.jpg", "image/jpeg", MAX_BYTES)), null);
  assert.match(
    photoProblem(file("huge.jpg", "image/jpeg", MAX_BYTES + 1)),
    /^huge\.jpg: 20\.0 MB is over the 20 MB limit/,
  );
});

test("stores each photo under its owner's folder", () => {
  assert.equal(
    photoPath("user-1", "project-2", "product-3", "image/png"),
    "user-1/project-2/product-3/original.png",
  );
  assert.equal(
    photoPath("u", "p", "x", "image/jpeg"),
    "u/p/x/original.jpg",
  );
});

test("names a product after its file", () => {
  assert.equal(productName("steel-water_bottle.jpg"), "steel water bottle");
  assert.equal(productName("Mug v2.final.PNG"), "Mug v2.final");
  assert.equal(productName(".jpg"), "Product");
  assert.equal(productName(`${"x".repeat(150)}.jpg`).length, 100);
});
