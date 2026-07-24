import "@testing-library/jest-dom/vitest";

Object.defineProperty(globalThis.navigator, "mediaDevices", {
  configurable: true,
  value: {
    enumerateDevices: async () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});
