import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

export function ensureSimpleSsaoShader(): void {
        const shaderKey = "mmdSimpleSsaoFragmentShader";
        if (!Effect.ShadersStore[shaderKey]) {
            Effect.ShadersStore[shaderKey] = `
                precision highp float;
                varying vec2 vUV;
                uniform sampler2D textureSampler;
                uniform sampler2D depthSampler;
                uniform float ssaoStrength;
                uniform float ssaoRadius;
                uniform float ssaoDebugView;
                uniform float ssaoTintMode;
                uniform vec2 screenSize;
                uniform vec2 cameraNearFar;
                uniform mat4 inverseViewProjection;
                uniform vec2 worldFadeMeters;

                float readDepthMetric(vec2 uv) {
                    return abs(texture2D(depthSampler, clamp(uv, vec2(0.001), vec2(0.999))).r);
                }

                vec2 directionForIndex(int index) {
                    if (index == 0) return vec2(1.0, 0.0);
                    if (index == 1) return vec2(0.8660, 0.5);
                    if (index == 2) return vec2(0.5, 0.8660);
                    if (index == 3) return vec2(0.0, 1.0);
                    if (index == 4) return vec2(-0.5, 0.8660);
                    if (index == 5) return vec2(-0.8660, 0.5);
                    if (index == 6) return vec2(-1.0, 0.0);
                    if (index == 7) return vec2(-0.8660, -0.5);
                    if (index == 8) return vec2(-0.5, -0.8660);
                    if (index == 9) return vec2(0.0, -1.0);
                    if (index == 10) return vec2(0.5, -0.8660);
                    return vec2(0.8660, -0.5);
                }
                vec3 pseudoNormalFromSlope(vec2 slope) {
                    return normalize(vec3(-slope.x * 96.0, -slope.y * 96.0, 1.0));
                }
                vec3 pseudoNormalAt(vec2 uv, vec2 texel) {
                    float l = readDepthMetric(uv - vec2(texel.x, 0.0));
                    float r = readDepthMetric(uv + vec2(texel.x, 0.0));
                    float d = readDepthMetric(uv - vec2(0.0, texel.y));
                    float u = readDepthMetric(uv + vec2(0.0, texel.y));
                    return pseudoNormalFromSlope(vec2((r - l) * 0.5, (u - d) * 0.5));
                }
                float computeAoLiteAt(vec2 uv, vec2 texel, float radiusNorm, float strength) {
                    float cDepth = readDepthMetric(uv);
                    if (cDepth <= 0.00001) {
                        return 0.0;
                    }

                    float nL = readDepthMetric(uv - vec2(texel.x, 0.0));
                    float nR = readDepthMetric(uv + vec2(texel.x, 0.0));
                    float nD = readDepthMetric(uv - vec2(0.0, texel.y));
                    float nU = readDepthMetric(uv + vec2(0.0, texel.y));

                    float nGrad = max(max(abs(nR - nL), abs(nU - nD)), 0.00003);
                    vec2 nSlopePerPx = vec2((nR - nL) * 0.5, (nU - nD) * 0.5);
                    float resolutionScale = 1.0 / max(texel.y * 1080.0, 0.0001);
                    float stepPx = mix(1.0, 4.6, radiusNorm) * resolutionScale;
                    vec2 stepVec = texel * stepPx;
                    float nNear = min(min(nL, nR), min(nD, nU));
                    float nMicro = smoothstep(
                        nGrad * 0.06 + 0.00001,
                        nGrad * 0.95 + 0.00025,
                        cDepth - nNear
                    );

                    float occ = 0.0;
                    float occWide = 0.0;
                    float w = 0.0;
                    float wWide = 0.0;
                    for (int j = 0; j < 6; ++j) {
                        vec2 dir = directionForIndex(j * 2);
                        vec2 suv = clamp(uv + dir * stepVec, vec2(0.001), vec2(0.999));
                        float sd = readDepthMetric(suv);
                        if (sd <= 0.00001) {
                            continue;
                        }

                        float expectedDepth = cDepth + dot(nSlopePerPx, dir * stepPx);
                        float planeDelta = expectedDepth - sd;
                        float gradientAllowance = nGrad * max(1.0, stepPx);
                        float lo = gradientAllowance * 0.08 + 0.00001;
                        float mid = gradientAllowance * 0.72 + 0.00012;
                        float hi = gradientAllowance * 2.0 + 0.00035;
                        float pos = smoothstep(lo, mid, planeDelta);
                        float shallow = 1.0 - smoothstep(mid, hi, planeDelta);
                        float reject = 1.0 - smoothstep(hi * 1.6, hi * 4.5, abs(planeDelta));
                        float wide = smoothstep(lo * 0.55, mid * 1.35, planeDelta)
                            * (1.0 - smoothstep(hi * 1.8, hi * 6.5, planeDelta))
                            * (1.0 - smoothstep(hi * 3.5, hi * 7.5, abs(planeDelta)));
                        occ += pos * shallow * reject;
                        occWide += wide;
                        w += 1.0;
                        wWide += 1.0;
                    }

                    float raw = occ / max(w, 0.0001);
                    float rawWide = occWide / max(wWide, 0.0001);
                    float combined = clamp(raw * 0.28 + rawWide * 1.28 + nMicro * 0.04, 0.0, 1.0);
                    float a = clamp(pow(combined, 1.8) * strength * 1.55, 0.0, 1.0);
                    float distFade = 1.0 - smoothstep(worldFadeMeters.x * 0.35, worldFadeMeters.y * 0.95, cDepth);
                    a *= distFade;
                    return a;
                }


                void main(void) {
                    vec4 color = texture2D(textureSampler, vUV);
                    vec2 safeScreen = max(screenSize, vec2(1.0));
                    vec2 texel = 1.0 / safeScreen;
                    float debugView = step(0.5, ssaoDebugView);
                    float resolutionScale = min(safeScreen.x, safeScreen.y) / 1080.0;

                    float centerDepth = readDepthMetric(vUV);
                    if (centerDepth <= 0.00001 || ssaoStrength <= 0.00001) {
                        vec3 fallbackColor = mix(color.rgb, vec3(1.0), debugView);
                        gl_FragColor = vec4(fallbackColor, color.a);
                        return;
                    }

                    float dL = readDepthMetric(vUV - vec2(texel.x, 0.0));
                    float dR = readDepthMetric(vUV + vec2(texel.x, 0.0));
                    float dD = readDepthMetric(vUV - vec2(0.0, texel.y));
                    float dU = readDepthMetric(vUV + vec2(0.0, texel.y));

                    float depthGrad = max(max(abs(dR - dL), abs(dU - dD)), 0.00003);
                    vec2 depthSlopePerPx = vec2((dR - dL) * 0.5, (dU - dD) * 0.5);
                    float radiusNorm = clamp((ssaoRadius - 0.25) / 2.1, 0.0, 1.0);
                    float sampleRadiusPx = mix(0.85, 4.2, radiusNorm) * resolutionScale;
                    vec2 baseStep = texel * sampleRadiusPx;
                    float nearDepth = min(min(dL, dR), min(dD, dU));
                    float microCavity = smoothstep(
                        depthGrad * 0.16 + 0.00004,
                        depthGrad * 1.55 + 0.0006,
                        centerDepth - nearDepth
                    );

                    float occlusion = 0.0;
                    float enclosure = 0.0;
                    float totalWeight = 0.0;
                    float totalEnclosureWeight = 0.0;

                    for (int ring = 1; ring <= 4; ++ring) {
                        float ringFactor = float(ring) / 4.0;
                        float ringWeight = mix(1.15, 0.5, ringFactor);
                        float enclosureWeight = mix(1.35, 0.65, ringFactor);

                        for (int i = 0; i < 12; ++i) {
                            vec2 dir = directionForIndex(i);
                            vec2 offPx = dir * sampleRadiusPx * ringFactor;
                            vec2 off = dir * baseStep * ringFactor;
                            float sampleSpanPx = max(1.0, sampleRadiusPx * ringFactor);
                            vec2 sampleUv = clamp(vUV + off, vec2(0.001), vec2(0.999));
                            float sampleDepth = readDepthMetric(sampleUv);
                            if (sampleDepth <= 0.00001) {
                                continue;
                            }

                            float expectedDepth = centerDepth + dot(depthSlopePerPx, offPx);
                            float planeDelta = expectedDepth - sampleDepth;
                            float gradientAllowance = depthGrad * sampleSpanPx;
                            float shallowLo = gradientAllowance * (0.22 + ringFactor * 0.22) + 0.00004;
                            float shallowMid = gradientAllowance * (1.7 + ringFactor * 1.35) + (0.00026 + ringFactor * 0.00034);
                            float shallowHi = gradientAllowance * (4.0 + ringFactor * 2.6) + (0.00078 + ringFactor * 0.00105);
                            float positiveGate = smoothstep(shallowLo, shallowMid, planeDelta);
                            float shallowGate = 1.0 - smoothstep(shallowMid, shallowHi, planeDelta);
                            float largeGapReject = 1.0 - smoothstep(shallowHi * 1.18, shallowHi * 3.0, abs(planeDelta));
                            float contrib = positiveGate * shallowGate * largeGapReject * ringWeight;
                            float enclosureGate = smoothstep(shallowLo * 0.55, shallowMid * 1.28, planeDelta)
                                * (1.0 - smoothstep(shallowHi * 1.75, shallowHi * 6.5, planeDelta))
                                * (1.0 - smoothstep(shallowHi * 3.2, shallowHi * 7.0, abs(planeDelta)));
                            occlusion += contrib;
                            enclosure += enclosureGate * enclosureWeight;
                            totalWeight += ringWeight;
                            totalEnclosureWeight += enclosureWeight;
                        }
                    }

                    float aoRaw = occlusion / max(totalWeight, 0.0001);
                    float enclosureRaw = enclosure / max(totalEnclosureWeight, 0.0001);
                    float aoDetail = clamp(
                        pow(clamp(aoRaw * 0.95 + microCavity * 0.04, 0.0, 1.0), 1.75) * ssaoStrength * 0.05,
                        0.0,
                        0.18
                    );
                    float aoBroad = clamp(
                        pow(clamp(enclosureRaw * 1.36 + aoRaw * 0.14 + microCavity * 0.03, 0.0, 1.0), 1.62) * ssaoStrength * 1.26,
                        0.0,
                        0.98
                    );
                    float aoDistanceFade = 1.0 - smoothstep(worldFadeMeters.x * 0.35, worldFadeMeters.y * 0.95, centerDepth);
                    aoDetail *= aoDistanceFade;
                    aoBroad *= aoDistanceFade;

                    float slopeX = dR - dL;
                    float slopeY = dU - dD;
                    vec3 centerPseudoNormal = pseudoNormalFromSlope(vec2(slopeX * 0.5, slopeY * 0.5));
                    float slopeLen2 = slopeX * slopeX + slopeY * slopeY;
                    float normalZ = 1.0 / sqrt(1.0 + slopeLen2 * 9800.0);
                    float frontFactor = smoothstep(0.28, 0.9, normalZ);
                    float detailFacing = smoothstep(0.5, 0.985, normalZ);
                    float depthEdgeSuppression = 1.0 - smoothstep(0.00045, 0.0028, depthGrad);
                    float farFactor = smoothstep(worldFadeMeters.x * 0.18, worldFadeMeters.y * 0.7, centerDepth);
                    float distanceSoftness = smoothstep(worldFadeMeters.x * 0.08, worldFadeMeters.y * 0.55, centerDepth);
                    float frontFarFactor = frontFactor * farFactor;
                    float blurFactor = clamp(max(farFactor * 0.55, frontFarFactor * 1.2), 0.0, 1.0);
                    blurFactor = blurFactor * blurFactor * (3.0 - 2.0 * blurFactor);
                    float silhouetteSuppression = 1.0 - smoothstep(0.0003, 0.0019, depthGrad * (1.0 + blurFactor * 1.4));
                    silhouetteSuppression *= silhouetteSuppression;
                    aoDetail *= detailFacing * depthEdgeSuppression * mix(1.0, 0.08, distanceSoftness);

                    float blurRadiusPx = mix(3.4, 18.0, blurFactor);
                    float blurRadiusPxWide = blurRadiusPx * mix(2.4, 4.8, blurFactor);
                    float blurAo = aoBroad;
                    float blurWeight = 1.0;
                    float depthSigma = depthGrad * mix(10.0, 60.0, blurFactor) + mix(0.018, 0.42, blurFactor);
                    for (int k = 0; k < 12; ++k) {
                        vec2 bDir = directionForIndex(k);
                        vec2 bUv = clamp(vUV + bDir * texel * blurRadiusPx, vec2(0.001), vec2(0.999));
                        float bDepth = readDepthMetric(bUv);
                        if (bDepth > 0.00001) {
                            vec3 bPseudoNormal = pseudoNormalAt(bUv, texel);
                            float normalWeight = smoothstep(0.42, 0.995, dot(centerPseudoNormal, bPseudoNormal));
                            float depthWeight = exp(-abs(bDepth - centerDepth) / depthSigma) * normalWeight;
                            float neighborAo = computeAoLiteAt(bUv, texel, radiusNorm, ssaoStrength);
                            blurAo += neighborAo * depthWeight;
                            blurWeight += depthWeight;
                        }

                        vec2 bUvWide = clamp(vUV + bDir * texel * blurRadiusPxWide, vec2(0.001), vec2(0.999));
                        float bDepthWide = readDepthMetric(bUvWide);
                        if (bDepthWide > 0.00001) {
                            vec3 bPseudoNormalWide = pseudoNormalAt(bUvWide, texel);
                            float normalWeightWide = smoothstep(0.36, 0.992, dot(centerPseudoNormal, bPseudoNormalWide));
                            float depthWeightWide = exp(-abs(bDepthWide - centerDepth) / (depthSigma * 1.35)) * normalWeightWide;
                            float neighborAoWide = computeAoLiteAt(bUvWide, texel, radiusNorm, ssaoStrength);
                            blurAo += neighborAoWide * depthWeightWide * 0.95;
                            blurWeight += depthWeightWide * 0.95;
                        }
                    }
                    float aoBlurred = blurAo / max(blurWeight, 0.0001);
                    aoBroad = mix(aoBroad * mix(0.9, 0.62, blurFactor), aoBlurred, mix(0.93, 0.999, blurFactor));
                    aoBroad *= mix(0.16, 1.0, silhouetteSuppression) * mix(0.86, 1.0, frontFactor);
                    float ao = clamp(aoBroad + aoDetail * mix(0.035, 0.006, max(blurFactor, distanceSoftness)), 0.0, 0.98);
                    float worldDistance = centerDepth;
                    float aoWorldOpacity = 1.0 - smoothstep(worldFadeMeters.x, worldFadeMeters.y, worldDistance);
                    ao *= aoWorldOpacity;

                    float aoApplied = 1.0 - pow(1.0 - clamp(ao * 7.0, 0.0, 0.998), 1.15);
                    float maskBlurRadiusPx = mix(1.2, 4.6, blurFactor) * mix(0.95, 1.7, farFactor);
                    float maskBlur = aoApplied;
                    float maskBlurWeight = 1.0;
                    float maskDepthSigma = depthSigma * 0.7 + 0.0005;
                    for (int m = 0; m < 12; ++m) {
                        vec2 mDir = directionForIndex(m);
                        vec2 mUv = clamp(vUV + mDir * texel * maskBlurRadiusPx, vec2(0.001), vec2(0.999));
                        float mDepth = readDepthMetric(mUv);
                        if (mDepth > 0.00001) {
                            vec3 mPseudoNormal = pseudoNormalAt(mUv, texel);
                            float mNormalWeight = smoothstep(0.48, 0.996, dot(centerPseudoNormal, mPseudoNormal));
                            float mDepthWeight = exp(-abs(mDepth - centerDepth) / maskDepthSigma) * mNormalWeight;
                            float neighborAo = computeAoLiteAt(mUv, texel, radiusNorm, ssaoStrength);
                            float neighborApplied = 1.0 - pow(1.0 - clamp(neighborAo * 4.2, 0.0, 0.992), 1.05);
                            neighborApplied = mix(aoApplied, neighborApplied, 0.14);
                            maskBlur += neighborApplied * mDepthWeight;
                            maskBlurWeight += mDepthWeight;
                        }
                    }
                    float maskSmoothFactor = clamp(0.24 + blurFactor * 0.46 + farFactor * 0.2, 0.0, 0.82);
                    aoApplied = mix(aoApplied, maskBlur / max(maskBlurWeight, 0.0001), maskSmoothFactor);
                    float aoAppliedMin = aoApplied;
                    float aoAppliedMax = aoApplied;
                    float aoAppliedMean = aoApplied;
                    float aoAppliedCount = 1.0;
                    for (int n = 0; n < 4; ++n) {
                        vec2 nDir = directionForIndex(n * 3);
                        vec2 nUv = clamp(vUV + nDir * texel * mix(0.9, 2.0, blurFactor), vec2(0.001), vec2(0.999));
                        float nDepth = readDepthMetric(nUv);
                        if (nDepth > 0.00001) {
                            float nDepthWeight = exp(-abs(nDepth - centerDepth) / (maskDepthSigma * 0.85 + 0.0002));
                            float nAo = computeAoLiteAt(nUv, texel, radiusNorm, ssaoStrength);
                            float nApplied = 1.0 - pow(1.0 - clamp(nAo * 4.2, 0.0, 0.992), 1.05);
                            nApplied = mix(aoApplied, nApplied, 0.12) * nDepthWeight + aoApplied * (1.0 - nDepthWeight);
                            aoAppliedMin = min(aoAppliedMin, nApplied);
                            aoAppliedMax = max(aoAppliedMax, nApplied);
                            aoAppliedMean += nApplied;
                            aoAppliedCount += 1.0;
                        }
                    }
                    float aoAppliedAvg = aoAppliedMean / max(aoAppliedCount, 1.0);
                    float aoAppliedClampHi = mix(aoAppliedAvg, aoAppliedMax, 0.45);
                    aoApplied = clamp(aoApplied, aoAppliedMin * 0.92, aoAppliedClampHi);

                    float aoMask = 1.0 - aoApplied;
                    vec3 baseColor = clamp(color.rgb, 0.0, 1.0);
                    float baseMax = max(max(baseColor.r, baseColor.g), baseColor.b);
                    float baseMin = min(min(baseColor.r, baseColor.g), baseColor.b);
                    float baseChroma = baseMax - baseMin;
                    float hueValidity = smoothstep(0.16, 0.52, baseMax) * smoothstep(0.05, 0.24, baseChroma);
                    vec3 toneHue = baseColor / max(baseMax, 0.0001);
                    vec3 neutralToon = vec3(0.74);
                    vec3 coloredToon = mix(vec3(0.68), toneHue, 0.32);
                    vec3 toonTint = mix(neutralToon, coloredToon, hueValidity);
                    vec3 selfMultiply = color.rgb * mix(vec3(1.0), toonTint, vec3(aoApplied));
                    vec3 blackMultiply = color.rgb * aoMask;
                    vec3 aoComposite = mix(blackMultiply, selfMultiply, clamp(ssaoTintMode, 0.0, 1.0));
                    vec3 shaded = mix(aoComposite, vec3(aoMask), debugView);
                    gl_FragColor = vec4(shaded, color.a);
                }
            `;
        }

        if (!ShaderStore.ShadersStoreWGSL[shaderKey]) {
            ShaderStore.ShadersStoreWGSL[shaderKey] = `
                varying vUV: vec2f;
                var textureSamplerSampler: sampler;
                var textureSampler: texture_2d<f32>;
                var depthSamplerSampler: sampler;
                var depthSampler: texture_2d<f32>;
                uniform ssaoStrength: f32;
                uniform ssaoRadius: f32;
                uniform ssaoDebugView: f32;
                uniform ssaoTintMode: f32;
                uniform screenSize: vec2f;
                uniform cameraNearFar: vec2f;
                uniform inverseViewProjection: mat4x4f;
                uniform worldFadeMeters: vec2f;

                fn readDepthMetric(uv: vec2f) -> f32 {
                    return abs(textureSampleLevel(depthSampler, depthSamplerSampler, clamp(uv, vec2f(0.001), vec2f(0.999)), 0.0).r);
                }

                fn directionForIndex(index: i32) -> vec2f {
                    switch index {
                        case 0: { return vec2f(1.0, 0.0); }
                        case 1: { return vec2f(0.8660, 0.5); }
                        case 2: { return vec2f(0.5, 0.8660); }
                        case 3: { return vec2f(0.0, 1.0); }
                        case 4: { return vec2f(-0.5, 0.8660); }
                        case 5: { return vec2f(-0.8660, 0.5); }
                        case 6: { return vec2f(-1.0, 0.0); }
                        case 7: { return vec2f(-0.8660, -0.5); }
                        case 8: { return vec2f(-0.5, -0.8660); }
                        case 9: { return vec2f(0.0, -1.0); }
                        case 10: { return vec2f(0.5, -0.8660); }
                        default: { return vec2f(0.8660, -0.5); }
                    }
                }
                fn pseudoNormalFromSlope(slope: vec2f) -> vec3f {
                    return normalize(vec3f(-slope.x * 96.0, -slope.y * 96.0, 1.0));
                }
                fn pseudoNormalAt(uv: vec2f, texel: vec2f) -> vec3f {
                    let l = readDepthMetric(uv - vec2f(texel.x, 0.0));
                    let r = readDepthMetric(uv + vec2f(texel.x, 0.0));
                    let d = readDepthMetric(uv - vec2f(0.0, texel.y));
                    let u = readDepthMetric(uv + vec2f(0.0, texel.y));
                    return pseudoNormalFromSlope(vec2f((r - l) * 0.5, (u - d) * 0.5));
                }
                fn computeAoLiteAt(uv: vec2f, texel: vec2f, radiusNorm: f32, strength: f32) -> f32 {
                    let cDepth = readDepthMetric(uv);
                    if (cDepth <= 0.00001) {
                        return 0.0;
                    }

                    let nL = readDepthMetric(uv - vec2f(texel.x, 0.0));
                    let nR = readDepthMetric(uv + vec2f(texel.x, 0.0));
                    let nD = readDepthMetric(uv - vec2f(0.0, texel.y));
                    let nU = readDepthMetric(uv + vec2f(0.0, texel.y));

                    let nGrad = max(max(abs(nR - nL), abs(nU - nD)), 0.00003);
                    let nSlopePerPx = vec2f((nR - nL) * 0.5, (nU - nD) * 0.5);
                    let resolutionScale = 1.0 / max(texel.y * 1080.0, 0.0001);
                    let stepPx = mix(0.8, 3.0, radiusNorm) * resolutionScale;
                    let stepVec = texel * stepPx;
                    let nNear = min(min(nL, nR), min(nD, nU));
                    let nMicro = smoothstep(
                        nGrad * 0.14 + 0.00004,
                        nGrad * 1.35 + 0.00045,
                        cDepth - nNear
                    );

                    var occ = 0.0;
                    var occWide = 0.0;
                    var w = 0.0;
                    var wWide = 0.0;
                    for (var j: i32 = 0; j < 6; j = j + 1) {
                        let dir = directionForIndex(j * 2);
                        let suv = clamp(uv + dir * stepVec, vec2f(0.001), vec2f(0.999));
                        let sd = readDepthMetric(suv);
                        if (sd <= 0.00001) {
                            continue;
                        }

                        let expectedDepth = cDepth + dot(nSlopePerPx, dir * stepPx);
                        let planeDelta = expectedDepth - sd;
                        let gradientAllowance = nGrad * max(1.0, stepPx);
                        let lo = gradientAllowance * 0.2 + 0.00004;
                        let mid = gradientAllowance * 1.45 + 0.00022;
                        let hi = gradientAllowance * 3.25 + 0.00068;
                        let pos = smoothstep(lo, mid, planeDelta);
                        let shallow = 1.0 - smoothstep(mid, hi, planeDelta);
                        let reject = 1.0 - smoothstep(hi * 1.15, hi * 2.8, abs(planeDelta));
                        let wide = smoothstep(lo * 0.55, mid * 1.35, planeDelta)
                            * (1.0 - smoothstep(hi * 1.8, hi * 6.5, planeDelta))
                            * (1.0 - smoothstep(hi * 3.5, hi * 7.5, abs(planeDelta)));
                        occ += pos * shallow * reject;
                        occWide += wide;
                        w += 1.0;
                        wWide += 1.0;
                    }

                    let raw = occ / max(w, 0.0001);
                    let rawWide = occWide / max(wWide, 0.0001);
                    let combined = clamp(raw * 0.28 + rawWide * 1.28 + nMicro * 0.04, 0.0, 1.0);
                    var a = clamp(pow(combined, 1.8) * strength * 1.55, 0.0, 1.0);
                    let distFade = 1.0 - smoothstep(uniforms.worldFadeMeters.x * 0.35, uniforms.worldFadeMeters.y * 0.95, cDepth);
                    a *= distFade;
                    return a;
                }


                #define CUSTOM_FRAGMENT_DEFINITIONS
                @fragment
                fn main(input: FragmentInputs)->FragmentOutputs {
                    let color = textureSample(textureSampler, textureSamplerSampler, input.vUV);
                    let safeScreen = max(uniforms.screenSize, vec2f(1.0));
                    let texel = vec2f(1.0) / safeScreen;
                    let debugView = select(0.0, 1.0, uniforms.ssaoDebugView >= 0.5);
                    let resolutionScale = min(safeScreen.x, safeScreen.y) / 1080.0;

                    let centerDepth = readDepthMetric(input.vUV);
                    if (centerDepth <= 0.00001 || uniforms.ssaoStrength <= 0.00001) {
                        fragmentOutputs.color = vec4f(mix(color.rgb, vec3f(1.0), debugView), color.a);
                        return fragmentOutputs;
                    }

                    let dL = readDepthMetric(input.vUV - vec2f(texel.x, 0.0));
                    let dR = readDepthMetric(input.vUV + vec2f(texel.x, 0.0));
                    let dD = readDepthMetric(input.vUV - vec2f(0.0, texel.y));
                    let dU = readDepthMetric(input.vUV + vec2f(0.0, texel.y));

                    let depthGrad = max(max(abs(dR - dL), abs(dU - dD)), 0.00003);
                    let depthSlopePerPx = vec2f((dR - dL) * 0.5, (dU - dD) * 0.5);
                    let radiusNorm = clamp((uniforms.ssaoRadius - 0.25) / 2.1, 0.0, 1.0);
                    let sampleRadiusPx = mix(0.85, 4.2, radiusNorm) * resolutionScale;
                    let baseStep = texel * sampleRadiusPx;
                    let nearDepth = min(min(dL, dR), min(dD, dU));
                    let microCavity = smoothstep(
                        depthGrad * 0.16 + 0.00004,
                        depthGrad * 1.55 + 0.0006,
                        centerDepth - nearDepth
                    );

                    var occlusion = 0.0;
                    var enclosure = 0.0;
                    var totalWeight = 0.0;
                    var totalEnclosureWeight = 0.0;

                    for (var ring: i32 = 1; ring <= 4; ring = ring + 1) {
                        let ringFactor = f32(ring) / 4.0;
                        let ringWeight = mix(1.15, 0.5, ringFactor);
                        let enclosureWeight = mix(1.35, 0.65, ringFactor);

                        for (var i: i32 = 0; i < 12; i = i + 1) {
                            let dir = directionForIndex(i);
                            let offPx = dir * sampleRadiusPx * ringFactor;
                            let off = dir * baseStep * ringFactor;
                            let sampleSpanPx = max(1.0, sampleRadiusPx * ringFactor);
                            let sampleUv = clamp(input.vUV + off, vec2f(0.001), vec2f(0.999));
                            let sampleDepth = readDepthMetric(sampleUv);
                            if (sampleDepth <= 0.00001) {
                                continue;
                            }

                            let expectedDepth = centerDepth + dot(depthSlopePerPx, offPx);
                            let planeDelta = expectedDepth - sampleDepth;
                            let gradientAllowance = depthGrad * sampleSpanPx;
                            let shallowLo = gradientAllowance * (0.22 + ringFactor * 0.22) + 0.00004;
                            let shallowMid = gradientAllowance * (1.7 + ringFactor * 1.35) + (0.00026 + ringFactor * 0.00034);
                            let shallowHi = gradientAllowance * (4.0 + ringFactor * 2.6) + (0.00078 + ringFactor * 0.00105);
                            let positiveGate = smoothstep(shallowLo, shallowMid, planeDelta);
                            let shallowGate = 1.0 - smoothstep(shallowMid, shallowHi, planeDelta);
                            let largeGapReject = 1.0 - smoothstep(shallowHi * 1.18, shallowHi * 3.0, abs(planeDelta));
                            let contrib = positiveGate * shallowGate * largeGapReject * ringWeight;
                            let enclosureGate = smoothstep(shallowLo * 0.55, shallowMid * 1.28, planeDelta)
                                * (1.0 - smoothstep(shallowHi * 1.75, shallowHi * 6.5, planeDelta))
                                * (1.0 - smoothstep(shallowHi * 3.2, shallowHi * 7.0, abs(planeDelta)));
                            occlusion += contrib;
                            enclosure += enclosureGate * enclosureWeight;
                            totalWeight += ringWeight;
                            totalEnclosureWeight += enclosureWeight;
                        }
                    }

                    let aoRaw = occlusion / max(totalWeight, 0.0001);
                    let enclosureRaw = enclosure / max(totalEnclosureWeight, 0.0001);
                    var aoDetail = clamp(
                        pow(clamp(aoRaw * 0.95 + microCavity * 0.04, 0.0, 1.0), 1.75) * uniforms.ssaoStrength * 0.05,
                        0.0,
                        0.18
                    );
                    var aoBroad = clamp(
                        pow(clamp(enclosureRaw * 1.36 + aoRaw * 0.14 + microCavity * 0.03, 0.0, 1.0), 1.62) * uniforms.ssaoStrength * 1.26,
                        0.0,
                        0.98
                    );
                    let aoDistanceFade = 1.0 - smoothstep(uniforms.worldFadeMeters.x * 0.35, uniforms.worldFadeMeters.y * 0.95, centerDepth);
                    aoDetail *= aoDistanceFade;
                    aoBroad *= aoDistanceFade;

                    let slopeX = dR - dL;
                    let slopeY = dU - dD;
                    let centerPseudoNormal = pseudoNormalFromSlope(vec2f(slopeX * 0.5, slopeY * 0.5));
                    let slopeLen2 = slopeX * slopeX + slopeY * slopeY;
                    let normalZ = 1.0 / sqrt(1.0 + slopeLen2 * 9800.0);
                    let frontFactor = smoothstep(0.28, 0.9, normalZ);
                    let detailFacing = smoothstep(0.5, 0.985, normalZ);
                    let depthEdgeSuppression = 1.0 - smoothstep(0.00045, 0.0028, depthGrad);
                    let farFactor = smoothstep(uniforms.worldFadeMeters.x * 0.18, uniforms.worldFadeMeters.y * 0.7, centerDepth);
                    let distanceSoftness = smoothstep(uniforms.worldFadeMeters.x * 0.08, uniforms.worldFadeMeters.y * 0.55, centerDepth);
                    let frontFarFactor = frontFactor * farFactor;
                    var blurFactor = clamp(max(farFactor * 0.55, frontFarFactor * 1.2), 0.0, 1.0);
                    blurFactor = blurFactor * blurFactor * (3.0 - 2.0 * blurFactor);
                    var silhouetteSuppression = 1.0 - smoothstep(0.0003, 0.0019, depthGrad * (1.0 + blurFactor * 1.4));
                    silhouetteSuppression = silhouetteSuppression * silhouetteSuppression;
                    aoDetail *= detailFacing * depthEdgeSuppression * mix(1.0, 0.08, distanceSoftness);

                    let blurRadiusPx = mix(3.4, 18.0, blurFactor);
                    let blurRadiusPxWide = blurRadiusPx * mix(2.4, 4.8, blurFactor);
                    var blurAo = aoBroad;
                    var blurWeight = 1.0;
                    let depthSigma = depthGrad * mix(10.0, 60.0, blurFactor) + mix(0.018, 0.42, blurFactor);
                    for (var k: i32 = 0; k < 12; k = k + 1) {
                        let bDir = directionForIndex(k);
                        let bUv = clamp(input.vUV + bDir * texel * blurRadiusPx, vec2f(0.001), vec2f(0.999));
                        let bDepth = readDepthMetric(bUv);
                        if (bDepth > 0.00001) {
                            let bPseudoNormal = pseudoNormalAt(bUv, texel);
                            let normalWeight = smoothstep(0.42, 0.995, dot(centerPseudoNormal, bPseudoNormal));
                            let depthWeight = exp(-abs(bDepth - centerDepth) / depthSigma) * normalWeight;
                            let neighborAo = computeAoLiteAt(bUv, texel, radiusNorm, uniforms.ssaoStrength);
                            blurAo += neighborAo * depthWeight;
                            blurWeight += depthWeight;
                        }

                        let bUvWide = clamp(input.vUV + bDir * texel * blurRadiusPxWide, vec2f(0.001), vec2f(0.999));
                        let bDepthWide = readDepthMetric(bUvWide);
                        if (bDepthWide > 0.00001) {
                            let bPseudoNormalWide = pseudoNormalAt(bUvWide, texel);
                            let normalWeightWide = smoothstep(0.36, 0.992, dot(centerPseudoNormal, bPseudoNormalWide));
                            let depthWeightWide = exp(-abs(bDepthWide - centerDepth) / (depthSigma * 1.35)) * normalWeightWide;
                            let neighborAoWide = computeAoLiteAt(bUvWide, texel, radiusNorm, uniforms.ssaoStrength);
                            blurAo += neighborAoWide * depthWeightWide * 0.95;
                            blurWeight += depthWeightWide * 0.95;
                        }
                    }
                    let aoBlurred = blurAo / max(blurWeight, 0.0001);
                    aoBroad = mix(aoBroad * mix(0.9, 0.62, blurFactor), aoBlurred, mix(0.93, 0.999, blurFactor));
                    aoBroad *= mix(0.16, 1.0, silhouetteSuppression) * mix(0.86, 1.0, frontFactor);
                    var ao = clamp(aoBroad + aoDetail * mix(0.035, 0.006, max(blurFactor, distanceSoftness)), 0.0, 0.98);
                    let worldDistance = centerDepth;
                    let aoWorldOpacity = 1.0 - smoothstep(uniforms.worldFadeMeters.x, uniforms.worldFadeMeters.y, worldDistance);
                    ao *= aoWorldOpacity;

                    var aoApplied = 1.0 - pow(1.0 - clamp(ao * 7.0, 0.0, 0.998), 1.15);
                    let maskBlurRadiusPx = mix(1.2, 4.6, blurFactor) * mix(0.95, 1.7, farFactor);
                    var maskBlur = aoApplied;
                    var maskBlurWeight = 1.0;
                    let maskDepthSigma = depthSigma * 0.7 + 0.0005;
                    for (var m: i32 = 0; m < 12; m = m + 1) {
                        let mDir = directionForIndex(m);
                        let mUv = clamp(input.vUV + mDir * texel * maskBlurRadiusPx, vec2f(0.001), vec2f(0.999));
                        let mDepth = readDepthMetric(mUv);
                        if (mDepth > 0.00001) {
                            let mPseudoNormal = pseudoNormalAt(mUv, texel);
                            let mNormalWeight = smoothstep(0.48, 0.996, dot(centerPseudoNormal, mPseudoNormal));
                            let mDepthWeight = exp(-abs(mDepth - centerDepth) / maskDepthSigma) * mNormalWeight;
                            let neighborAo = computeAoLiteAt(mUv, texel, radiusNorm, uniforms.ssaoStrength);
                            var neighborApplied = 1.0 - pow(1.0 - clamp(neighborAo * 4.2, 0.0, 0.992), 1.05);
                            neighborApplied = mix(aoApplied, neighborApplied, 0.14);
                            maskBlur += neighborApplied * mDepthWeight;
                            maskBlurWeight += mDepthWeight;
                        }
                    }
                    let maskSmoothFactor = clamp(0.24 + blurFactor * 0.46 + farFactor * 0.2, 0.0, 0.82);
                    aoApplied = mix(aoApplied, maskBlur / max(maskBlurWeight, 0.0001), maskSmoothFactor);
                    var aoAppliedMin = aoApplied;
                    var aoAppliedMax = aoApplied;
                    var aoAppliedMean = aoApplied;
                    var aoAppliedCount = 1.0;
                    for (var n: i32 = 0; n < 4; n = n + 1) {
                        let nDir = directionForIndex(n * 3);
                        let nUv = clamp(input.vUV + nDir * texel * mix(0.9, 2.0, blurFactor), vec2f(0.001), vec2f(0.999));
                        let nDepth = readDepthMetric(nUv);
                        if (nDepth > 0.00001) {
                            let nDepthWeight = exp(-abs(nDepth - centerDepth) / (maskDepthSigma * 0.85 + 0.0002));
                            let nAo = computeAoLiteAt(nUv, texel, radiusNorm, uniforms.ssaoStrength);
                            var nApplied = 1.0 - pow(1.0 - clamp(nAo * 4.2, 0.0, 0.992), 1.05);
                            nApplied = mix(aoApplied, nApplied, 0.12) * nDepthWeight + aoApplied * (1.0 - nDepthWeight);
                            aoAppliedMin = min(aoAppliedMin, nApplied);
                            aoAppliedMax = max(aoAppliedMax, nApplied);
                            aoAppliedMean += nApplied;
                            aoAppliedCount += 1.0;
                        }
                    }
                    let aoAppliedAvg = aoAppliedMean / max(aoAppliedCount, 1.0);
                    let aoAppliedClampHi = mix(aoAppliedAvg, aoAppliedMax, 0.45);
                    aoApplied = clamp(aoApplied, aoAppliedMin * 0.92, aoAppliedClampHi);

                    let aoMask = 1.0 - aoApplied;
                    let baseColor = clamp(color.rgb, vec3f(0.0), vec3f(1.0));
                    let baseMax = max(max(baseColor.r, baseColor.g), baseColor.b);
                    let baseMin = min(min(baseColor.r, baseColor.g), baseColor.b);
                    let baseChroma = baseMax - baseMin;
                    let hueValidity = smoothstep(0.16, 0.52, baseMax) * smoothstep(0.05, 0.24, baseChroma);
                    let toneHue = baseColor / max(baseMax, 0.0001);
                    let neutralToon = vec3f(0.74);
                    let coloredToon = mix(vec3f(0.68), toneHue, vec3f(0.32));
                    let toonTint = mix(neutralToon, coloredToon, vec3f(hueValidity));
                    let selfMultiply = color.rgb * mix(vec3f(1.0), toonTint, vec3f(aoApplied));
                    let blackMultiply = color.rgb * aoMask;
                    let aoComposite = mix(blackMultiply, selfMultiply, clamp(uniforms.ssaoTintMode, 0.0, 1.0));
                    let shaded = mix(aoComposite, vec3f(aoMask), debugView);
                    fragmentOutputs.color = vec4f(shaded, color.a);
                }
            `;
        }
    }
