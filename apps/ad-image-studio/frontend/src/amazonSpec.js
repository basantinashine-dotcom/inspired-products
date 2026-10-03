// The ad slot this studio builds for (Step 3): Amazon DSP's responsive
// eCommerce creative. Amazon lays each ad out itself from a custom image
// plus separate headline, logo and disclaimer fields, so none of those are
// ever drawn onto the image.
//
// The figures come from search summaries of Amazon's spec pages; check them
// at https://advertising.amazon.com/resources/ad-specs/ecommerce. The
// database repeats the text and logo limits as checks.

// The three custom image shapes Amazon recommends supplying for each ad.
export const SHAPES = [
  { key: "square", label: "Square", width: 1200, height: 1200 },
  { key: "tall", label: "Tall", width: 900, height: 1600 },
  { key: "wide", label: "Wide", width: 1200, height: 628 },
];

// Both optional.
export const HEADLINE_MAX = 50;
export const DISCLAIMER_MAX = 60;

// "1 MB" read as 1,000,000 bytes, the stricter reading.
export const LOGO = {
  minWidth: 600,
  minHeight: 100,
  maxBytes: 1_000_000,
  types: { "image/png": "png", "image/jpeg": "jpg" },
};

// Characters as a reader (and Postgres) counts them. JavaScript's .length
// counts an emoji as two; spreading the string counts it once.
export function characters(text) {
  return [...text].length;
}

// Why this headline or disclaimer cannot be saved, or null. It is saved
// trimmed, so that is what gets counted. Empty is fine: both are optional.
export function textProblem(text, max) {
  const over = characters(text.trim()) - max;
  if (over <= 0) return null;
  return `${over} character${over === 1 ? "" : "s"} over the ${max}-character limit.`;
}

// Why this file cannot be a logo, judged before it is even opened.
export function logoFileProblem(file) {
  if (!Object.hasOwn(LOGO.types, file.type)) {
    return "The logo must be a PNG or JPEG.";
  }
  if (file.size > LOGO.maxBytes) {
    const kb = Math.ceil(file.size / 1000);
    return `The logo is ${kb} KB; Amazon's limit is 1,000 KB.`;
  }
  return null;
}

// Why a logo of this size cannot be used, or null.
export function logoSizeProblem({ width, height }) {
  if (width >= LOGO.minWidth && height >= LOGO.minHeight) return null;
  return (
    `The logo is ${width}×${height} px; ` +
    `Amazon needs at least ${LOGO.minWidth}×${LOGO.minHeight} px.`
  );
}

// The shapes a photo can fill without being enlarged. Cropped to a shape's
// proportions, the photo must still have at least that shape's pixels:
// the smaller of the two ratios decides.
export function sharpShapes({ width, height }) {
  return SHAPES.filter(
    (shape) => Math.min(width / shape.width, height / shape.height) >= 1,
  );
}

// A note for a photo too small to fill every shape sharply, or null.
export function fitNote(size) {
  const sharp = sharpShapes(size);
  if (sharp.length === SHAPES.length) return null;
  const blurry = SHAPES.filter((shape) => !sharp.includes(shape));
  const dims = `${size.width}×${size.height} px`;
  if (sharp.length === 0) {
    return `${dims} is too small to fill any ad shape sharply.`;
  }
  return `${dims} fills ${names(sharp)} sharply; ${names(blurry)} will be blurry.`;
}

function names(shapes) {
  const labels = shapes.map((shape) => shape.label);
  return labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}
