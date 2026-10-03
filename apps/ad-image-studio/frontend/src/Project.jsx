import { useEffect, useRef, useState } from "react";

import {
  ACCEPTED_TYPES,
  photoPath,
  photoProblem,
  productName,
  sizeWarning,
} from "./photos.js";
import { supabase } from "./supabase.js";

const COLUMNS = "id, name, photo_path, photo_width, photo_height";
const drafts = () => supabase.storage.from("drafts");

// One campaign: its product photos, and adding or removing them.
export default function Project({ project, session, onBack }) {
  const [products, setProducts] = useState(null);
  const [thumbs, setThumbs] = useState({});
  const [progress, setProgress] = useState("");
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState("");
  const picker = useRef(null);

  useEffect(() => {
    supabase
      .from("products")
      .select(COLUMNS)
      .eq("project_id", project.id)
      .order("created_at")
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
          return;
        }
        setProducts(data);
        showThumbs(data);
      });
  }, [project.id]);

  // The bucket is private, so an <img> cannot load a photo by its path.
  // A signed URL is a temporary link (here, one hour) that works without
  // signing in, issued only to someone the storage rules let read the file.
  async function showThumbs(rows) {
    if (rows.length === 0) return;
    const { data, error } = await drafts().createSignedUrls(
      rows.map((row) => row.photo_path),
      60 * 60,
    );
    if (error) {
      setError(error.message);
      return;
    }
    setThumbs((current) => {
      const next = { ...current };
      for (const item of data) if (item.signedUrl) next[item.path] = item.signedUrl;
      return next;
    });
  }

  async function addPhotos(files) {
    setError("");
    const added = [];
    const found = [];

    for (const [index, file] of files.entries()) {
      setProgress(`Uploading ${index + 1} of ${files.length}…`);

      const problem = photoProblem(file);
      if (problem) {
        found.push(problem);
        continue;
      }

      let size;
      try {
        size = await readSize(file);
      } catch {
        found.push(`${file.name}: could not be read as an image.`);
        continue;
      }

      // Upload first, then record it. If recording fails, remove the file,
      // so a product row never points at a photo that is not there.
      const id = crypto.randomUUID();
      const path = photoPath(session.user.id, project.id, id, file.type);
      const upload = await drafts().upload(path, file, { contentType: file.type });
      if (upload.error) {
        found.push(`${file.name}: ${upload.error.message}`);
        continue;
      }

      const { data, error } = await supabase
        .from("products")
        .insert({
          id,
          project_id: project.id,
          name: productName(file.name),
          photo_path: path,
          photo_width: size.width,
          photo_height: size.height,
        })
        .select(COLUMNS)
        .single();
      if (error) {
        await drafts().remove([path]);
        found.push(`${file.name}: ${error.message}`);
        continue;
      }

      added.push(data);
      const warning = sizeWarning(size);
      if (warning) found.push(`${file.name}: ${warning}`);
    }

    setProducts((current) => [...(current ?? []), ...added]);
    showThumbs(added);
    setNotes(found);
    setProgress("");
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Remove "${product.name}" and its photo?`)) return;
    setError("");
    // Row first, then file: if removing the file fails, the leftover is an
    // unseen file rather than a product with a broken photo.
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      setError(error.message);
      return;
    }
    setProducts((current) => current.filter((p) => p.id !== product.id));
    const removal = await drafts().remove([product.photo_path]);
    if (removal.error) setError(`Product removed, but its photo was not: ${removal.error.message}`);
  }

  return (
    <main className="wide">
      <button className="link" onClick={onBack}>
        ← All projects
      </button>
      <header className="bar">
        <h1>{project.name}</h1>
        <button onClick={() => picker.current.click()} disabled={Boolean(progress)}>
          {progress || "Add product photos"}
        </button>
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          accept={Object.keys(ACCEPTED_TYPES).join(",")}
          onChange={(event) => {
            const files = [...event.target.files];
            event.target.value = "";
            if (files.length) addPhotos(files);
          }}
        />
      </header>
      <p className="muted">
        JPEG, PNG or WebP, up to 20 MB each. A plain product-on-white photo
        works best.
      </p>

      {error && <p className="error">{error}</p>}
      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {products === null && !error && <p className="muted">Loading…</p>}
      {products?.length === 0 && (
        <p className="muted">No products yet. Add a photo to start.</p>
      )}
      <ul className="products">
        {products?.map((product) => (
          <li key={product.id}>
            <div className="thumb">
              {thumbs[product.photo_path] && (
                <img src={thumbs[product.photo_path]} alt={product.name} />
              )}
            </div>
            <strong>{product.name}</strong>
            <span className="muted">
              {product.photo_width}×{product.photo_height} px
            </span>
            <button className="link danger" onClick={() => deleteProduct(product)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

// The browser decodes the photo locally to read its size before uploading.
async function readSize(file) {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
