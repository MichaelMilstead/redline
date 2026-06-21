import Editor from "@/components/editor";

export default function Home() {
  return (
    <main className="min-h-screen w-full">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          Redline - natural AI writing review
        </h1>
        <div className="mb-10 space-y-3 text-sm text-neutral-500">
          <p>
            Try editing the example blog post below, or replace it with your own text. Feedback will be generated after you stop editing.
            Click on the resulting highlighted text to see the feedback and suggested rewrites. - Michael
          </p>
          <p>
            As a proof of concept, input is capped at ~5,000 characters to keep
            reviews fast and focused.
          </p>
        </div>

        <Editor />
      </div>
    </main>
  );
}
