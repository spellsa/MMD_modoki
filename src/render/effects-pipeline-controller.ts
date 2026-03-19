import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function getPostEffectLutPresetOptions(host: any): ReadonlyArray<{ id: string; label: string }> {
    return host.constructor.POST_EFFECT_LUT_PRESETS ?? [];
}

export function setPostEffectExternalLut(host: any, path: string | null, text: string | null): void {
    host.postEffectLutExternalPathValue = typeof path === "string" && path.trim().length > 0 ? path.trim() : null;
    host.postEffectLutExternalTextValue = typeof text === "string" && text.length > 0 ? text : null;
    host.postEffectLutExternalRevision += 1;
    if (host.postEffectLutExternalBlobUrl) {
        URL.revokeObjectURL(host.postEffectLutExternalBlobUrl);
        host.postEffectLutExternalBlobUrl = null;
    }
    host.applyImageProcessingSettings();
}

export function getPostEffectFogColor(host: any): { r: number; g: number; b: number } {
    return {
        r: host.postEffectFogColorValue.r,
        g: host.postEffectFogColorValue.g,
        b: host.postEffectFogColorValue.b,
    };
}

export function setPostEffectFogColor(host: any, r: number, g: number, b: number): void {
    host.postEffectFogColorValue.set(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1));
    host.applyFogSettings();
}

export function getPostEffectMotionBlurEnabled(host: any): boolean {
    return host.postEffectMotionBlurEnabledValue;
}
export function setPostEffectMotionBlurEnabled(host: any, v: boolean): void {
    host.postEffectMotionBlurEnabledValue = Boolean(v);
    host.applyMotionBlurSettings();
}
export function getPostEffectMotionBlurStrength(host: any): number {
    return host.postEffectMotionBlurStrengthValue;
}
export function setPostEffectMotionBlurStrength(host: any, v: number): void {
    host.postEffectMotionBlurStrengthValue = clamp(v, 0, 2);
    host.applyMotionBlurSettings();
}
export function getPostEffectMotionBlurSamples(host: any): number {
    return host.postEffectMotionBlurSamplesValue;
}
export function setPostEffectMotionBlurSamples(host: any, v: number): void {
    host.postEffectMotionBlurSamplesValue = clamp(Math.round(v), 8, 64);
    host.applyMotionBlurSettings();
}

export function getPostEffectSsrEnabled(host: any): boolean {
    return host.postEffectSsrEnabledValue;
}
export function setPostEffectSsrEnabled(host: any, v: boolean): void {
    host.postEffectSsrEnabledValue = Boolean(v);
    host.applySsrSettings();
}
export function getPostEffectSsrStrength(host: any): number {
    return host.postEffectSsrStrengthValue;
}
export function setPostEffectSsrStrength(host: any, v: number): void {
    host.postEffectSsrStrengthValue = clamp(v, 0, 2);
    host.applySsrSettings();
}
export function getPostEffectSsrStep(host: any): number {
    return host.postEffectSsrStepValue;
}
export function setPostEffectSsrStep(host: any, v: number): void {
    host.postEffectSsrStepValue = clamp(Math.round(v), 1, 8);
    host.applySsrSettings();
}

export function getPostEffectVlsEnabled(host: any): boolean {
    return host.postEffectVlsEnabledValue;
}
export function setPostEffectVlsEnabled(host: any, v: boolean): void {
    host.postEffectVlsEnabledValue = Boolean(v);
    host.applyVolumetricLightSettings();
}
export function getPostEffectVlsExposure(host: any): number {
    return host.postEffectVlsExposureValue;
}
export function setPostEffectVlsExposure(host: any, v: number): void {
    host.postEffectVlsExposureValue = clamp(v, 0, 2);
    host.applyVolumetricLightSettings();
}
export function getPostEffectVlsDecay(host: any): number {
    return host.postEffectVlsDecayValue;
}
export function setPostEffectVlsDecay(host: any, v: number): void {
    host.postEffectVlsDecayValue = clamp(v, 0, 1);
    host.applyVolumetricLightSettings();
}
export function getPostEffectVlsWeight(host: any): number {
    return host.postEffectVlsWeightValue;
}
export function setPostEffectVlsWeight(host: any, v: number): void {
    host.postEffectVlsWeightValue = clamp(v, 0, 1);
    host.applyVolumetricLightSettings();
}
export function getPostEffectVlsDensity(host: any): number {
    return host.postEffectVlsDensityValue;
}
export function setPostEffectVlsDensity(host: any, v: number): void {
    host.postEffectVlsDensityValue = clamp(v, 0, 2);
    host.applyVolumetricLightSettings();
}

export function getPostEffectFogEnabled(host: any): boolean {
    return host.postEffectFogEnabledValue;
}
export function setPostEffectFogEnabled(host: any, v: boolean): void {
    host.postEffectFogEnabledValue = Boolean(v);
    host.applyFogSettings();
}
export function getPostEffectFogMode(host: any): number {
    return host.postEffectFogModeValue;
}
export function setPostEffectFogMode(host: any, _v: number): void {
    void _v;
    host.postEffectFogModeValue = 2;
    host.applyFogSettings();
}
export function getPostEffectFogStart(host: any): number {
    return host.postEffectFogStartValue;
}
export function setPostEffectFogStart(host: any, v: number): void {
    host.postEffectFogStartValue = clamp(v, 0, 100000);
    if (host.postEffectFogEndValue < host.postEffectFogStartValue + 0.01) {
        host.postEffectFogEndValue = host.postEffectFogStartValue + 0.01;
    }
    host.applyFogSettings();
}
export function getPostEffectFogEnd(host: any): number {
    return host.postEffectFogEndValue;
}
export function setPostEffectFogEnd(host: any, v: number): void {
    host.postEffectFogEndValue = Math.max(host.postEffectFogStartValue + 0.01, Math.min(100000, v));
    host.applyFogSettings();
}
export function getPostEffectFogDensity(host: any): number {
    return host.postEffectFogDensityValue;
}
export function setPostEffectFogDensity(host: any, v: number): void {
    host.postEffectFogDensityValue = clamp(v, 0, 0.01);
    host.applyFogSettings();
}
export function getPostEffectFogOpacity(host: any): number {
    return host.postEffectFogOpacityValue;
}
export function setPostEffectFogOpacity(host: any, v: number): void {
    host.postEffectFogOpacityValue = clamp(v, 0, 1);
    host.applyFogSettings();
}

export function getAntialiasEnabled(host: any): boolean {
    return host.antialiasEnabledValue;
}
export function setAntialiasEnabled(host: any, v: boolean): void {
    host.antialiasEnabledValue = Boolean(v);
    host.applyAntialiasSettings();
}

export function getDofEnabled(host: any): boolean {
    return host.dofEnabledValue;
}
export function setDofEnabled(host: any, v: boolean): void {
    if (v && !host.defaultRenderingPipeline) {
        host.initializeDofPipeline();
    }
    if (v && !host.defaultRenderingPipeline) {
        host.dofEnabledValue = false;
        return;
    }

    host.dofEnabledValue = v;
    if (host.dofEnabledValue) {
        host.configureDofDepthRenderer();
        host.updateEditorDofFocusAndFStop();
    }
    if (host.defaultRenderingPipeline) {
        if (host.depthRenderer) {
            host.defaultRenderingPipeline.depthOfField.depthTexture = host.depthRenderer.getDepthMap();
        }
        host.defaultRenderingPipeline.depthOfFieldEnabled = host.dofEnabledValue;
    }
    host.applyDofLensBlurSettings();
    host.applyAntialiasSettings();
}

export function getDofBlurLevel(host: any): number {
    return host.dofBlurLevelValue;
}
export function setDofBlurLevel(host: any, v: number): void {
    const level = v <= 0 ? DepthOfFieldEffectBlurLevel.Low : v === 1 ? DepthOfFieldEffectBlurLevel.Medium : DepthOfFieldEffectBlurLevel.High;
    host.dofBlurLevelValue = level;
    if (host.defaultRenderingPipeline) {
        host.defaultRenderingPipeline.depthOfFieldBlurLevel = level;
        host.applyEditorDofSettings();
    }
    host.applyAntialiasSettings();
}

export function getDofFocusDistanceMm(host: any): number {
    return host.dofFocusDistanceMmValue;
}
export function setDofFocusDistanceMm(host: any, v: number): void {
    host.dofFocusDistanceMmValue = clamp(v, 0, 1000000000);
    host.updateEditorDofFocusAndFStop();
}
export function getDofAutoFocusEnabled(host: any): boolean {
    return host.dofAutoFocusToCameraTarget;
}
export function getDofAutoFocusRangeMeters(host: any): number {
    return host.dofAutoFocusInFocusRadiusMm / 1000;
}
export function getDofAutoFocusNearOffsetMm(host: any): number {
    return host.dofAutoFocusNearOffsetMmValue;
}
export function setDofAutoFocusNearOffsetMm(host: any, v: number): void {
    host.dofAutoFocusNearOffsetMmValue = clamp(v, -1000000000, 1000000000);
    host.updateEditorDofFocusAndFStop();
}
export function getDofNearSuppressionScale(host: any): number {
    return host.dofNearSuppressionScaleValue;
}
export function setDofNearSuppressionScale(host: any, v: number): void {
    host.dofNearSuppressionScaleValue = clamp(v, 0, 10);
    host.updateEditorDofFocusAndFStop();
}
export function getDofEffectiveFStop(host: any): number {
    return host.dofEffectiveFStopValue;
}
export function getDofFStop(host: any): number {
    return host.dofFStopValue;
}
export function setDofFStop(host: any, v: number): void {
    host.dofFStopValue = clamp(v, 0.01, 32);
    host.updateEditorDofFocusAndFStop();
}
export function getDofLensBlurEnabled(host: any): boolean {
    return host.dofLensBlurEnabledValue;
}
export function setDofLensBlurEnabled(host: any, v: boolean): void {
    host.dofLensBlurEnabledValue = Boolean(v);
    host.applyDofLensBlurSettings();
}
export function getDofLensBlurStrength(host: any): number {
    return host.dofLensBlurStrengthValue;
}
export function setDofLensBlurStrength(host: any, v: number): void {
    host.dofLensBlurStrengthValue = clamp(v, 0, 1);
    host.applyDofLensBlurSettings();
}
export function getDofLensEdgeBlur(host: any): number {
    return host.dofLensEdgeBlurValue;
}
export function setDofLensEdgeBlur(host: any, v: number): void {
    host.dofLensEdgeBlurValue = clamp(v, 0, 3);
    host.applyDofLensOpticsSettings();
}
export function getDofLensDistortion(host: any): number {
    return host.dofLensDistortionValue;
}
export function setDofLensDistortion(host: any, v: number): void {
    if (host.dofLensDistortionFollowsCameraFov) {
        host.updateDofLensDistortionFromCameraFov();
        return;
    }
    host.dofLensDistortionValue = clamp(v, -1, 1);
    host.applyDofLensOpticsSettings();
}
export function getDofLensDistortionLinkedToCameraFov(host: any): boolean {
    return host.dofLensDistortionFollowsCameraFov;
}
export function getDofLensDistortionInfluence(host: any): number {
    return host.dofLensDistortionInfluenceValue;
}
export function setDofLensDistortionInfluence(host: any, v: number): void {
    host.dofLensDistortionInfluenceValue = clamp(v, 0, 1);
    if (host.dofLensDistortionFollowsCameraFov) {
        host.updateDofLensDistortionFromCameraFov();
        return;
    }
    host.applyDofLensOpticsSettings();
}
export function getDofLensSize(host: any): number {
    return host.dofLensSizeValue;
}
export function setDofLensSize(host: any, v: number): void {
    host.dofLensSizeValue = clamp(v, 0, 8192);
    if (host.defaultRenderingPipeline) {
        host.defaultRenderingPipeline.depthOfField.lensSize = host.dofLensSizeValue;
    }
    host.updateEditorDofFocusAndFStop();
}
export function getDofFocalLength(host: any): number {
    return host.dofFocalLengthValue;
}
export function setDofFocalLength(host: any, v: number): void {
    if (host.dofFocalLengthFollowsCameraFov) {
        host.updateDofFocalLengthFromCameraFov();
        host.updateEditorDofFocusAndFStop();
        return;
    }
    host.dofFocalLengthValue = clamp(v, 1, 1000);
    if (host.defaultRenderingPipeline) {
        host.defaultRenderingPipeline.depthOfField.focalLength = host.dofFocalLengthValue;
    }
    host.updateEditorDofFocusAndFStop();
}
export function getDofFocalLengthDistanceInverted(host: any): boolean {
    return host.dofFocalLengthDistanceInvertedValue;
}
export function setDofFocalLengthDistanceInverted(host: any, v: boolean): void {
    host.dofFocalLengthDistanceInvertedValue = Boolean(v);
    if (host.dofFocalLengthFollowsCameraFov) {
        host.updateDofFocalLengthFromCameraFov();
        host.updateEditorDofFocusAndFStop();
    }
}
export function getDofFocalLengthLinkedToCameraDistance(host: any): boolean {
    return host.dofFocalLengthLinkedToCameraFov;
}
export function getDofFocalLengthLinkedToCameraFov(host: any): boolean {
    return host.dofFocalLengthFollowsCameraFov;
}
export function getPostEffectFarDofStrength(host: any): number {
    return host.postEffectFarDofStrengthValue;
}
export function setPostEffectFarDofStrength(host: any, v: number): void {
    if (!host.farDofEnabled) {
        host.postEffectFarDofStrengthValue = 0;
        return;
    }
    host.postEffectFarDofStrengthValue = clamp(v, 0, 1);
    host.applyDofLensOpticsSettings();
}
