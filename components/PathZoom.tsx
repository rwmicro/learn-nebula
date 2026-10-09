"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/use-locale";
import { centreOn, clampView, fits, fitScale, openingScale, reveal, zoomAt, type Box, type View } from "@/lib/zoom-pan";

/**
 * Zoom and pan for a reading path's graph (/parcours/<slug>/), only when the
 * drawing is bigger than the column — a graph that fits stays a plain static
 * figure. A CSS transform on a wrapper around the server-rendered SVGs
 * (lib/zoom-pan.ts does the geometry): drag to pan, pinch or Ctrl/⌘ + wheel to
 * zoom (a plain wheel keeps scrolling the page), +, −, "Ajuster" buttons, and
 * the keyboard on the focused viewport (+ − 0, arrows). Tabbing to a note pans
 * it into view. Opens at natural size on the note to read next.
 */
export function PathZoom({ children, label }: { children: ReactNode; label: string }) {
  const locale = useLocale();
  const tr = (k: string) => t(k, undefined, locale);
  const vpRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState<View>({ s: 1, x: 0, y: 0 });
  // Latest view and box for the event handlers (kept in step by applyView
  // and measure, never written during render).
  const viewRef = useRef<View>({ s: 1, x: 0, y: 0 });
  const boxRef = useRef<Box | null>(null);
  const applyView = (v: View) => {
    viewRef.current = v;
    setView(v);
  };
  const centred = useRef(false);
  const on = !!box && !fits(box);

  // The drawing on screen: two SVGs exist (wide / compact), CSS shows one.
  const visibleSvg = () =>
    [...(stageRef.current?.querySelectorAll<SVGSVGElement>("svg.pg") ?? [])].find(
      (s) => s.getClientRects().length > 0,
    ) ?? null;

  const measure = useCallback(() => {
    const vp = vpRef.current;
    const svg = visibleSvg();
    if (!vp || !svg) return;
    const cw = Number(svg.getAttribute("width")) || 0;
    const ch = Number(svg.getAttribute("height")) || 0;
    const vw = vp.clientWidth;
    // Viewport height: the drawing's own, up to most of the screen.
    const vh = Math.min(ch, Math.max(260, Math.round(window.innerHeight * 0.82)));
    const b = { vw, vh, cw, ch };
    boxRef.current = b;
    setBox(b);
    if (fits(b)) {
      centred.current = false;
      applyView({ s: 1, x: 0, y: 0 });
      return;
    }
    if (!centred.current) {
      // First time it overflows: when a modest zoom-out shows it all, fit;
      // otherwise on the note to read next, the whole width when that is a
      // modest zoom-out too (openingScale), else natural size.
      centred.current = true;
      if (fitScale(b) >= 0.75) {
        applyView(clampView({ s: fitScale(b), x: 0, y: 0 }, b));
        return;
      }
      const node =
        svg.querySelector<SVGGraphicsElement>(".pg-item.is-next .pg-box") ??
        svg.querySelector<SVGGraphicsElement>(".pg-item.is-target .pg-box") ??
        svg.querySelector<SVGGraphicsElement>(".pg-box");
      const bb = node?.getBBox();
      const s0 = openingScale(b);
      applyView(bb ? centreOn(bb.x + bb.width / 2, bb.y + bb.height / 2, s0, b) : clampView({ s: s0, x: 0, y: 0 }, b));
    } else applyView(clampView(viewRef.current, b));
  }, []);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    // After ParcoursStudy has marked the next note (it runs on mount too).
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(() => measure());
    ro.observe(vp);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const set = (v: View) => {
    if (boxRef.current) applyView(clampView(v, boxRef.current));
  };
  const zoomBy = (f: number) => {
    const b = boxRef.current;
    if (b) applyView(zoomAt(viewRef.current, f, b.vw / 2, b.vh / 2, b));
  };
  const fit = () => {
    const b = boxRef.current;
    if (b) applyView(clampView({ s: fitScale(b), x: 0, y: 0 }, b));
  };

  // --- pointer: drag to pan, two fingers to pinch -------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    view: View;
    x: number;
    y: number;
    dist: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const vp = vpRef.current;
    if (!vp || !on) return;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = vp.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const startGesture = () => {
      const pts = [...pointers.current.values()];
      const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
      gesture.current = {
        view: viewRef.current,
        x: mid.x,
        y: mid.y,
        dist: pts.length > 1 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1 : 0,
        moved: gesture.current?.moved ?? false,
      };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointers.current.set(e.pointerId, local(e));
      if (pointers.current.size > 2) return;
      if (pointers.current.size === 1) gesture.current = null;
      startGesture();
    };
    const move = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, local(e));
      const g = gesture.current;
      const b = boxRef.current;
      if (!g || !b) return;
      const pts = [...pointers.current.values()];
      if (pts.length >= 2 && g.dist) {
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
        const z = zoomAt(g.view, dist / g.dist, g.x, g.y, b);
        g.moved = true;
        applyView(clampView({ s: z.s, x: z.x + (mid.x - g.x), y: z.y + (mid.y - g.y) }, b));
        e.preventDefault();
        return;
      }
      const dx = pts[0].x - g.x;
      const dy = pts[0].y - g.y;
      if (!g.moved && Math.hypot(dx, dy) < 5) return;
      if (!g.moved) {
        g.moved = true;
        vp.setPointerCapture?.(e.pointerId);
        vp.classList.add("is-dragging");
      }
      applyView(clampView({ s: g.view.s, x: g.view.x + dx, y: g.view.y + dy }, b));
    };
    const up = (e: PointerEvent) => {
      if (!pointers.current.delete(e.pointerId)) return;
      if (gesture.current?.moved) suppressClick.current = true;
      if (pointers.current.size === 0) {
        gesture.current = null;
        vp.classList.remove("is-dragging");
      } else startGesture();
    };
    // A drag that ends on a note must not open it.
    const click = (e: MouseEvent) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const wheel = (e: WheelEvent) => {
      const b = boxRef.current;
      if (!b) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const p = local(e);
        applyView(zoomAt(viewRef.current, Math.exp(-e.deltaY * 0.0025), p.x, p.y, b));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Sideways wheel / trackpad swipe pans; vertical keeps scrolling the page.
        e.preventDefault();
        const v = viewRef.current;
        applyView(clampView({ ...v, x: v.x - e.deltaX }, b));
      }
    };
    vp.addEventListener("pointerdown", down);
    vp.addEventListener("pointermove", move, { passive: false });
    vp.addEventListener("pointerup", up);
    vp.addEventListener("pointercancel", up);
    vp.addEventListener("click", click, true);
    vp.addEventListener("wheel", wheel, { passive: false });
    return () => {
      vp.removeEventListener("pointerdown", down);
      vp.removeEventListener("pointermove", move);
      vp.removeEventListener("pointerup", up);
      vp.removeEventListener("pointercancel", up);
      vp.removeEventListener("click", click, true);
      vp.removeEventListener("wheel", wheel);
    };
  }, [on]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!on || e.ctrlKey || e.metaKey || e.altKey) return;
    const step = 48;
    const v = viewRef.current;
    const k = e.key;
    if (k === "+" || k === "=") zoomBy(1.25);
    else if (k === "-" || k === "_") zoomBy(1 / 1.25);
    else if (k === "0") fit();
    else if (e.target !== vpRef.current) return; // arrows on a note: page as usual
    else if (k === "ArrowLeft") set({ ...v, x: v.x + step });
    else if (k === "ArrowRight") set({ ...v, x: v.x - step });
    else if (k === "ArrowUp") set({ ...v, y: v.y + step });
    else if (k === "ArrowDown") set({ ...v, y: v.y - step });
    else return;
    e.preventDefault();
  };

  // Keyboard focus on a note (or its buttons) brings it into view.
  const onFocus = (e: React.FocusEvent) => {
    const b = boxRef.current;
    if (!on || !b) return;
    const item = (e.target as Element).closest?.(".pg-item");
    const rect = item?.querySelector<SVGGraphicsElement>(".pg-box")?.getBBox();
    if (rect) applyView(reveal(viewRef.current, { x: rect.x - 12, y: rect.y - 12, w: rect.width + 24, h: rect.height + 24 }, b));
    // A focused element inside an overflow:hidden box can scroll it natively.
    if (vpRef.current) {
      vpRef.current.scrollLeft = 0;
      vpRef.current.scrollTop = 0;
    }
  };

  const fitS = box ? fitScale(box) : 1;
  return (
    <div className={`pz${on ? " is-on" : ""}`}>
      <div
        ref={vpRef}
        className="pz-viewport parcours-graph"
        role="group"
        aria-label={label}
        aria-describedby={on ? "pz-hint" : undefined}
        tabIndex={on ? 0 : undefined}
        style={on && box ? { height: `${box.vh}px` } : undefined}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        <div
          ref={stageRef}
          className="pz-stage"
          style={on ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` } : undefined}
        >
          {children}
        </div>
      </div>
      {on && (
        <div className="pz-bar">
          <div className="pz-controls" role="group" aria-label={tr("parcours.zoomAria")}>
            <button
              type="button"
              className="pz-btn"
              onClick={() => zoomBy(1.25)}
              disabled={view.s >= 2.5 - 1e-3}
              aria-label={tr("parcours.zoomIn")}
              title={tr("parcours.zoomIn")}
            >
              +
            </button>
            <button
              type="button"
              className="pz-btn"
              onClick={() => zoomBy(1 / 1.25)}
              disabled={view.s <= fitS + 1e-3}
              aria-label={tr("parcours.zoomOut")}
              title={tr("parcours.zoomOut")}
            >
              −
            </button>
            <button type="button" className="pz-btn pz-btn--fit" onClick={fit} disabled={view.s <= fitS + 1e-3}>
              {tr("parcours.zoomFit")}
            </button>
          </div>
          <span id="pz-hint" className="pz-hint">
            {tr("parcours.zoomHint")}
          </span>
        </div>
      )}
    </div>
  );
}
