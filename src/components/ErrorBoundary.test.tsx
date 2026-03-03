import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock("lucide-react", () => ({
  AlertCircle: () => <span data-testid="alert-icon" />,
}));

const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error("Test error");
  return <div>Child content</div>;
};

describe("ErrorBoundary", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("shows default fallback UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByTestId("alert-icon")).toBeInTheDocument();
    expect(screen.getByText("Try Again")).toBeInTheDocument();
  });

  it("displays the error message in the fallback", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Test error")).toBeInTheDocument();
  });

  it('shows "An unexpected error occurred" for errors without message', () => {
    const ThrowErrorNoMessage = () => {
      throw new Error();
    };

    render(
      <ErrorBoundary>
        <ThrowErrorNoMessage />
      </ErrorBoundary>
    );

    expect(
      screen.getByText("An unexpected error occurred")
    ).toBeInTheDocument();
  });

  it("shows custom fallback when fallback prop is provided", () => {
    const customFallback = <div>Custom error fallback</div>;

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom error fallback")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("logs error via logger.error when catching", async () => {
    const { logger } = await import("@/lib/logger");

    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(logger.error).toHaveBeenCalledWith(
      "ErrorBoundary caught an error:",
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it("Try Again button resets error state and re-renders children", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Re-render with a non-throwing child so that after reset the child renders successfully
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    await user.click(screen.getByText("Try Again"));

    expect(screen.getByText("Child content")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("handles multiple sequential errors", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();

    // Reset by re-rendering with non-throwing child, then clicking Try Again
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    await user.click(screen.getByText("Try Again"));

    expect(screen.getByText("Child content")).toBeInTheDocument();

    // Trigger a second error
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();
  });
});
