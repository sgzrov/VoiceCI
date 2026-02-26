"use client";

export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 40, fontFamily: "monospace", color: "#ff6b6b" }}>
      <h2>Debug Error</h2>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {error.message}
      </pre>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#888", fontSize: 12 }}>
        {error.stack}
      </pre>
    </div>
  );
}
