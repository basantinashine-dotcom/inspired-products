import { useState } from "react";

import { supabase } from "./supabase.js";

// Sign-in by emailed link: no passwords to store, reset or leak. Supabase
// creates the account the first time an address signs in.
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");

  async function sendLink(event) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <main className="narrow">
        <h1>Check your email</h1>
        <p>
          We sent a sign-in link to <strong>{email}</strong>. Open it in this
          browser to continue.
        </p>
      </main>
    );
  }

  return (
    <main className="narrow">
      <h1>Ad Image Studio</h1>
      <p>Turn a product photo into ad images. Sign in to see your projects.</p>
      <form onSubmit={sendLink} className="stack">
        <label htmlFor="email">Work email</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
