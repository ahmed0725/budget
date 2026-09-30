"use client";

/**
 * Last-resort error page (replaces the root layout, so it cannot use the app's
 * providers or stylesheet). Bilingual text; follows the OS colour scheme.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "48px 16px", colorScheme: "light dark" }}>
        <title>Error · GBMS</title>
        <main style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ marginTop: 0, opacity: 0.8 }}>Khalad ayaa dhacay</p>
          <p>The page could not be displayed. Your data has not been changed. Try again, and contact the system administrator if the problem continues.</p>
          {error.digest ? <p style={{ fontSize: 13, opacity: 0.7 }}>Reference: {error.digest}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => retry()} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid currentColor", background: "transparent", color: "inherit", cursor: "pointer" }}>
              Try again / Isku day mar kale
            </button>
            {/* A full reload is intended: the root layout itself failed. */}
            <a href="/dashboard" style={{ padding: "8px 14px", color: "inherit" }}>
              Dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
