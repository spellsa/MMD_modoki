import { describe, expect, it, vi } from "vitest";
import { importProjectState } from "./project-importer";
import type { MmdModokiProjectFileV1 } from "../types";

function createProject(overrides: Partial<MmdModokiProjectFileV1> = {}): MmdModokiProjectFileV1 {
    return {
        format: "mmd_modoki_project",
        version: 1,
        savedAt: "2026-04-18T00:00:00.000Z",
        scene: {
            models: [],
            activeModelPath: null,
            timelineTarget: "model",
            currentFrame: 12,
            playbackSpeed: 1,
        },
        assets: {
            cameraVmdPath: null,
            audioPath: null,
        },
        camera: {
            position: { x: 0, y: 10, z: -30 },
            target: { x: 0, y: 10, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            fov: 30,
            distance: 30,
        },
        lighting: {
            x: -0.5,
            y: -1,
            z: 0.5,
            intensity: 1,
            ambientIntensity: 0.5,
            temperatureKelvin: 6500,
            shadowEnabled: false,
            shadowDarkness: 0,
        },
        viewport: {
            groundVisible: true,
            skydomeVisible: false,
            antialiasEnabled: true,
            backgroundImagePath: null,
            backgroundVideoPath: null,
        },
        physics: {
            enabled: false,
            simulationRateHz: 60,
            gravityAcceleration: 9.8,
            gravityDirection: { x: 0, y: -1, z: 0 },
        },
        effects: {
            dofEnabled: false,
            dofFocusDistanceMm: 10000,
            dofFStop: 5.6,
            dofLensSize: 50,
            dofLensBlurStrength: 0,
            dofLensEdgeBlur: 0,
            dofLensDistortionInfluence: 0,
            modelEdgeWidth: 0,
            gamma: 1,
        },
        ...overrides,
    };
}

function createHost() {
    return {
        physicsAvailable: false,
        renderFpsLimit: 60,
        clearProjectForImport: vi.fn(),
        loadPMX: vi.fn(),
        loadVMD: vi.fn(),
        loadVPD: vi.fn(),
        loadCameraVMD: vi.fn(),
        loadMP3: vi.fn(),
        applyCameraAnimation: vi.fn(),
        applyCameraTrackPose: vi.fn(),
        setActiveModelByIndex: vi.fn(),
        setActiveModelVisibility: vi.fn(),
        setModelCastsShadowByIndex: vi.fn(),
        setModelMotionImports: vi.fn(),
        applyImportedMaterialShaderStates: vi.fn(),
        setGroundVisible: vi.fn(),
        setSkydomeVisible: vi.fn(),
        clearBackgroundMedia: vi.fn(),
        setBackgroundVideoFromPath: vi.fn(),
        setBackgroundImageFromPath: vi.fn(),
        setLightDirection: vi.fn(),
        setLightColor: vi.fn(),
        setShadowColor: vi.fn(),
        setShadowEnabled: vi.fn(),
        shadowMode: "cascaded" as "cascaded" | "standard",
        shadowBlurKernel: 0,
        shadowBlurScale: 2,
        shadowBlurBoxOffset: 1,
        shadowPenumbraEnabled: false,
        shadowPenumbraSize: 0.08,
        transparentShadowEnabled: true,
        setPhysicsSimulationRateHz: vi.fn(),
        setPhysicsGravityAcceleration: vi.fn(),
        setPhysicsGravityDirection: vi.fn(),
        setPhysicsEnabled: vi.fn(),
        isPhysicsAvailable: vi.fn(() => false),
        setDofFocusTargetByPath: vi.fn(),
        setModelEdgeColor: vi.fn(),
        modelEdgeColorOverrideEnabled: false,
        updateEditorDofFocusAndFStop: vi.fn(),
        applyEditorDofSettings: vi.fn(),
        applyDofLensBlurSettings: vi.fn(),
        applyLightColorTemperature: vi.fn(),
        applyToonShadowInfluenceToAllModels: vi.fn(),
        syncLuminousGlowLayer: vi.fn(),
        postEffectGlowGlareCount: 0,
        postEffectGlowGlareLength: 48,
        postEffectGlowGlareAngle: 0,
        postEffectGlowGlarePower: 0.4,
        setPostEffectBloomColor: vi.fn(),
        postEffectOffsetShadowEnabled: false,
        postEffectOffsetShadowStrength: 0.35,
        postEffectOffsetShadowOffsetX: 0,
        postEffectOffsetShadowOffsetY: -30,
        postEffectOffsetShadowDepthBias: 0.2,
        postEffectOffsetShadowMaxDepth: 2,
        postEffectOffsetShadowDepthScale: 1,
        postEffectOffsetShadowThickness: 1,
        postEffectOffsetShadowSoftness: 0,
        postEffectOffsetShadowNormalInfluence: 0,
        setPostEffectOffsetShadowColor: vi.fn(),
        postEffectOffsetShadowDebugView: false,
        postEffectOffsetHighlightEnabled: false,
        postEffectOffsetHighlightStrength: 1,
        postEffectOffsetHighlightOffsetX: 0,
        postEffectOffsetHighlightOffsetY: -100,
        postEffectOffsetHighlightDepthThreshold: 0.1,
        postEffectOffsetHighlightNormalThreshold: 0,
        postEffectOffsetHighlightThickness: 1,
        postEffectOffsetHighlightSoftness: 0,
        postEffectOffsetHighlightDepthScale: 1,
        setPostEffectOffsetHighlightColor: vi.fn(),
        postEffectOffsetHighlightDebugView: false,
        setPostEffectExternalLut: vi.fn(),
        setExternalWgslToonShader: vi.fn(),
        setPostEffectFogColor: vi.fn(),
        setFrameGraphPostEffectStackIds: vi.fn(),
        setFrameGraphPostEffectStackEntries: vi.fn(),
        refreshTotalFramesFromContent: vi.fn(),
        setRenderFpsLimit: vi.fn(),
        seekTo: vi.fn(),
        setPlaybackSpeed: vi.fn(),
        setTimelineTarget: vi.fn(),
        engine: {
            releaseEffects: vi.fn(),
        },
        sceneModels: [],
    };
}

describe("importProjectState", () => {
    it("restores saved SSAO effect values", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                dofBlurLevel: 2,
                dofNearSuppressionScale: 3.5,
                dofFocalLength: 80,
                dofFocalLengthDistanceInverted: true,
                dofLensDistortion: 0.25,
                contrast: 1.35,
                lutEnabled: true,
                lutIntensity: 0.65,
                ssaoEnabled: true,
                ssaoStrength: 1.4,
                ssaoRadius: 0.75,
                ssaoFadeEnd: 42,
                ssaoDebugView: true,
            },
        });

        await importProjectState(host, project);

        expect(host.dofBlurLevel).toBe(2);
        expect(host.dofNearSuppressionScale).toBe(3.5);
        expect(host.dofFocalLength).toBe(80);
        expect(host.dofFocalLengthDistanceInverted).toBe(true);
        expect(host.dofLensDistortion).toBe(0.25);
        expect(host.postEffectContrast).toBe(1.35);
        expect(host.postEffectLutEnabled).toBe(true);
        expect(host.postEffectLutIntensity).toBe(0.65);
        expect(host.postEffectSsaoEnabled).toBe(true);
        expect(host.postEffectSsaoStrength).toBe(1.4);
        expect(host.postEffectSsaoRadius).toBe(0.75);
        expect(host.postEffectSsaoFadeEnd).toBe(42);
        expect(host.postEffectSsaoDebugView).toBe(true);
    });

    it("restores model edge color settings", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                modelEdgeColorOverrideEnabled: true,
                modelEdgeColor: { r: 0.2, g: 0.3, b: 0.4 },
            },
        });

        await importProjectState(host, project);

        expect(host.modelEdgeColorOverrideEnabled).toBe(true);
        expect(host.setModelEdgeColor).toHaveBeenCalledWith(0.2, 0.3, 0.4);
    });

    it("restores normalized FrameGraph post effect stack order", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                frameGraphPostStack: [
                    { id: "lut", enabled: true },
                    { id: "bad" as "lut", enabled: true },
                    { id: "bloom", enabled: false },
                    { id: "lut", enabled: false },
                ],
            },
        });

        await importProjectState(host, project);

        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([
            { id: "lut", enabled: true },
            { id: "bloom", enabled: false },
        ]);
    });

    it("restores FrameGraph Luminous effect values", async () => {
        const host = createHost();
        const project = createProject({
            effects: {
                ...createProject().effects,
                glowEnabled: true,
                bloomColor: { r: 1, g: 0.42, b: 0.12 },
                offsetShadowEnabled: true,
                offsetShadowStrength: 0.55,
                offsetShadowOffsetX: 2,
                offsetShadowOffsetY: 9,
                offsetShadowDepthBias: 0.02,
                offsetShadowMaxDepth: 0.7,
                offsetShadowDepthScale: 0.8,
                offsetShadowThickness: 0.32,
                offsetShadowSoftness: 2.5,
                offsetShadowNormalInfluence: 0.6,
                offsetShadowColor: { r: 0.25, g: 0.18, b: 0.12 },
                offsetShadowDebugView: true,
                offsetHighlightEnabled: true,
                offsetHighlightStrength: 0.65,
                offsetHighlightOffsetX: -6,
                offsetHighlightOffsetY: -10,
                offsetHighlightDepthThreshold: 0.03,
                offsetHighlightNormalThreshold: 0.2,
                offsetHighlightThickness: 0.42,
                offsetHighlightSoftness: 1.5,
                offsetHighlightDepthScale: 0.75,
                offsetHighlightColor: { r: 1, g: 0.8, b: 0.6 },
                offsetHighlightDebugView: true,
                glowIntensity: 1.25,
                glowThreshold: 0.18,
                glowKernel: 48,
                glowGlareCount: 6,
                glowGlareLength: 96,
                glowGlareAngle: 15,
                glowGlarePower: 0.75,
                frameGraphPostStack: [
                    { id: "luminous", enabled: true },
                    { id: "offsetShadow", enabled: true },
                    { id: "offsetHighlight", enabled: true },
                    { id: "bloom", enabled: false },
                ],
            },
        });

        await importProjectState(host, project);

        expect(host.postEffectGlowEnabled).toBe(true);
        expect(host.postEffectGlowIntensity).toBe(1.25);
        expect(host.postEffectGlowThreshold).toBe(0.18);
        expect(host.postEffectGlowKernel).toBe(48);
        expect(host.postEffectGlowGlareCount).toBe(6);
        expect(host.postEffectGlowGlareLength).toBe(96);
        expect(host.postEffectGlowGlareAngle).toBe(15);
        expect(host.postEffectGlowGlarePower).toBe(0.75);
        expect(host.setPostEffectBloomColor).toHaveBeenCalledWith(1, 0.42, 0.12);
        expect(host.postEffectOffsetShadowEnabled).toBe(true);
        expect(host.postEffectOffsetShadowStrength).toBe(0.55);
        expect(host.postEffectOffsetShadowOffsetX).toBe(2);
        expect(host.postEffectOffsetShadowOffsetY).toBe(9);
        expect(host.postEffectOffsetShadowDepthBias).toBe(0.02);
        expect(host.postEffectOffsetShadowMaxDepth).toBe(0.7);
        expect(host.postEffectOffsetShadowDepthScale).toBe(0.8);
        expect(host.postEffectOffsetShadowThickness).toBe(0.32);
        expect(host.postEffectOffsetShadowSoftness).toBe(2.5);
        expect(host.postEffectOffsetShadowNormalInfluence).toBe(0.6);
        expect(host.setPostEffectOffsetShadowColor).toHaveBeenCalledWith(0.25, 0.18, 0.12);
        expect(host.postEffectOffsetShadowDebugView).toBe(true);
        expect(host.postEffectOffsetHighlightEnabled).toBe(true);
        expect(host.postEffectOffsetHighlightStrength).toBe(0.65);
        expect(host.postEffectOffsetHighlightOffsetX).toBe(-6);
        expect(host.postEffectOffsetHighlightOffsetY).toBe(-10);
        expect(host.postEffectOffsetHighlightDepthThreshold).toBe(0.03);
        expect(host.postEffectOffsetHighlightNormalThreshold).toBe(0.2);
        expect(host.postEffectOffsetHighlightThickness).toBe(0.42);
        expect(host.postEffectOffsetHighlightSoftness).toBe(1.5);
        expect(host.postEffectOffsetHighlightDepthScale).toBe(0.75);
        expect(host.setPostEffectOffsetHighlightColor).toHaveBeenCalledWith(1, 0.8, 0.6);
        expect(host.postEffectOffsetHighlightDebugView).toBe(true);
        expect(host.setFrameGraphPostEffectStackEntries).toHaveBeenCalledWith([
            { id: "luminous", enabled: true },
            { id: "offsetShadow", enabled: true },
            { id: "offsetHighlight", enabled: true },
            { id: "bloom", enabled: false },
        ]);
    });

    it("restores mirroring floor viewport values", async () => {
        const host = createHost();
        const project = createProject({
            viewport: {
                ...createProject().viewport,
                mirroringFloorEnabled: true,
                mirroringFloorShape: "circle",
                mirroringFloorReflectance: 0.48,
                mirroringFloorSize: 64,
                mirroringFloorHeight: 0.03,
                mirroringFloorResolution: 1024,
            },
        });

        await importProjectState(host, project);

        expect(host.mirroringFloorEnabled).toBe(true);
        expect(host.mirroringFloorShape).toBe("circle");
        expect(host.mirroringFloorReflectance).toBe(0.48);
        expect(host.mirroringFloorSize).toBe(64);
        expect(host.mirroringFloorHeight).toBe(0.03);
        expect(host.mirroringFloorResolution).toBe(1024);
    });

    it("uses mirroring floor defaults for projects saved before the setting existed", async () => {
        const host = createHost();
        const project = createProject();

        await importProjectState(host, project);

        expect(host.mirroringFloorEnabled).toBe(false);
        expect(host.mirroringFloorShape).toBe("square");
        expect(host.mirroringFloorReflectance).toBe(0.3);
        expect(host.mirroringFloorSize).toBe(100);
        expect(host.mirroringFloorHeight).toBe(0);
        expect(host.mirroringFloorResolution).toBe(1024);
    });

    it("restores embedded camera animation through the runtime camera path", async () => {
        const host = createHost();
        const project = createProject({
            keyframes: {
                modelAnimations: [],
                cameraAnimation: {
                    frameNumbers: [0],
                    positions: [1, 2, 3],
                    positionInterpolations: [20, 20, 20, 20],
                    rotations: [0.1, 0.2, 0.3],
                    rotationInterpolations: [20, 20, 20, 20],
                    distances: [-30],
                    distanceInterpolations: [20, 20, 20, 20],
                    fovs: [30],
                    fovInterpolations: [20, 20, 20, 20],
                },
            },
        });

        await importProjectState(host, project);

        expect(host.applyCameraAnimation).toHaveBeenCalledTimes(1);
        expect(host.applyCameraTrackPose).not.toHaveBeenCalled();
        const [animation, sourcePath] = host.applyCameraAnimation.mock.calls[0];
        expect(sourcePath).toBeNull();
        expect(Array.from(animation.cameraTrack.frameNumbers)).toEqual([0]);
    });

    it("reapplies render state after seek for dof, light, and model shaders", async () => {
        const host = createHost();
        host.loadPMX.mockImplementation(async (path: string) => {
            host.sceneModels.push({
                info: { path },
                mesh: {},
                model: {},
                materials: [],
            });
            return { name: "model", path };
        });

        const baseProject = createProject();
        const project = createProject({
            scene: {
                ...baseProject.scene,
                models: [{
                    path: "C:/models/test.pmx",
                    visible: true,
                    motionImports: [],
                    materialShaders: [{
                        materialKey: "0:test",
                        presetId: "wgsl-full-light",
                    }],
                }],
            },
            effects: {
                ...baseProject.effects,
                dofEnabled: true,
                dofTargetModelPath: "C:/models/test.pmx",
                dofTargetBoneName: "頭",
            },
        });

        await importProjectState(host, project);

        expect(host.applyImportedMaterialShaderStates).toHaveBeenCalledWith(
            0,
            project.scene.models[0].materialShaders,
            expect.any(Array),
            "C:/models/test.pmx",
        );
        expect(host.setDofFocusTargetByPath).toHaveBeenLastCalledWith("C:/models/test.pmx", "頭");
        expect(host.updateEditorDofFocusAndFStop).toHaveBeenCalledTimes(1);
        expect(host.applyEditorDofSettings).toHaveBeenCalledTimes(1);
        expect(host.applyDofLensBlurSettings).toHaveBeenCalledTimes(1);
        expect(host.setLightDirection).toHaveBeenLastCalledWith(-0.5, -1, 0.5);
        expect(host.engine.releaseEffects).toHaveBeenCalledTimes(1);
    });

    it("accepts legacy serialized light direction keys", async () => {
        const host = createHost();
        const project = createProject();
        const legacyProject = {
            ...project,
            lighting: {
                ...project.lighting,
                x: undefined,
                y: undefined,
                z: undefined,
                _x: -0.64,
                _y: -0.65,
                _z: -0.35,
            },
        } as MmdModokiProjectFileV1;

        await importProjectState(host, legacyProject);

        expect(host.setLightDirection).toHaveBeenLastCalledWith(-0.64, -0.65, -0.35);
    });
});
