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
        setPhysicsSimulationRateHz: vi.fn(),
        setPhysicsGravityAcceleration: vi.fn(),
        setPhysicsGravityDirection: vi.fn(),
        setPhysicsEnabled: vi.fn(),
        setDofFocusTargetByPath: vi.fn(),
        updateEditorDofFocusAndFStop: vi.fn(),
        applyEditorDofSettings: vi.fn(),
        applyDofLensBlurSettings: vi.fn(),
        applyLightColorTemperature: vi.fn(),
        applyToonShadowInfluenceToAllModels: vi.fn(),
        syncLuminousGlowLayer: vi.fn(),
        setPostEffectExternalLut: vi.fn(),
        setExternalWgslToonShader: vi.fn(),
        setPostEffectFogColor: vi.fn(),
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
