# Camera Post Effects Current Spec

Updated: 2026-04-23

## Summary

Current camera-side post effects are edited from the right `エフェクト` panel when `対象 = Camera`.

- Base image controls: `Gamma`, `Vignette`, `Chroma`, `Grain`, `Sharpen`, `Distortion`, `EdgeBlur`, `Edge`
- `LuminousGlow`: intensity slider for `GlowLayer` based pseudo `AutoLuminous`
- LUT: preset + intensity
- Bloom: `On/Off`, `Bloom強度`, `BloomTh`, `BloomK`
- DoF: `On/Off`, quality, focus, signed focus offset, F-stop, near suppression, focal invert, lens size, lens blur
- Fog: `On/Off`, density, opacity, color `R/G/B`
- Tone mapping: dropdown at the bottom of the post effect list

## Hidden / Simplified Items

The following items are intentionally hidden from the current UI:

- `Contrast`
- `Exposure`
- `Dither`
- `Curves`
- `Motion Blur`
- `SSR`
- `VLight`
- `Fog方式`
- `Fog開始`
- `Fog終了`

Notes:

- Fog mode is fixed to `Exp2`.
- Fog start/end stay at internal defaults `100 / 300`.
- `SSAO` remains disabled in the current UI path.

## DoF Notes

- Main DoF uses `DefaultRenderingPipeline.depthOfField`.
- `前後補正` is a signed offset from the camera target.
- Positive values move the focus nearer to the camera.
- Negative values move the focus farther behind the target.
- Main lens blur now uses a custom standalone round-bokeh path after fog/bloom.
- Legacy `LensRenderingPipeline` based runtime remains disabled.
- `Edge blur` now uses a standalone screen-edge blur pass.

## Fog Notes

- Fog is origin-based, not camera-distance-based.
- World position is reconstructed from depth and fog amount is computed from distance to scene origin.
- `Fog濃度` and `Fog透明度` are intentionally separated:
  - `Fog濃度`: how quickly fog grows over distance
  - `Fog透明度`: maximum blend amount
- UI display is integer-style for easier adjustment, but internal values remain small floating-point values.

## Save / Load

Current project save/load persists these camera-side effect values:

- DoF enabled
- DoF focus distance
- DoF focus offset
- DoF F-stop
- DoF lens size
- DoF lens blur strength
- DoF lens edge blur
- DoF lens distortion influence
- Bloom enabled / weight / threshold / kernel
- Gamma
- Tone mapping enabled / type
- Vignette
- LUT settings
- Fog enabled / density / opacity / color

## Final Post Process Order

Current tail ordering after the main rendering pipeline is:

- Fog
- Bloom
- Lens Blur
- VLight
- Motion Blur
- Edge Blur
- Lens Distortion
- FXAA

Notes:

- This tail order is controlled by `enforceFinalPostProcessOrder()`.
- Bloom is handled by a standalone `BloomEffect` pass so it can run after fog instead of inside `DefaultRenderingPipeline`.
- Lens blur is also handled outside `DefaultRenderingPipeline` as a single standalone pass.
- Edge blur is handled as a standalone radial screen-edge blur pass before final lens distortion.
