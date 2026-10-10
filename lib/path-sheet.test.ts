import { describe, expect, it } from "vitest";
import { keyPoints } from "./path-sheet";

const body = `# Kant

> [!important] Idée clé
> La raison a des **limites** : on ne connaît que les phénomènes.

> [!important] Définition — Phénomène
> Ce qui apparaît à un sujet, par opposition à la chose en soi.

> [!tip] Astuce
> Pas une idée clé.

> [!important]
> $x$

> [!important] Le criticisme
> Examiner le pouvoir de connaître avant de connaître.
`;

describe("keyPoints", () => {
  it("keeps the important callouts that are not definitions", () => {
    const k = keyPoints(body);
    expect(k.map((x) => x.title)).toEqual(["Idée clé", "Le criticisme"]);
    expect(k[0].text).toBe("La raison a des limites : on ne connaît que les phénomènes.");
  });

  it("caps the count", () => {
    expect(keyPoints(body, 1)).toHaveLength(1);
  });
});
