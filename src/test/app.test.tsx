import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import App from "../App";

afterEach(cleanup);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

describe("主要画面", () => {
  it("起動時にマイクを確認し、測定操作は2段階で表示する", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "ドップラー効果",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "マイクを使う" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "マイクの準備" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "あとで" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".workflow-step")).toHaveLength(2);
    expect(screen.getByLabelText("音源")).toHaveValue(2000);
    expect(screen.queryByText("観測振動数 f を時間に対して測る")).not.toBeInTheDocument();
    expect(screen.queryByText("音声と測定結果はブラウザ内だけで処理します。")).not.toBeInTheDocument();
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
  it("マイクを使えない場合も再試行し、あとで確認画面を開ける", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "マイクを使う" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "もう一度試す" })).toBeEnabled());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "あとで" }));
    fireEvent.click(screen.getByRole("button", { name: "マイクの準備を開く" }));
    expect(screen.getByRole("dialog", { name: "マイクの準備" })).toBeInTheDocument();
  });

});
