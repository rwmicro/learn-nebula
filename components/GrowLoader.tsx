import { LOADING_FRAMES } from "@/lib/deco-art";

/** A wait shown as a seed coming up (lib/deco-art.ts): three drawings that
 *  take turns (app.css), then the words of what is loading. */
export function GrowLoader({ children }: { children: React.ReactNode }) {
  return (
    <div className="grow-loader" role="status">
      <span className="grow-loader-art deco" aria-hidden="true">
        {LOADING_FRAMES.map((f, i) => (
          <i key={i} dangerouslySetInnerHTML={{ __html: f }} />
        ))}
      </span>
      <span className="grow-loader-tx">{children}</span>
    </div>
  );
}
