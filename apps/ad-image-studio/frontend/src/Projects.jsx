import { useEffect, useState } from "react";

import { supabase } from "./supabase.js";

// products(count): how many photos each campaign holds, counted by the
// database (and, like everything else, only over rows you may see).
const COLUMNS = "id, name, updated_at, products(count)";

export default function Projects({ session, onOpen }) {
  const [projects, setProjects] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // No "where owner is me" here: the database's row level security only
    // ever returns the signed-in user's rows.
    supabase
      .from("projects")
      .select(COLUMNS)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setProjects(data);
      });
  }, []);

  async function createProject(event) {
    event.preventDefault();
    setError("");
    // No owner sent either: the database fills it in from the session.
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: name.trim() })
      .select(COLUMNS)
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setProjects((current) => [data, ...current]);
    setName("");
  }

  async function deleteProject(project) {
    if (!window.confirm(`Delete "${project.name}" and all its photos? This cannot be undone.`)) {
      return;
    }
    setError("");

    // Deleting the project deletes its product rows with it (on delete
    // cascade), but not the photo files: storage is separate from the
    // database. Note which files to remove before the rows are gone.
    const photos = await supabase
      .from("products")
      .select("photo_path")
      .eq("project_id", project.id);
    if (photos.error) {
      setError(photos.error.message);
      return;
    }

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id);
    if (error) {
      setError(error.message);
      return;
    }
    setProjects((current) => current.filter((p) => p.id !== project.id));

    const paths = photos.data.map((row) => row.photo_path);
    if (paths.length === 0) return;
    const removal = await supabase.storage.from("drafts").remove(paths);
    if (removal.error) {
      setError(`Project deleted, but its photos were not: ${removal.error.message}`);
    }
  }

  return (
    <main>
      <header className="bar">
        <h1>Your projects</h1>
        <span className="muted">{session.user.email}</span>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      <form onSubmit={createProject} className="row">
        <input
          aria-label="New project name"
          placeholder="Project name, e.g. Steel water bottle"
          maxLength={100}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" disabled={!name.trim()}>
          New project
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {projects === null && !error && <p className="muted">Loading…</p>}
      {projects?.length === 0 && (
        <p className="muted">No projects yet. Create one to start.</p>
      )}
      <ul className="projects">
        {projects?.map((project) => (
          <li key={project.id}>
            <button className="link title" onClick={() => onOpen(project)}>
              {project.name}
            </button>
            <span className="muted">{photoCount(project)}</span>
            <span className="muted">
              Edited {new Date(project.updated_at).toLocaleString()}
            </span>
            <button className="link danger" onClick={() => deleteProject(project)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function photoCount(project) {
  const count = project.products?.[0]?.count ?? 0;
  return count === 1 ? "1 photo" : `${count} photos`;
}
