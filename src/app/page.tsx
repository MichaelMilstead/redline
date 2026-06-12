import Editor from "@/components/editor";

export default function Home() {
  return (
    <main className="min-h-screen w-full">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-10 space-y-3 text-sm text-neutral-500">
          <p>
            Try adding a sentence to the example text below, or replace it with your own. Feedback will be generated after you stop typing.
            Click on the highlighted text to see the feedback and suggested rewrites. - Michael
          </p>
        </div>

        <Editor />
      </div>
    </main>
  );
}
