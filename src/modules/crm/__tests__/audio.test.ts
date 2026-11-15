import { describe, expect, it } from "vitest";
import { audioFileInfo, formatDuration, pickAudioMime } from "../hooks/useAudioRecorder";

describe("gravação de áudio", () => {
  it("prefere opus (formato do WhatsApp) e cai para mp4 no iPhone", () => {
    expect(pickAudioMime((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickAudioMime((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickAudioMime(() => false)).toBe("");
  });

  it("arquivo com tipo aceito pelo armazenamento (sem parâmetros de codec)", () => {
    expect(audioFileInfo("audio/webm;codecs=opus")).toEqual({ type: "audio/webm", ext: "webm" });
    expect(audioFileInfo("audio/mp4")).toEqual({ type: "audio/mp4", ext: "m4a" });
    expect(audioFileInfo("audio/ogg;codecs=opus")).toEqual({ type: "audio/ogg", ext: "ogg" });
    expect(audioFileInfo("")).toEqual({ type: "audio/webm", ext: "webm" });
  });

  it("cronômetro", () => {
    expect(formatDuration(5.4)).toBe("0:05");
    expect(formatDuration(75)).toBe("1:15");
  });
});
