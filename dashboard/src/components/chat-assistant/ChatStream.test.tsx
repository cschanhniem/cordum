import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChatStream } from "./ChatStream";

const DOD_SUGGESTIONS = [
  "show denied jobs today",
  "list my active workflows",
  "what policies apply to billing?",
] as const;

describe("ChatStream — empty-state suggestion chips", () => {
  it("renders exactly the 3 DoD suggestion chips", () => {
    render(<ChatStream messages={[]} onSuggestionClick={vi.fn()} />);
    const list = screen.getByRole("list", { name: /suggested prompts/i });
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    for (const text of DOD_SUGGESTIONS) {
      expect(within(list).getByText(text)).toBeInTheDocument();
    }
  });

  it("gives each chip a descriptive aria-label", () => {
    render(<ChatStream messages={[]} onSuggestionClick={vi.fn()} />);
    for (const text of DOD_SUGGESTIONS) {
      const btn = screen.getByRole("button", {
        name: `Send suggestion: ${text}`,
      });
      expect(btn).toBeInTheDocument();
    }
  });

  it("invokes onSuggestionClick with the chip text on click", () => {
    const onSuggestionClick = vi.fn();
    render(
      <ChatStream messages={[]} onSuggestionClick={onSuggestionClick} />,
    );
    for (const text of DOD_SUGGESTIONS) {
      const btn = screen.getByRole("button", {
        name: `Send suggestion: ${text}`,
      });
      fireEvent.click(btn);
    }
    expect(onSuggestionClick).toHaveBeenCalledTimes(3);
    expect(onSuggestionClick.mock.calls.map((c) => c[0])).toEqual([
      ...DOD_SUGGESTIONS,
    ]);
  });

  it("disables every chip when no onSuggestionClick is provided", () => {
    render(<ChatStream messages={[]} />);
    for (const text of DOD_SUGGESTIONS) {
      const btn = screen.getByRole("button", {
        name: `Send suggestion: ${text}`,
      });
      expect(btn).toBeDisabled();
    }
  });
});
