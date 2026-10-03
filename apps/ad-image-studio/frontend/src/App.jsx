import { useEffect, useState } from "react";

import Project from "./Project.jsx";
import Projects from "./Projects.jsx";
import SignIn from "./SignIn.jsx";
import { isConfigured, supabase } from "./supabase.js";

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(isConfigured);
  const [openProject, setOpenProject] = useState(null);

  useEffect(() => {
    if (!supabase) return;

    // A returning visitor may already have a session saved in the browser.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });

    // Sign-in (including arriving from an email link) and sign-out both
    // land here, so the screen always matches who is signed in.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setOpenProject(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) return <SetupNeeded />;
  if (checking) return null;
  if (!session) return <SignIn />;
  if (openProject) {
    return (
      <Project
        project={openProject}
        session={session}
        onBack={() => setOpenProject(null)}
      />
    );
  }
  return <Projects session={session} onOpen={setOpenProject} />;
}

function SetupNeeded() {
  return (
    <main className="narrow">
      <h1>Ad Image Studio</h1>
      <p className="error">This app is not connected to Supabase yet.</p>
      <p>
        Copy <code>frontend/env.example</code> to{" "}
        <code>frontend/.env.local</code>, fill in your project's URL and key,
        then restart <code>npm run dev</code>.
      </p>
    </main>
  );
}
