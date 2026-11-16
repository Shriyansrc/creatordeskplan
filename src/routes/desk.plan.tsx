import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/plan")({ component: Page });

function Page() {
  return (
    <>
      <h1>Plan</h1>
      <div className="dk-empty" style={{ marginTop: 24 }}><b>This screen is being built</b>It needs your niche first. It will use only what you create here.</div>
    </>
  );
}
