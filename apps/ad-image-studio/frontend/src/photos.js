// Rules for product photos. No React or Supabase, so all but readSize can
// be tested on their own (tests/photos.test.mjs).

// File type -> extension used in storage. Matches the drafts bucket's
// allowed types; the bucket refuses anything else even if this list drifts.
export const ACCEPTED_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Matches the drafts bucket's file size limit.
export const MAX_BYTES = 20 * 1024 * 1024;

// Why this file cannot be used, or null if it can.
export function photoProblem(file) {
  if (!Object.hasOwn(ACCEPTED_TYPES, file.type)) {
    return `${file.name}: only JPEG, PNG or WebP photos can be used.`;
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `${file.name}: ${mb} MB is over the 20 MB limit.`;
  }
  return null;
}

// Where a photo lives in the drafts bucket. The first folder must be the
// owner's user id: that is what the storage rules check.
export function photoPath(userId, projectId, productId, type) {
  return `${userId}/${projectId}/${productId}/original.${ACCEPTED_TYPES[type]}`;
}

// A starting name from the file name: "steel-water_bottle.jpg" ->
// "steel water bottle".
export function productName(fileName) {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return (base || "Product").slice(0, 100);
}

// The browser decodes the image locally to read its size before uploading.
export async function readSize(file) {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
