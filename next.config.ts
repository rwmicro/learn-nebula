// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Site entièrement statique : `next build` génère une exportation statique dans `out/`.
  output: "export",
  // Hugo servait des URLs avec un slash final (/posts/slug/).
  trailingSlash: true,
  // On traite les images nous-mêmes à la compilation avec sharp (voir lib/images.ts),
  // donc l'optimiseur intégré (qui nécessite un serveur) est désactivé.
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig
