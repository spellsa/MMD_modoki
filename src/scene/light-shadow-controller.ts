import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

function clamp01(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

function clampLightColorScale(v: number): number {
    if (!Number.isFinite(v)) return 1;
    return Math.max(0, Math.min(2, v));
}

function clampShadowEdgeSoftness(v: number): number {
    return Math.max(0.005, Math.min(0.12, v));
}

function clampShadowFrustumSize(v: number): number {
    return Math.max(120, Math.min(6000, v));
}

function clampShadowMaxZ(v: number): number {
    if (!Number.isFinite(v)) return DEFAULT_CSM_SHADOW_MAX_Z;
    return Math.max(500, Math.min(12000, v));
}

function clampShadowBias(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(0.01, v));
}

function clampShadowNormalBias(v: number): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(0.02, v));
}

const DEFAULT_LIGHT_DIRECTION = new Vector3(0.3, -0.5, 0.5).normalize();
const DEFAULT_CSM_SHADOW_MAX_Z = 4800;
const DEFAULT_CSM_FRUSTUM_SIZE = 960;
const DEFAULT_CSM_LIGHT_DISTANCE = 220;

function applyShadowBiasSettings(host: any): void {
    if (!host.shadowGenerator) return;
    host.shadowGenerator.bias = clampShadowBias(host.shadowBiasValue);
    host.shadowGenerator.normalBias = clampShadowNormalBias(host.shadowNormalBiasValue);
}

function createShadowGenerator(host: any, dirLight: DirectionalLight): ShadowGenerator {
    const maxTextureSize = host.engine.getCaps().maxTextureSize ?? 4096;
    const shadowMapSize = Math.min(8192, maxTextureSize);
    const camera = host.camera ?? host.scene?.activeCamera ?? null;
    const shadowGenerator = CascadedShadowGenerator.IsSupported
        ? new CascadedShadowGenerator(shadowMapSize, dirLight, undefined, camera)
        : new ShadowGenerator(shadowMapSize, dirLight);
    if (shadowGenerator instanceof CascadedShadowGenerator) {
        shadowGenerator.numCascades = 2;
        shadowGenerator.stabilizeCascades = true;
        shadowGenerator.lambda = 0.82;
        shadowGenerator.cascadeBlendPercentage = 0.05;
        shadowGenerator.autoCalcDepthBounds = true;
        shadowGenerator.shadowMaxZ = DEFAULT_CSM_SHADOW_MAX_Z;
    }
    shadowGenerator.usePercentageCloserFiltering = true;
    shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    shadowGenerator.useContactHardeningShadow = false;
    shadowGenerator.frustumEdgeFalloff = 0.26;
    shadowGenerator.transparencyShadow = true;
    shadowGenerator.enableSoftTransparentShadow = true;
    shadowGenerator.useOpacityTextureForTransparentShadow = true;
    shadowGenerator.darkness = host.shadowDarknessValue;
    host.shadowGenerator = shadowGenerator;
    applyShadowBiasSettings(host);
    return shadowGenerator;
}

function getEffectiveShadowEdgeSoftness(host: any): number {
    return (host.selfShadowEdgeSoftnessValue + host.occlusionShadowEdgeSoftnessValue) * 0.5;
}

function kelvinToColor(kelvin: number): Color3 {
    const temp = Math.max(10, Math.min(200, kelvin / 100));
    let red: number;
    let green: number;
    let blue: number;

    if (temp <= 66) {
        red = 255;
        green = 99.4708025861 * Math.log(temp) - 161.1195681661;
        blue = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    } else {
        red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
        green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
        blue = 255;
    }

    return new Color3(
        Math.max(0, Math.min(255, red)) / 255,
        Math.max(0, Math.min(255, green)) / 255,
        Math.max(0, Math.min(255, blue)) / 255,
    );
}

function collectMaterials(meshes: Mesh[]): Set<any> {
    const materials = new Set<any>();

    for (const mesh of meshes) {
        const material = mesh.material as any;
        if (!material) continue;
        if (Array.isArray(material.subMaterials)) {
            for (const sub of material.subMaterials) {
                if (sub) materials.add(sub);
            }
        } else {
            materials.add(material);
        }
    }

    return materials;
}

export function initializeLightShadowSystem(host: any): void {
    if (host.hemiLight && host.dirLight && host.shadowGenerator) {
        return;
    }

    const hemiLight = host.hemiLight = new HemisphericLight(
        "hemiLight",
        new Vector3(0, 1, 0),
        host.scene,
    );
    hemiLight.intensity = 0.0;
    hemiLight.diffuse = new Color3(0.9, 0.9, 1.0);
    hemiLight.groundColor = host.shadowGroundColorValue.clone();

    const dirLight = host.dirLight = new DirectionalLight(
        "dirLight",
        DEFAULT_LIGHT_DIRECTION.clone(),
        host.scene,
    );
    dirLight.shadowEnabled = Boolean(host.shadowEnabled);
    dirLight.intensity = 1.0;
    dirLight.position = new Vector3(-20, 30, -20);
    dirLight.shadowMinZ = 1;
    dirLight.shadowMaxZ = 500;
    dirLight.autoUpdateExtends = true;
    dirLight.autoCalcShadowZBounds = true;

    applyShadowFrustumSize(host);
    applyLightColorTemperature(host);

    host.shadowGenerator = createShadowGenerator(host, dirLight);
    applyShadowFrustumSize(host);
    applyShadowEdgeSoftness(host);
}

export function getLightColorTemperature(host: any): number {
    return host.lightColorTemperatureKelvin;
}

export function setLightColorTemperature(host: any, kelvin: number): void {
    host.lightColorTemperatureKelvin = Math.max(1000, Math.min(20000, Math.round(kelvin)));
    applyLightColorTemperature(host);
}

export function getLightIntensity(host: any): number {
    return host.dirLight?.intensity ?? 0;
}

export function setLightIntensity(host: any, v: number): void {
    if (!host.dirLight) return;
    host.dirLight.intensity = Math.max(0, Math.min(2, v));
}

export function getAmbientIntensity(host: any): number {
    return host.hemiLight?.intensity ?? 0;
}

export function setAmbientIntensity(host: any, v: number): void {
    if (!host.hemiLight) return;
    host.hemiLight.intensity = Math.max(0, Math.min(2, v));
}

export function getLightColor(host: any): { r: number; g: number; b: number } {
    return {
        r: host.lightColorScaleValue.r,
        g: host.lightColorScaleValue.g,
        b: host.lightColorScaleValue.b,
    };
}

export function setLightColor(host: any, r: number, g: number, b: number): void {
    host.lightColorScaleValue = new Color3(
        clampLightColorScale(r),
        clampLightColorScale(g),
        clampLightColorScale(b),
    );
    applyLightColorTemperature(host);
}

export function getLightFlatStrength(host: any): number {
    return host.lightFlatStrengthValue;
}

export function setLightFlatStrength(host: any, v: number): void {
    host.lightFlatStrengthValue = Math.max(0, Math.min(0.1, v));
    applyToonShadowInfluenceToAllModels(host);
}

export function getLightFlatColorInfluence(host: any): number {
    return host.lightFlatColorInfluenceValue;
}

export function setLightFlatColorInfluence(host: any, v: number): void {
    host.lightFlatColorInfluenceValue = clamp01(v);
    host.constructor.toonFlatLightColorInfluence = host.lightFlatColorInfluenceValue;
    applyToonShadowInfluenceToAllModels(host);
}

export function getShadowColor(host: any): { r: number; g: number; b: number } {
    return {
        r: host.shadowGroundColorValue.r,
        g: host.shadowGroundColorValue.g,
        b: host.shadowGroundColorValue.b,
    };
}

export function setShadowColor(host: any, r: number, g: number, b: number): void {
    host.shadowGroundColorValue = new Color3(
        clamp01(r),
        clamp01(g),
        clamp01(b),
    );
    if (host.hemiLight) {
        host.hemiLight.groundColor = host.shadowGroundColorValue.clone();
    }
    applyToonShadowInfluenceToAllModels(host);
}

export function getToonShadowInfluence(host: any): number {
    return host.toonShadowInfluenceValue;
}

export function setToonShadowInfluence(host: any, v: number): void {
    host.toonShadowInfluenceValue = clamp01(v);
    applyToonShadowInfluenceToAllModels(host);
}

export function getShadowDarkness(host: any): number {
    return host.shadowDarknessValue;
}

export function setShadowDarkness(host: any, v: number): void {
    host.shadowDarknessValue = Math.max(0, Math.min(1, v));
    if (host.shadowEnabled && host.shadowGenerator) {
        host.shadowGenerator.darkness = host.shadowDarknessValue;
    }
}

export function getShadowFrustumSize(host: any): number {
    return host.shadowFrustumSizeValue;
}

export function setShadowFrustumSize(host: any, v: number): void {
    host.shadowFrustumSizeValue = clampShadowFrustumSize(v);
    applyShadowFrustumSize(host);
    if (host.dirLight) {
        const direction = getLightDirection(host);
        setLightDirection(host, direction.x, direction.y, direction.z);
    }
}

export function getShadowMaxZ(host: any): number {
    return clampShadowMaxZ(host.shadowMaxZValue);
}

export function setShadowMaxZ(host: any, v: number): void {
    host.shadowMaxZValue = clampShadowMaxZ(v);
    applyShadowFrustumSize(host);
    if (host.dirLight) {
        const direction = getLightDirection(host);
        setLightDirection(host, direction.x, direction.y, direction.z);
    }
}

export function getShadowBias(host: any): number {
    return clampShadowBias(host.shadowBiasValue);
}

export function setShadowBias(host: any, v: number): void {
    host.shadowBiasValue = clampShadowBias(v);
    applyShadowBiasSettings(host);
}

export function getShadowNormalBias(host: any): number {
    return clampShadowNormalBias(host.shadowNormalBiasValue);
}

export function setShadowNormalBias(host: any, v: number): void {
    host.shadowNormalBiasValue = clampShadowNormalBias(v);
    applyShadowBiasSettings(host);
}

export function getShadowEnabled(host: any): boolean {
    return Boolean(host.shadowEnabled);
}

export function setShadowEnabled(host: any, enabled: boolean): void {
    host.shadowEnabled = Boolean(enabled);
    if (host.dirLight) {
        host.dirLight.shadowEnabled = host.shadowEnabled;
    }
    if (host.shadowGenerator) {
        host.shadowGenerator.darkness = enabled ? host.shadowDarknessValue : 0;
    }
}

export function getShadowEdgeSoftness(host: any): number {
    return getEffectiveShadowEdgeSoftness(host);
}

export function setShadowEdgeSoftness(host: any, v: number): void {
    const clamped = clampShadowEdgeSoftness(v);
    host.selfShadowEdgeSoftnessValue = clamped;
    host.occlusionShadowEdgeSoftnessValue = clamped;
    applyShadowEdgeSoftness(host);
}

export function getSelfShadowEdgeSoftness(host: any): number {
    return host.selfShadowEdgeSoftnessValue;
}

export function setSelfShadowEdgeSoftness(host: any, v: number): void {
    host.selfShadowEdgeSoftnessValue = clampShadowEdgeSoftness(v);
    applyShadowEdgeSoftness(host);
}

export function getOcclusionShadowEdgeSoftness(host: any): number {
    return host.occlusionShadowEdgeSoftnessValue;
}

export function setOcclusionShadowEdgeSoftness(host: any, v: number): void {
    host.occlusionShadowEdgeSoftnessValue = clampShadowEdgeSoftness(v);
    applyShadowEdgeSoftness(host);
}

export function applyToonShadowInfluenceToAllModels(host: any): void {
    for (const sceneModel of host.sceneModels) {
        const meshes = [sceneModel.mesh, ...sceneModel.mesh.getChildMeshes()];
        applyToonShadowInfluenceToMeshes(host, meshes as Mesh[]);
    }
}

export function applyToonShadowInfluenceToMeshes(host: any, meshes: Mesh[]): void {
    const materials = collectMaterials(meshes);

    const lightTintR = clampLightColorScale(host.lightColorScaleValue.r);
    const lightTintG = clampLightColorScale(host.lightColorScaleValue.g);
    const lightTintB = clampLightColorScale(host.lightColorScaleValue.b);
    const lightFlatStrength = clamp01(host.lightFlatStrengthValue);
    const shadowR = clamp01(host.shadowGroundColorValue.r);
    const shadowG = clamp01(host.shadowGroundColorValue.g);
    const shadowB = clamp01(host.shadowGroundColorValue.b);
    const toonInfluence = clamp01(host.toonShadowInfluenceValue);

    for (const mat of materials) {
        if (!("toonTextureMultiplicativeColor" in mat)) continue;
        const toonMultiplicativeColor = mat.toonTextureMultiplicativeColor;
        if (!toonMultiplicativeColor || typeof toonMultiplicativeColor !== "object") continue;

        const toonAdditiveColor = ("toonTextureAdditiveColor" in mat)
            ? mat.toonTextureAdditiveColor
            : null;

        if ("useToonTextureColor" in mat) {
            mat.useToonTextureColor = true;
        }

        if (typeof toonMultiplicativeColor.set === "function") {
            toonMultiplicativeColor.set(lightTintR, lightTintG, lightTintB, lightFlatStrength);
        } else {
            (toonMultiplicativeColor as { r?: number }).r = lightTintR;
            (toonMultiplicativeColor as { g?: number }).g = lightTintG;
            (toonMultiplicativeColor as { b?: number }).b = lightTintB;
            (toonMultiplicativeColor as { a?: number }).a = lightFlatStrength;
        }

        if (toonAdditiveColor && typeof toonAdditiveColor === "object") {
            if (typeof toonAdditiveColor.set === "function") {
                toonAdditiveColor.set(shadowR, shadowG, shadowB, toonInfluence);
            } else {
                (toonAdditiveColor as { r?: number }).r = shadowR;
                (toonAdditiveColor as { g?: number }).g = shadowG;
                (toonAdditiveColor as { b?: number }).b = shadowB;
                (toonAdditiveColor as { a?: number }).a = toonInfluence;
            }
        }

        host.markMaterialShaderDirty(mat);
    }
}

export function applyShadowFrustumSize(host: any): void {
    if (!host.dirLight) return;
    const csmEnabled = host.shadowGenerator instanceof CascadedShadowGenerator;
    host.dirLight.shadowFrustumSize = csmEnabled ? DEFAULT_CSM_FRUSTUM_SIZE : host.shadowFrustumSizeValue;
    host.dirLight.shadowMinZ = 1;
    host.dirLight.shadowMaxZ = csmEnabled
        ? clampShadowMaxZ(host.shadowMaxZValue)
        : Math.max(500, host.shadowFrustumSizeValue * 6);
    if (csmEnabled) {
        host.shadowGenerator.shadowMaxZ = clampShadowMaxZ(host.shadowMaxZValue);
    }
}

export function applyShadowEdgeSoftness(host: any): void {
    if (!host.shadowGenerator) return;
    host.shadowGenerator.contactHardeningLightSizeUVRatio = host.shadowGenerator instanceof CascadedShadowGenerator
        ? Math.max(0.003, Math.min(0.010, getEffectiveShadowEdgeSoftness(host) * 0.18))
        : getEffectiveShadowEdgeSoftness(host);
    host.constructor.toonSelfShadowBoundarySoftness = host.selfShadowEdgeSoftnessValue;
    host.constructor.toonOcclusionShadowBoundarySoftness = host.occlusionShadowEdgeSoftnessValue;
    applyToonShadowInfluenceToAllModels(host);
}

export function setLightDirection(host: any, x: number, y: number, z: number): void {
    if (!host.dirLight) return;

    const direction = new Vector3(
        Number.isFinite(x) ? x : DEFAULT_LIGHT_DIRECTION.x,
        Number.isFinite(y) ? y : DEFAULT_LIGHT_DIRECTION.y,
        Number.isFinite(z) ? z : DEFAULT_LIGHT_DIRECTION.z,
    );
    if (direction.lengthSquared() < 0.0001) {
        direction.copyFrom(DEFAULT_LIGHT_DIRECTION);
    }
    direction.normalize();
    host.dirLight.direction = direction;
    const dist = host.shadowGenerator instanceof CascadedShadowGenerator
        ? DEFAULT_CSM_LIGHT_DISTANCE
        : Math.max(90, host.shadowFrustumSizeValue * 0.35);
    host.dirLight.position = new Vector3(
        -direction.x * dist,
        Math.abs(direction.y) * dist + 5,
        -direction.z * dist,
    );
    if (typeof host.applyVolumetricLightSettings === "function") {
        host.applyVolumetricLightSettings();
    }
    if (typeof host.refreshGlobalIlluminationLightParameters === "function") {
        host.refreshGlobalIlluminationLightParameters();
    }
}

export function getLightDirection(host: any): Vector3 {
    if (!host.dirLight || !host.dirLight.direction) {
        return DEFAULT_LIGHT_DIRECTION.clone();
    }
    const direction = host.dirLight.direction;
    if (direction.lengthSquared() < 0.0001) {
        return DEFAULT_LIGHT_DIRECTION.clone();
    }
    return direction.clone().normalize();
}

export function applyLightColorTemperature(host: any): void {
    if (!host.dirLight || !host.hemiLight) return;

    const color = kelvinToColor(host.lightColorTemperatureKelvin);
    const clampedLightScale = new Color3(
        Math.min(1, host.lightColorScaleValue.r),
        Math.min(1, host.lightColorScaleValue.g),
        Math.min(1, host.lightColorScaleValue.b),
    );
    const scaled = new Color3(
        color.r * clampedLightScale.r,
        color.g * clampedLightScale.g,
        color.b * clampedLightScale.b,
    );

    host.dirLight.diffuse = scaled.clone();
    host.dirLight.specular = new Color3(0, 0, 0);
    host.hemiLight.groundColor = host.shadowGroundColorValue.clone();
    applyToonShadowInfluenceToAllModels(host);
}
