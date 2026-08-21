<!--
Purpose: Record the source, license, and verified geometry metadata for the disco assets.
Context: The PICO WebXR demo keeps third-party asset provenance beside each downloaded GLB.
Responsibilities: Identify the exact Poly Pizza models and their local verification facts.
Boundaries: This file does not define runtime loading, placement, scaling, or rendering behavior.
-->

# Disco asset attribution

## Speaker

- Local file: `speaker.glb`
- Poly Pizza model ID: `zOQOThSpuo`
- Title: `Speaker`
- Creator: `iPoly3D`
- License: `CC0 1.0`
- Model source: https://poly.pizza/m/zOQOThSpuo
- Creator profile: https://poly.pizza/u/iPoly3D
- Triangle count: `794`
- File size: `37,136 bytes`
- Format: `glTF Binary 2.0`

## Disco Ball

- Local file: `disco-ball.glb`
- Poly Pizza model ID: `KGq88JUIJo`
- Title: `Light Icosahedron`
- Creator: `Quaternius`
- License: `CC0 1.0`
- Model source: https://poly.pizza/m/KGq88JUIJo
- Creator profile: https://poly.pizza/u/Quaternius
- Triangle count: `1,220`
- File size: `61,884 bytes`
- Format: `glTF Binary 2.0`

`Light Icosahedron` is used as the lightweight hanging disco fixture. Poly Pizza did not expose an
exact CC0 model titled `Disco Ball`; this CC0 asset has the appropriate suspended geometric-light
silhouette without introducing a larger CC-BY scene asset.

## Triangle count method

The Poly Pizza API did not provide triangle counts for these models. The recorded counts were
derived from the indexed triangle primitives declared by each downloaded GLB's accessors.
