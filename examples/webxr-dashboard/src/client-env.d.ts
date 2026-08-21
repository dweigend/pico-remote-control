/**
 * Purpose: Declare browser-side stylesheet modules for the Bun-bundled application entries.
 * Context: Dashboard and headset entry points import their owning CSS files for side effects.
 * Responsibilities: Keep strict TypeScript aware of CSS modules consumed by Bun's bundler.
 * Boundaries: Bun runtime and HTML import types come from the project-level Bun type package.
 */

declare module "*.css";
