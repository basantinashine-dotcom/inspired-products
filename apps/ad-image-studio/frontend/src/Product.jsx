import { useEffect, useState } from "react";

import {
  characters,
  DISCLAIMER_MAX,
  HEADLINE_MAX,
  SHAPES,
  sharpShapes,
  textProblem,
} from "./amazonSpec.js";
import { supabase } from "./supabase.js";

// One product photo: which ad shapes it can fill, its disclaimer, and the
// ads made from it. Step 4 adds the editor that crops each ad's image.
export default function Product({ product, photoUrl, onBack }) {
  const [disclaimer, setDisclaimer] = useState(product.disclaimer ?? "");
  const [savedDisclaimer, setSavedDisclaimer] = useState(product.disclaimer ?? "");
  const [ads, setAds] = useState(null);
  const [error, setError] = useState("");
  const sharp = sharpShapes({ width: product.photo_width, height: product.photo_height });

  useEffect(() => {
    supabase
      .from("variants")
      .select("id, headline")
      .eq("product_id", product.id)
      .order("created_at")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setAds(data);
      });
  }, [product.id]);

  async function saveDisclaimer() {
    setError("");
    // Stored trimmed, and empty means "none": the database refuses blanks.
    const value = disclaimer.trim() || null;
    const { error } = await supabase
      .from("products")
      .update({ disclaimer: value })
      .eq("id", product.id);
    if (error) {
      setError(error.message);
      return;
    }
    setDisclaimer(value ?? "");
    setSavedDisclaimer(value ?? "");
  }

  async function newAd() {
    setError("");
    const { data, error } = await supabase
      .from("variants")
      .insert({ product_id: product.id })
      .select("id, headline")
      .single();
    if (error) setError(error.message);
    else setAds((current) => [...current, data]);
  }

  async function saveHeadline(ad, text) {
    setError("");
    const headline = text.trim() || null;
    const { error } = await supabase.from("variants").update({ headline }).eq("id", ad.id);
    if (error) {
      setError(error.message);
      return false;
    }
    setAds((current) => current.map((a) => (a.id === ad.id ? { ...a, headline } : a)));
    return true;
  }

  async function deleteAd(ad) {
    if (!window.confirm("Delete this ad?")) return;
    setError("");
    const { error } = await supabase.from("variants").delete().eq("id", ad.id);
    if (error) setError(error.message);
    else setAds((current) => current.filter((a) => a.id !== ad.id));
  }

  const disclaimerProblem = textProblem(disclaimer, DISCLAIMER_MAX);

  return (
    <main className="wide">
      <button className="link" onClick={onBack}>
        ← Back to campaign
      </button>
      <h1>{product.name}</h1>
      {error && <p className="error">{error}</p>}

      <div className="product-layout">
        <div>
          <div className="thumb large">
            {photoUrl && <img src={photoUrl} alt={product.name} />}
          </div>
          <p className="muted">
            {product.photo_width}×{product.photo_height} px
          </p>
        </div>

        <div className="stack wide-gap">
          <section className="panel">
            <strong>Ad shapes</strong>
            <p className="muted">
              Amazon asks for each ad in up to three shapes. A shape is sharp
              when the photo has enough pixels to fill it without enlarging.
            </p>
            <ul className="shapes">
              {SHAPES.map((shape) => (
                <li key={shape.key}>
                  <span
                    className="shape-icon"
                    style={{ aspectRatio: `${shape.width} / ${shape.height}` }}
                  />
                  <span>
                    {shape.label} {shape.width}×{shape.height}
                  </span>
                  {sharp.includes(shape) ? (
                    <span className="ok">Sharp</span>
                  ) : (
                    <span className="warn">Will be blurry</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel stack">
            <label htmlFor="disclaimer">
              <strong>Disclaimer</strong>{" "}
              <span className="muted">only if your product legally needs one</span>
            </label>
            <div className="row tight">
              <input
                id="disclaimer"
                value={disclaimer}
                placeholder="e.g. Results may vary."
                onChange={(event) => setDisclaimer(event.target.value)}
              />
              <Counter text={disclaimer} max={DISCLAIMER_MAX} />
              <button
                onClick={saveDisclaimer}
                disabled={Boolean(disclaimerProblem) || disclaimer.trim() === savedDisclaimer}
              >
                Save
              </button>
            </div>
            {disclaimerProblem && <p className="error">{disclaimerProblem}</p>}
          </section>

          <section className="panel stack">
            <div className="bar">
              <strong>Ads</strong>
              <button onClick={newAd} disabled={ads === null}>
                New ad
              </button>
            </div>
            <p className="muted">
              The headline is shown beside the image, never on it. Optional,
              up to {HEADLINE_MAX} characters.
            </p>
            {ads?.length === 0 && <p className="muted">No ads yet.</p>}
            <ol className="ads">
              {ads?.map((ad, index) => (
                <AdRow
                  key={ad.id}
                  ad={ad}
                  number={index + 1}
                  onSave={saveHeadline}
                  onDelete={deleteAd}
                />
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}

function AdRow({ ad, number, onSave, onDelete }) {
  const [draft, setDraft] = useState(ad.headline ?? "");
  const problem = textProblem(draft, HEADLINE_MAX);
  const unchanged = draft.trim() === (ad.headline ?? "");

  async function save(event) {
    event.preventDefault();
    if (await onSave(ad, draft)) setDraft(draft.trim());
  }

  return (
    <li>
      <form className="row tight" onSubmit={save}>
        <span className="muted">Ad {number}</span>
        <input
          aria-label={`Headline for ad ${number}`}
          placeholder="Headline (optional)"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Counter text={draft} max={HEADLINE_MAX} />
        <button type="submit" disabled={Boolean(problem) || unchanged}>
          Save
        </button>
        <button type="button" className="link danger" onClick={() => onDelete(ad)}>
          Delete
        </button>
      </form>
      {problem && <p className="error">{problem}</p>}
    </li>
  );
}

// Counts what will be saved: the trimmed text, an emoji as one.
function Counter({ text, max }) {
  const count = characters(text.trim());
  return (
    <span className={count > max ? "counter error" : "counter muted"}>
      {count}/{max}
    </span>
  );
}
