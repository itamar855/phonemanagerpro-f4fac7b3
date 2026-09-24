import { useRef, useEffect, useState, useCallback } from "react";

interface Props {
  onPattern: (pattern: string, imageData: string) => void;
  size?: number;
}

const GRID = 3;
const DOT_RADIUS = 12;
const ACTIVE_RADIUS = 18;
const LINE_COLOR = "#10b981";
const DOT_COLOR = "#10b981";
const DOT_INACTIVE = "#4b5563";

export const AndroidPatternLock = ({ onPattern, size = 240 }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const selectedRef = useRef<number[]>([]);
  const drawingRef = useRef(false);

  const spacing = size / (GRID + 1);

  const getDotPos = (index: number) => {
    const col = index % GRID;
    const row = Math.floor(index / GRID);
    return {
      x: spacing * (col + 1),
      y: spacing * (row + 1),
    };
  };

  const draw = useCallback((sel: number[], mouse: { x: number; y: number } | null, isDrawing: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);

    // Draw lines between selected dots
    if (sel.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.7;
      const first = getDotPos(sel[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < sel.length; i++) {
        const p = getDotPos(sel[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw line to mouse
    if (isDrawing && mouse && sel.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4;
      const last = getDotPos(sel[sel.length - 1]);
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw dots
    for (let i = 0; i < GRID * GRID; i++) {
      const { x, y } = getDotPos(i);
      const isSelected = sel.includes(i);

      if (isSelected) {
        // Outer ring
        ctx.beginPath();
        ctx.arc(x, y, ACTIVE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = LINE_COLOR + "22";
        ctx.fill();
        // Inner dot
        ctx.beginPath();
        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = DOT_COLOR;
        ctx.fill();
        // Center white
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = DOT_INACTIVE;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#9ca3af";
        ctx.fill();
      }
    }
  }, [size, spacing]);

  useEffect(() => {
    draw(selected, mousePos, drawing);
  }, [selected, mousePos, drawing, draw]);

  const getEventPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = size / rect.width;
    const scaleY = size / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const getNearDot = (pos: { x: number; y: number }) => {
    for (let i = 0; i < GRID * GRID; i++) {
      const { x, y } = getDotPos(i);
      const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
      if (dist < ACTIVE_RADIUS + 4) return i;
    }
    return -1;
  };

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getEventPos(e);
    if (!pos) return;
    const dot = getNearDot(pos);
    if (dot >= 0) {
      selectedRef.current = [dot];
      setSelected([dot]);
      drawingRef.current = true;
      setDrawing(true);
    }
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawingRef.current) return;
    const pos = getEventPos(e);
    if (!pos) return;
    setMousePos(pos);
    const dot = getNearDot(pos);
    if (dot >= 0 && !selectedRef.current.includes(dot)) {
      selectedRef.current = [...selectedRef.current, dot];
      setSelected([...selectedRef.current]);
    }
  };

  const handleEnd = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDrawing(false);
    setMousePos(null);
    const finalSel = selectedRef.current;
    if (finalSel.length >= 2) {
      // Capture canvas image
      const canvas = canvasRef.current;
      if (canvas) {
        // Redraw without in-progress line
        draw(finalSel, null, false);
        setTimeout(() => {
          const imageData = canvas.toDataURL("image/png");
          const patternStr = finalSel.map(i => i + 1).join("-");
          onPattern(patternStr, imageData);
        }, 50);
      }
    }
  };

  const reset = () => {
    selectedRef.current = [];
    setSelected([]);
    setDrawing(false);
    setMousePos(null);
    drawingRef.current = false;
    onPattern("", "");
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-xs text-muted-foreground">Desenhe o padrão de desbloqueio</p>
      <div
        className="rounded-2xl border border-border bg-background/50 p-4 select-none"
        style={{ touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          style={{ width: size, height: size, display: "block", cursor: "crosshair", touchAction: "none" }}
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        />
      </div>
      <div className="flex items-center gap-3">
        {selected.length >= 2 && (
          <p className="text-xs text-primary font-medium">
            Padrão: {selected.map(i => i + 1).join(" → ")}
          </p>
        )}
        {selected.length > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  );
};
