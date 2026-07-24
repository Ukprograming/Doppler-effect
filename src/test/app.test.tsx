import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("主要画面", () => {
  it("グラフと3段階の測定操作を一画面に表示する", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "ドップラー効果",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "準備する" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "基準を測る" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "測定開始" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "観測振動数 f" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "設定" })).toBeInTheDocument();
  });
});
