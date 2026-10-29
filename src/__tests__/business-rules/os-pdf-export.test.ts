// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveAndOpenPdf } from "@/components/features/os/osPdf";

describe("saveAndOpenPdf helper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost:8080/mock-uuid");
    } else {
      vi.spyOn(window.URL, "createObjectURL").mockReturnValue("blob:http://localhost:8080/mock-uuid");
    }
    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => {});
    }
  });

  it("should ensure .pdf extension is appended and link is attached to document.body for Chrome compatibility", () => {
    const mockDoc = {
      output: vi.fn().mockReturnValue(new Uint8Array([37, 80, 68, 70])), // %PDF
    };
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const clickSpy = vi.fn();
    let capturedDownload = "";

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === "a") {
        el.click = clickSpy;
        Object.defineProperty(el, "download", {
          set(val) { capturedDownload = val; },
          get() { return capturedDownload; },
        });
      }
      return el;
    });

    saveAndOpenPdf(mockDoc, "OS-71", true);

    expect(openSpy).toHaveBeenCalledWith("blob:http://localhost:8080/mock-uuid", "_blank");
    expect(capturedDownload).toBe("OS-71.pdf");
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it("should preserve .pdf extension when already provided", () => {
    const mockDoc = {
      output: vi.fn().mockReturnValue(new Uint8Array([37, 80, 68, 70])),
    };
    let capturedDownload = "";
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === "a") {
        el.click = vi.fn();
        Object.defineProperty(el, "download", {
          set(val) { capturedDownload = val; },
          get() { return capturedDownload; },
        });
      }
      return el;
    });

    saveAndOpenPdf(mockDoc, "OS-Cupom-71.pdf", false);

    expect(capturedDownload).toBe("OS-Cupom-71.pdf");
  });
});
