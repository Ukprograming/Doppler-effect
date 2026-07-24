import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("主要画面", () => {
  it("測定手順、基準測定、本測定、詳細設定を日本語で表示する", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "音の変化を、振動数として測る。",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "マイクの使用を許可" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "基準振動数を測定" }),
    ).toBeDisabled();
    expect(screen.getByText("PCが観測した振動数 f")).toBeInTheDocument();
    const settings = screen.getByText("詳細設定（通常は変更不要）");
    expect(settings.closest("details")).not.toHaveAttribute("open");
  });
});
