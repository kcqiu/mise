import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

if (typeof Blob !== "undefined" && !Blob.prototype.text) {
  Blob.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => reject(new Error("Failed to read blob"));
      reader.readAsText(this);
    });
  };
}

// Global safety guard: block any unmocked external network requests in tests
// to guarantee 0 tokens or API quota are ever consumed during development/testing.
const originalFetch = globalThis.fetch;
if (originalFetch) {
  globalThis.fetch = async (input, init) => {
    const urlStr = typeof input === "string" ? input : input?.url || "";
    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
      throw new Error(
        `External network call to ${urlStr} was blocked in test suite to prevent API token consumption. Mock the endpoint before testing.`
      );
    }
    return originalFetch(input, init);
  };
}
