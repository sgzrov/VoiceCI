"use client";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: 40, fontFamily: "monospace", color: "#ff6b6b", background: "#111" }}>
        <h2>Global Debug Error</h2>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {error.message}
        </pre>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#888", fontSize: 12 }}>
          {error.stack}
        </pre>
      </body>
    </html>
  );
}
