import { useCallback, useEffect, useRef, useState } from "react";

/** Formatos aceitos pelo bucket crm_media, na ordem de preferência (opus = áudio do WhatsApp). */
const CANDIDATES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
export const MAX_AUDIO_SECONDS = 5 * 60;

export function pickAudioMime(isSupported: (t: string) => boolean = (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
  return CANDIDATES.find((t) => { try { return isSupported(t); } catch { return false; } }) ?? "";
}

/** "audio/webm;codecs=opus" → { type: "audio/webm", ext: "webm" } */
export function audioFileInfo(mime: string) {
  const type = (mime.split(";")[0] || "audio/webm").trim();
  const ext = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
  return { type, ext };
}

export const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type State = "idle" | "recording";

/**
 * Grava áudio do microfone. stop() devolve o arquivo; cancel() descarta.
 * Ao chegar no limite, chama onLimit com o arquivo.
 */
export function useAudioRecorder(onLimit?: (f: File) => void) {
  const [state, setState] = useState<State>("idle");
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef<((f: File | null) => void) | null>(null);
  const discard = useRef(false);
  const limitRef = useRef(onLimit);
  limitRef.current = onLimit;

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    rec.current = null;
    setState("idle");
    setSeconds(0);
  }, []);

  // saiu da conversa no meio da gravação: descarta e libera o microfone
  useEffect(() => () => {
    discard.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    cleanup();
  }, [cleanup]);

  const finish = useCallback((): Promise<File | null> => {
    const r = rec.current;
    if (!r || r.state !== "recording") return Promise.resolve(null);
    return new Promise((resolve) => { done.current = resolve; r.stop(); });
  }, []);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Este navegador não grava áudio.");
    }
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      throw new Error("Permita o uso do microfone para gravar áudio.");
    }
    const mime = pickAudioMime();
    const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
    const { type, ext } = audioFileInfo(r.mimeType || mime);
    chunks.current = [];
    discard.current = false;
    r.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
    r.onstop = () => {
      const blob = new Blob(chunks.current, { type });
      const file = !discard.current && blob.size > 0 ? new File([blob], `audio-${Date.now()}.${ext}`, { type }) : null;
      const cb = done.current;
      done.current = null;
      cleanup();
      cb?.(file);
    };
    stream.current = s;
    rec.current = r;
    r.start(250);
    setState("recording");
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const sec = (Date.now() - t0) / 1000;
      setSeconds(sec);
      if (sec >= MAX_AUDIO_SECONDS) void finish().then((f) => f && limitRef.current?.(f));
    }, 250);
  }, [cleanup, finish]);

  const cancel = useCallback(() => {
    discard.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    else cleanup();
  }, [cleanup]);

  return { state, seconds, start, stop: finish, cancel };
}
