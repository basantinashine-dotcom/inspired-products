import { useEffect, useState } from "react";

import { supabase } from "./supabase.js";

const COLUMNS = "id, name, updated_at";

export default function Projects({ session }) {
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
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
      return;
    }
    setError("");
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id);
    if (error) {
      setError(error.message);
      return;
    }
    setProjects((current) => current.filter((p) => p.id !== project.id));
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
            <span>{project.name}</span>
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
