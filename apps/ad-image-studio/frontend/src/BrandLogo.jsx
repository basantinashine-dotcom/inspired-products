import { useEffect, useRef, useState } from "react";

import { LOGO, logoFileProblem, logoSizeProblem } from "./amazonSpec.js";
import { readSize } from "./photos.js";
import { supabase } from "./supabase.js";

const logos = () => supabase.storage.from("logos");

// The campaign's brand logo. Amazon places it beside the image, so it is
// stored and checked on its own, never drawn onto a photo.
export default function BrandLogo({ campaign, userId, onSaved }) {
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef(null);

  useEffect(() => {
    if (!campaign.logo_path) {
      setUrl(null);
      return;
    }
    logos()
      .createSignedUrl(campaign.logo_path, 60 * 60)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setUrl(data.signedUrl);
      });
  }, [campaign.logo_path]);

  async function upload(file) {
    setError("");
    const fileProblem = logoFileProblem(file);
    if (fileProblem) {
      setError(fileProblem);
      return;
    }
    let size;
    try {
      size = await readSize(file);
    } catch {
      setError("That file could not be read as an image.");
      return;
    }
    const sizeProblem = logoSizeProblem(size);
    if (sizeProblem) {
      setError(sizeProblem);
      return;
    }

    setBusy(true);
    // A new file name each time: stored files are never overwritten.
    const path = `${userId}/${campaign.id}/${crypto.randomUUID()}.${LOGO.types[file.type]}`;
    const upload = await logos().upload(path, file, { contentType: file.type });
    if (upload.error) {
      setError(upload.error.message);
      setBusy(false);
      return;
    }
    const fields = { logo_path: path, logo_width: size.width, logo_height: size.height };
    const { error } = await supabase.from("projects").update(fields).eq("id", campaign.id);
    if (error) {
      await logos().remove([path]);
      setError(error.message);
      setBusy(false);
      return;
    }
    // Only once the campaign points at the new logo is the old one removed.
    const previous = campaign.logo_path;
    onSaved(fields);
    if (previous) await logos().remove([previous]);
    setBusy(false);
  }

  async function removeLogo() {
    setError("");
    setBusy(true);
    const fields = { logo_path: null, logo_width: null, logo_height: null };
    const { error } = await supabase.from("projects").update(fields).eq("id", campaign.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    const previous = campaign.logo_path;
    onSaved(fields);
    await logos().remove([previous]);
    setBusy(false);
  }

  return (
    <section className="panel logo-panel">
      <div className="logo-box">{url && <img src={url} alt="Brand logo" />}</div>
      <div className="stack">
        <strong>Brand logo</strong>
        <span className="muted">
          {campaign.logo_path
            ? `${campaign.logo_width}×${campaign.logo_height} px`
            : `Amazon shows it beside every ad. PNG or JPEG, at least ` +
              `${LOGO.minWidth}×${LOGO.minHeight} px, up to 1,000 KB.`}
        </span>
        <div className="row tight">
          <button onClick={() => picker.current.click()} disabled={busy}>
            {campaign.logo_path ? "Replace logo" : "Add logo"}
          </button>
          {campaign.logo_path && (
            <button className="link danger" onClick={removeLogo} disabled={busy}>
              Remove
            </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
      <input
        ref={picker}
        type="file"
        hidden
        accept={Object.keys(LOGO.types).join(",")}
        onChange={(event) => {
          const [file] = event.target.files;
          event.target.value = "";
          if (file) upload(file);
        }}
      />
    </section>
  );
}
