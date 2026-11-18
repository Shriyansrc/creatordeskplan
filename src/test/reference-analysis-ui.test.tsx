import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReferenceAnalysis } from "@/desk/extras";

vi.mock("@/lib/ai/client", () => ({ generationHeaders: async () => ({}) }));
const blocked = { status: "needs_upload", reason: "replayed outcome A" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("reference outcomes belong only to the current input", () => {
  it("clears prior outcomes on link changes, Analyse start, and failure", async () => {
    let rejectRequest: ((reason: Error) => void) | undefined;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(blocked)).mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }));
    vi.stubGlobal("fetch", fetcher);
    render(<ReferenceAnalysis topic="test" niche="test" />);
    const link = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    fireEvent.change(link, { target: { value: "https://youtu.be/jNQXAC9IVRw" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse" }));
    await screen.findByText(blocked.reason);
    fireEvent.click(screen.getByRole("button", { name: "Analyse" }));
    expect(screen.queryByText(blocked.reason)).toBeNull();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await act(async () => rejectRequest?.(new Error("failed input")));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.change(link, { target: { value: "https://youtu.be/another" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears file/link switch results and ignores a completed request for changed input", async () => {
    let finish: ((result: Response) => void) | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => { finish = resolve; })));
    render(<ReferenceAnalysis topic="test" niche="test" />);
    const link = screen.getByPlaceholderText("https://www.youtube.com/watch?v=...");
    fireEvent.change(link, { target: { value: "https://youtu.be/jNQXAC9IVRw" } });
    fireEvent.click(screen.getByRole("button", { name: "Analyse" }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    fireEvent.change(screen.getByLabelText("Upload a video file"), { target: { files: [new File(["test"], "test.mp4", { type: "video/mp4" })] } });
    await act(async () => finish?.(Response.json(blocked)));
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Use a link instead" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});