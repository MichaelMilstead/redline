import Editor from "@/components/editor";

export default function Home() {
  return (
    <main className="min-h-screen w-full">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-10 space-y-3 text-sm text-neutral-500">
          <p>
            Good editorial feedback usually means waiting on another reader. This
            is a proof of concept for getting it instantly and inline, as you
            write — an AI editor that reviews your draft and proposes concrete
            rewrites.
          </p>
          <p>
            Start typing below. A moment after you pause, feedback appears as
            colored highlights —{" "}
            <span className="text-amber-600">orange</span> for suggestions,{" "}
            <span className="text-red-600">red</span> for issues. Click any
            highlight to read the note and accept a rewrite.
          </p>
        </div>

        <Editor />
      </div>
    </main>
  );
}
