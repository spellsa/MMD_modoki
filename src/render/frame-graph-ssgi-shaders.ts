import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

export const FRAME_GRAPH_SSGI_METHOD_NAME = "single-frame-screen-space-gather";

export const FRAME_GRAPH_SSGI_GATHER_COMPUTE_WGSL = `
struct SsgiParams {
    inverseProjection: mat4x4f,
    inputSize: vec2f,
    outputSize: vec2f,
    sampleRadius: f32,
    thickness: f32,
    padding: vec2f,
};

@group(0) @binding(0) var sceneColor: texture_2d<f32>;
@group(0) @binding(1) var viewDepth: texture_2d<f32>;
@group(0) @binding(2) var viewNormal: texture_2d<f32>;
@group(0) @binding(3) var outputGi: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<uniform> params: SsgiParams;

fn reconstructViewPosition(uv: vec2f, viewZ: f32) -> vec3f {
    let clip = vec4f(
        uv.x * 2.0 - 1.0,
        (1.0 - uv.y) * 2.0 - 1.0,
        1.0,
        1.0
    );
    let homogeneousView = params.inverseProjection * clip;
    let safeW = select(
        max(abs(homogeneousView.w), 0.000001),
        -max(abs(homogeneousView.w), 0.000001),
        homogeneousView.w < 0.0
    );
    let viewRay = homogeneousView.xyz / safeW;
    let safeRayZ = select(
        max(abs(viewRay.z), 0.000001),
        -max(abs(viewRay.z), 0.000001),
        viewRay.z < 0.0
    );
    return viewRay * (viewZ / safeRayZ);
}

fn fixedPixelRotation(pixel: vec2f) -> f32 {
    let seed = dot(pixel, vec2f(12.9898, 78.233));
    return fract(sin(seed) * 43758.5453) * 6.28318530718;
}

fn srgbChannelToLinear(channel: f32) -> f32 {
    let value = clamp(channel, 0.0, 1.0);
    return select(
        value / 12.92,
        pow((value + 0.055) / 1.055, 2.4),
        value > 0.04045
    );
}

fn toLinearSrgb(color: vec3f) -> vec3f {
    return vec3f(
        srgbChannelToLinear(color.r),
        srgbChannelToLinear(color.g),
        srgbChannelToLinear(color.b)
    );
}

fn traceScreenSpaceVisibility(
    centerPixel: vec2i,
    samplePixel: vec2i,
    centerDepth: f32,
    sampleDepth: f32,
    inputMax: vec2i
) -> f32 {
    let centerDistance = max(abs(centerDepth), 0.0001);
    let sampleDistance = max(abs(sampleDepth), 0.0001);
    var visibility = 1.0;

    // Two perspective-correct depth probes reject color leaking through nearer geometry.
    // The result stays soft so a foreground receiver can still pick up stage ambience.
    for (var traceIndex = 1u; traceIndex <= 2u; traceIndex = traceIndex + 1u) {
        let traceT = f32(traceIndex) / 3.0;
        let tracePixel = clamp(
            vec2i(round(mix(vec2f(centerPixel), vec2f(samplePixel), traceT))),
            vec2i(0),
            inputMax
        );
        if (all(tracePixel == centerPixel) || all(tracePixel == samplePixel)) {
            continue;
        }

        let traceDepth = textureLoad(viewDepth, tracePixel, 0).r;
        if (abs(traceDepth) < 0.000001) {
            continue;
        }

        let inverseExpectedDistance = mix(
            1.0 / centerDistance,
            1.0 / sampleDistance,
            traceT
        );
        let expectedDistance = 1.0 / max(inverseExpectedDistance, 0.0001);
        let depthBias = max(expectedDistance * 0.025, 0.02);
        if (abs(traceDepth) + depthBias < expectedDistance) {
            visibility = visibility * 0.45;
        }
    }

    return visibility;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let outputPixel = globalId.xy;
    if (any(outputPixel >= vec2u(params.outputSize))) {
        return;
    }

    let inputMax = max(vec2i(params.inputSize) - vec2i(1), vec2i(0));
    let centerPixel = min(vec2i(outputPixel * 2u + vec2u(1u)), inputMax);
    let centerUv = (vec2f(centerPixel) + vec2f(0.5)) / params.inputSize;
    let centerDepth = textureLoad(viewDepth, centerPixel, 0).r;
    let centerNormalRaw = textureLoad(viewNormal, centerPixel, 0);
    if (centerNormalRaw.a < 0.5 || abs(centerDepth) < 0.000001) {
        textureStore(outputGi, vec2i(outputPixel), vec4f(0.0));
        return;
    }

    let centerNormal = normalize(centerNormalRaw.xyz);
    let centerPosition = reconstructViewPosition(centerUv, centerDepth);
    let baseAngle = fixedPixelRotation(vec2f(outputPixel));
    let radius = clamp(params.sampleRadius, 1.0, 256.0);
    var indirect = vec3f(0.0);
    var weightSum = 0.0;

    // Three fixed slices, both directions, eight widening steps: 48 samples.
    // The rotation depends only on pixel coordinates, never time or frame count.
    for (var sliceIndex = 0u; sliceIndex < 3u; sliceIndex = sliceIndex + 1u) {
        let angle = baseAngle + f32(sliceIndex) * 1.0471975512;
        let sliceDirection = vec2f(cos(angle), sin(angle));
        for (var sideIndex = 0u; sideIndex < 2u; sideIndex = sideIndex + 1u) {
            let side = select(-1.0, 1.0, sideIndex == 1u);
            for (var stepIndex = 1u; stepIndex <= 8u; stepIndex = stepIndex + 1u) {
                let normalizedStep = f32(stepIndex) / 8.0;
                let pixelOffset = sliceDirection
                    * side
                    * radius
                    * normalizedStep
                    * normalizedStep;
                let samplePixel = clamp(
                    centerPixel + vec2i(round(pixelOffset)),
                    vec2i(0),
                    inputMax
                );
                if (all(samplePixel == centerPixel)) {
                    continue;
                }

                let sampleNormalRaw = textureLoad(viewNormal, samplePixel, 0);
                let sampleDepth = textureLoad(viewDepth, samplePixel, 0).r;
                let sourceColor = toLinearSrgb(
                    textureLoad(sceneColor, samplePixel, 0).rgb
                );
                let maxChannel = max(max(sourceColor.r, sourceColor.g), sourceColor.b);
                let minChannel = min(min(sourceColor.r, sourceColor.g), sourceColor.b);
                let chroma = maxChannel - minChannel;
                let saturation = chroma / max(maxChannel, 0.02);
                let chromaPreference = smoothstep(0.08, 0.75, saturation);
                let sourceLuminance = dot(
                    sourceColor,
                    vec3f(0.2126, 0.7152, 0.0722)
                );
                let saturationBoost = mix(
                    1.0,
                    1.45,
                    smoothstep(0.15, 0.85, saturation)
                );
                let saturatedSource = max(
                    vec3f(sourceLuminance)
                        + (sourceColor - vec3f(sourceLuminance)) * saturationBoost,
                    vec3f(0.0)
                );
                // Keep chromatic stage colors dominant, but allow bright neutral
                // surfaces to contribute useful soft-light ambience. The previous
                // fixed 0.035 floor made white and gray almost disappear.
                let neutralLightEvidence = smoothstep(0.02, 0.45, sourceLuminance);
                let neutralContribution = mix(0.18, 0.45, neutralLightEvidence);
                let colorBleedWeight = mix(
                    neutralContribution,
                    1.8,
                    chromaPreference
                );
                let distanceWeight = 1.0 - normalizedStep * 0.65;
                if (sampleNormalRaw.a < 0.5 || abs(sampleDepth) < 0.000001) {
                    // A skydome or background image can carry useful stage color without
                    // participating in the Geometry Renderer. Bright neutral backgrounds
                    // now provide restrained ambience instead of being nearly discarded.
                    let neutralEnvironmentEvidence = mix(
                        0.05,
                        0.18,
                        neutralLightEvidence
                    );
                    let environmentEvidence = mix(
                        neutralEnvironmentEvidence,
                        0.45,
                        chromaPreference
                    );
                    let environmentWeight = environmentEvidence * distanceWeight;
                    indirect = indirect
                        + saturatedSource * environmentWeight * colorBleedWeight;
                    weightSum = weightSum + environmentWeight;
                    continue;
                }

                let sampleUv = (vec2f(samplePixel) + vec2f(0.5)) / params.inputSize;
                let samplePosition = reconstructViewPosition(sampleUv, sampleDepth);
                let sampleNormal = normalize(sampleNormalRaw.xyz);
                let receiverToSource = samplePosition - centerPosition;
                let viewDistance = max(length(receiverToSource), 0.0001);
                let receiverDirection = receiverToSource / viewDistance;
                let relativeDepth = abs(sampleDepth - centerDepth)
                    / max(abs(centerDepth), 0.1);
                let normalDifference = 1.0
                    - clamp(dot(centerNormal, sampleNormal), -1.0, 1.0);

                let depthFalloff = mix(2.2, 1.1, chromaPreference);
                let depthCompatibility = exp(
                    -max(relativeDepth - params.thickness, 0.0) * depthFalloff
                );
                let edgeEvidence = clamp(
                    smoothstep(0.001, 0.025, relativeDepth)
                    + smoothstep(0.04, 0.35, normalDifference),
                    0.0,
                    1.0
                );
                let neutralSurfaceEvidence = mix(
                    0.16,
                    0.30,
                    neutralLightEvidence
                );
                let surfaceEvidence = max(
                    edgeEvidence,
                    mix(neutralSurfaceEvidence, 0.55, chromaPreference)
                );
                let receiverFacing = mix(
                    0.40,
                    1.0,
                    smoothstep(-0.35, 0.70, dot(centerNormal, receiverDirection))
                );
                let sourceFacing = mix(
                    0.40,
                    1.0,
                    smoothstep(-0.45, 0.60, dot(sampleNormal, -receiverDirection))
                );
                let visibility = traceScreenSpaceVisibility(
                    centerPixel,
                    samplePixel,
                    centerDepth,
                    sampleDepth,
                    inputMax
                );
                let weight = depthCompatibility
                    * surfaceEvidence
                    * receiverFacing
                    * sourceFacing
                    * distanceWeight
                    * visibility;
                if (weight <= 0.00001) {
                    continue;
                }

                indirect = indirect
                    + saturatedSource * weight * colorBleedWeight;
                weightSum = weightSum + weight;
            }
        }
    }

    if (weightSum <= 0.00001) {
        textureStore(outputGi, vec2i(outputPixel), vec4f(0.0));
        return;
    }

    let averagedIndirect = clamp(indirect / weightSum, vec3f(0.0), vec3f(2.0));
    let confidence = clamp(weightSum / 3.0, 0.0, 1.0);
    textureStore(outputGi, vec2i(outputPixel), vec4f(averagedIndirect, confidence));
}
`;

export const FRAME_GRAPH_SSGI_DENOISE_COMPUTE_WGSL = `
struct SsgiDenoiseParams {
    fullSize: vec2f,
    halfSize: vec2f,
    stepWidth: f32,
    padding: vec3f,
};

@group(0) @binding(0) var inputGi: texture_2d<f32>;
@group(0) @binding(1) var sceneColor: texture_2d<f32>;
@group(0) @binding(2) var viewDepth: texture_2d<f32>;
@group(0) @binding(3) var viewNormal: texture_2d<f32>;
@group(0) @binding(4) var outputGi: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<uniform> params: SsgiDenoiseParams;

fn srgbChannelToLinear(channel: f32) -> f32 {
    let value = clamp(channel, 0.0, 1.0);
    return select(
        value / 12.92,
        pow((value + 0.055) / 1.055, 2.4),
        value > 0.04045
    );
}

fn toLinearSrgb(color: vec3f) -> vec3f {
    return vec3f(
        srgbChannelToLinear(color.r),
        srgbChannelToLinear(color.g),
        srgbChannelToLinear(color.b)
    );
}

fn luminance(color: vec3f) -> f32 {
    return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

fn kernelWeight(offset: i32) -> f32 {
    let distance = abs(offset);
    if (distance == 0) {
        return 6.0;
    }
    if (distance == 1) {
        return 4.0;
    }
    return 1.0;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let outputPixel = globalId.xy;
    if (any(outputPixel >= vec2u(params.halfSize))) {
        return;
    }

    let fullMax = max(vec2i(params.fullSize) - vec2i(1), vec2i(0));
    let halfMax = max(vec2i(params.halfSize) - vec2i(1), vec2i(0));
    let centerHalfPixel = vec2i(outputPixel);
    let centerGuidePixel = min(centerHalfPixel * 2 + vec2i(1), fullMax);
    let centerDepth = textureLoad(viewDepth, centerGuidePixel, 0).r;
    let centerNormalRaw = textureLoad(viewNormal, centerGuidePixel, 0);
    if (centerNormalRaw.a < 0.5 || abs(centerDepth) < 0.000001) {
        textureStore(outputGi, centerHalfPixel, vec4f(0.0));
        return;
    }

    let centerNormal = normalize(centerNormalRaw.xyz);
    let centerGuideColor = toLinearSrgb(
        textureLoad(sceneColor, centerGuidePixel, 0).rgb
    );
    let centerLuminance = luminance(centerGuideColor);
    let centerChroma = centerGuideColor - vec3f(centerLuminance);
    let stepWidth = max(i32(round(params.stepWidth)), 1);
    let depthScale = max(abs(centerDepth) * 0.015, 0.02)
        * (1.0 + f32(stepWidth) * 0.18);
    let colorScale = 0.30 + f32(stepWidth) * 0.025;
    var filteredRadiance = vec3f(0.0);
    var radianceWeightSum = 0.0;
    var confidenceSum = 0.0;
    var guideWeightSum = 0.0;

    // Separable 5x5 binomial kernel with depth, normal, and scene-color guides.
    // The three fixed step widths (1, 2, 4) form a deterministic A-Trous filter.
    for (var offsetY = -2; offsetY <= 2; offsetY = offsetY + 1) {
        for (var offsetX = -2; offsetX <= 2; offsetX = offsetX + 1) {
            let sampleHalfPixel = clamp(
                centerHalfPixel + vec2i(offsetX, offsetY) * stepWidth,
                vec2i(0),
                halfMax
            );
            let sampleGuidePixel = min(sampleHalfPixel * 2 + vec2i(1), fullMax);
            let sampleDepth = textureLoad(viewDepth, sampleGuidePixel, 0).r;
            let sampleNormalRaw = textureLoad(viewNormal, sampleGuidePixel, 0);
            if (sampleNormalRaw.a < 0.5 || abs(sampleDepth) < 0.000001) {
                continue;
            }

            let sampleNormal = normalize(sampleNormalRaw.xyz);
            let sampleGuideColor = toLinearSrgb(
                textureLoad(sceneColor, sampleGuidePixel, 0).rgb
            );
            let sampleLuminance = luminance(sampleGuideColor);
            let sampleChroma = sampleGuideColor - vec3f(sampleLuminance);
            let depthSimilarity = exp(
                -abs(abs(sampleDepth) - abs(centerDepth)) / depthScale
            );
            let normalSimilarity = pow(
                max(dot(centerNormal, sampleNormal), 0.0),
                8.0
            );
            let luminanceDifference = abs(sampleLuminance - centerLuminance);
            let chromaDifference = length(sampleChroma - centerChroma);
            let colorSimilarity = exp(
                -luminanceDifference / (colorScale * 1.25)
                -chromaDifference / colorScale
            );
            let spatialWeight = kernelWeight(offsetX) * kernelWeight(offsetY);
            let guideWeight = spatialWeight
                * depthSimilarity
                * normalSimilarity
                * colorSimilarity;
            if (guideWeight <= 0.000001) {
                continue;
            }

            guideWeightSum = guideWeightSum + guideWeight;
            let sampleGi = textureLoad(inputGi, sampleHalfPixel, 0);
            let sampleConfidence = clamp(sampleGi.a, 0.0, 1.0);
            confidenceSum = confidenceSum + guideWeight * sampleConfidence;
            if (sampleConfidence <= 0.000001) {
                continue;
            }

            let radianceWeight = guideWeight
                * mix(0.20, 1.0, sampleConfidence);
            filteredRadiance = filteredRadiance + sampleGi.rgb * radianceWeight;
            radianceWeightSum = radianceWeightSum + radianceWeight;
        }
    }

    if (radianceWeightSum <= 0.000001 || guideWeightSum <= 0.000001) {
        textureStore(outputGi, centerHalfPixel, vec4f(0.0));
        return;
    }

    let radiance = clamp(
        filteredRadiance / radianceWeightSum,
        vec3f(0.0),
        vec3f(2.0)
    );
    let confidence = clamp(confidenceSum / guideWeightSum, 0.0, 1.0);
    textureStore(outputGi, centerHalfPixel, vec4f(radiance, confidence));
}
`;

export function ensureFrameGraphSsgiShaders(): void {
    const shaderKey = "mmdFrameGraphSsgiCompositePixelShader";
    if (ShaderStore.ShadersStoreWGSL[shaderKey]) {
        return;
    }

    ShaderStore.ShadersStoreWGSL[shaderKey] = `
        varying vUV: vec2f;
        var textureSamplerSampler: sampler;
        var textureSampler: texture_2d<f32>;
        var ssgiTextureSampler: sampler;
        var ssgiTexture: texture_2d<f32>;
        var viewDepthTextureSampler: sampler;
        var viewDepthTexture: texture_2d<f32>;
        var viewNormalTextureSampler: sampler;
        var viewNormalTexture: texture_2d<f32>;
        uniform strength: f32;
        uniform blendMode: f32;

        fn srgbChannelToLinear(channel: f32) -> f32 {
            let value = clamp(channel, 0.0, 1.0);
            return select(
                value / 12.92,
                pow((value + 0.055) / 1.055, 2.4),
                value > 0.04045
            );
        }

        fn toLinearSrgb(color: vec3f) -> vec3f {
            return vec3f(
                srgbChannelToLinear(color.r),
                srgbChannelToLinear(color.g),
                srgbChannelToLinear(color.b)
            );
        }

        fn linearChannelToSrgb(channel: f32) -> f32 {
            let value = clamp(channel, 0.0, 1.0);
            return select(
                value * 12.92,
                1.055 * pow(value, 1.0 / 2.4) - 0.055,
                value > 0.0031308
            );
        }

        fn toDisplaySrgb(color: vec3f) -> vec3f {
            return vec3f(
                linearChannelToSrgb(color.r),
                linearChannelToSrgb(color.g),
                linearChannelToSrgb(color.b)
            );
        }

        fn softLightChannel(base: f32, blend: f32) -> f32 {
            if (blend <= 0.5) {
                return base - (1.0 - 2.0 * blend) * base * (1.0 - base);
            }

            var curve = sqrt(max(base, 0.0));
            if (base <= 0.25) {
                curve = ((16.0 * base - 12.0) * base + 4.0) * base;
            }
            return base + (2.0 * blend - 1.0) * (curve - base);
        }

        fn softLightBlend(base: vec3f, blend: vec3f) -> vec3f {
            return vec3f(
                softLightChannel(base.r, blend.r),
                softLightChannel(base.g, blend.g),
                softLightChannel(base.b, blend.b)
            );
        }

        fn overlayBlend(base: vec3f, blend: vec3f) -> vec3f {
            return select(
                2.0 * base * blend,
                1.0 - 2.0 * (1.0 - base) * (1.0 - blend),
                base > vec3f(0.5)
            );
        }

        #define CUSTOM_FRAGMENT_DEFINITIONS
        @fragment
        fn main(input: FragmentInputs)->FragmentOutputs {
            let source = textureSampleLevel(
                textureSampler,
                textureSamplerSampler,
                input.vUV,
                0.0
            );
            let contributionStrength = clamp(uniforms.strength, 0.0, 1.0);
            if (contributionStrength <= 0.00001) {
                fragmentOutputs.color = source;
                return fragmentOutputs;
            }

            let fullSize = vec2i(textureDimensions(viewDepthTexture));
            let halfSize = vec2i(textureDimensions(ssgiTexture));
            let fullMax = max(fullSize - vec2i(1), vec2i(0));
            let halfMax = max(halfSize - vec2i(1), vec2i(0));
            let centerPixel = clamp(vec2i(input.vUV * vec2f(fullSize)), vec2i(0), fullMax);
            let centerDepth = textureLoad(viewDepthTexture, centerPixel, 0).r;
            let centerNormalRaw = textureLoad(viewNormalTexture, centerPixel, 0);
            if (centerNormalRaw.a < 0.5 || abs(centerDepth) < 0.000001) {
                fragmentOutputs.color = source;
                return fragmentOutputs;
            }

            let centerNormal = normalize(centerNormalRaw.xyz);
            let halfPosition = input.vUV * vec2f(halfSize) - vec2f(0.5);
            let halfBase = vec2i(floor(halfPosition));
            var weightedIndirect = vec3f(0.0);
            var weightSum = 0.0;
            var guideSum = 0.0;

            for (var y = 0; y < 2; y = y + 1) {
                for (var x = 0; x < 2; x = x + 1) {
                    let halfPixel = clamp(halfBase + vec2i(x, y), vec2i(0), halfMax);
                    let halfDelta = abs(vec2f(halfPixel) - halfPosition);
                    let spatialWeight = max(0.0, 1.0 - halfDelta.x)
                        * max(0.0, 1.0 - halfDelta.y);
                    if (spatialWeight <= 0.00001) {
                        continue;
                    }

                    let guideUv = (vec2f(halfPixel) + vec2f(0.5)) / vec2f(halfSize);
                    let guidePixel = clamp(vec2i(guideUv * vec2f(fullSize)), vec2i(0), fullMax);
                    let guideDepth = textureLoad(viewDepthTexture, guidePixel, 0).r;
                    let guideNormalRaw = textureLoad(viewNormalTexture, guidePixel, 0);
                    let gi = textureLoad(ssgiTexture, halfPixel, 0);
                    if (guideNormalRaw.a < 0.5 || gi.a <= 0.00001) {
                        continue;
                    }

                    let guideNormal = normalize(guideNormalRaw.xyz);
                    let depthScale = max(abs(centerDepth) * 0.04, 0.03);
                    let depthSimilarity = exp(-abs(guideDepth - centerDepth) / depthScale);
                    let normalSimilarity = pow(
                        max(dot(centerNormal, guideNormal), 0.0),
                        3.0
                    );
                    let guideWeight = spatialWeight * depthSimilarity * normalSimilarity;
                    guideSum = guideSum + guideWeight;
                    let contributionWeight = guideWeight * gi.a;
                    weightedIndirect = weightedIndirect + gi.rgb * contributionWeight;
                    weightSum = weightSum + contributionWeight;
                }
            }

            var indirect = vec3f(0.0);
            var confidence = 0.0;
            if (weightSum > 0.00001) {
                indirect = weightedIndirect / weightSum;
                confidence = clamp(weightSum / max(guideSum, 0.00001), 0.0, 1.0);
            } else {
                let nearestHalfPixel = clamp(
                    vec2i(input.vUV * vec2f(halfSize)),
                    vec2i(0),
                    halfMax
                );
                let nearestGi = textureLoad(ssgiTexture, nearestHalfPixel, 0);
                indirect = nearestGi.rgb;
                confidence = nearestGi.a * 0.50;
            }

            let sourceLinear = toLinearSrgb(source.rgb);
            if (uniforms.blendMode < 0.5) {
                let combinedLinear = sourceLinear
                    + indirect * contributionStrength * confidence;
                fragmentOutputs.color = vec4f(
                    toDisplaySrgb(combinedLinear),
                    source.a
                );
                return fragmentOutputs;
            }

            let indirectPeak = max(max(indirect.r, indirect.g), indirect.b);
            if (indirectPeak <= 0.00001) {
                fragmentOutputs.color = source;
                return fragmentOutputs;
            }

            // Artistic blend modes treat GI as a color layer instead of energy.
            // Peak normalization preserves hue while confidence and radiance evidence
            // control opacity. Pure white remains white in both blend formulas.
            let blendColor = toDisplaySrgb(clamp(
                indirect / indirectPeak,
                vec3f(0.0),
                vec3f(1.0)
            ));
            let sourceDisplay = clamp(source.rgb, vec3f(0.0), vec3f(1.0));
            var blendedDisplay = softLightBlend(sourceDisplay, blendColor);
            if (uniforms.blendMode >= 1.5) {
                blendedDisplay = overlayBlend(sourceDisplay, blendColor);
            }
            let radianceEvidence = smoothstep(0.015, 0.35, indirectPeak);
            let blendOpacity = contributionStrength
                * confidence
                * radianceEvidence;
            fragmentOutputs.color = vec4f(
                mix(sourceDisplay, blendedDisplay, blendOpacity),
                source.a
            );
            return fragmentOutputs;
        }
    `;
}
