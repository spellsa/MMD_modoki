import type { MotionInfo } from "../types";
import { StreamAudioPlayer } from "babylon-mmd/esm/Runtime/Audio/streamAudioPlayer";

function getAudioMimeType(fileName: string): string {
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "wav":
        case "wave":
            return "audio/wav";
        case "ogg":
            return "audio/ogg";
        case "mp3":
        default:
            return "audio/mpeg";
    }
}

export async function loadVMD(host: any, filePath: string): Promise<MotionInfo | null> {
    const pathParts = filePath.replace(/\\/g, "/");
    const lastSlash = pathParts.lastIndexOf("/");
    const fileName = pathParts.substring(lastSlash + 1);
    const extensionMatch = fileName.match(/\.([^.]+)$/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";

    if (extension === "vpd") {
        return await loadVPD(host, filePath);
    }

    try {
        const targetModel = host.currentModel;
        if (!targetModel) {
            host.onError?.("Load a PMX model first");
            return null;
        }
        const loadFrame = host._currentFrame;
        const previousTotalFrames = host._totalFrames;
        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            host.onError?.("Failed to read VMD file");
            return null;
        }

        const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
        const blob = new Blob([uint8]);
        const blobUrl = URL.createObjectURL(blob);
        let animation: any;
        try {
            animation = await host.vmdLoader.loadAsync("modelMotion", blobUrl);
        } finally {
            URL.revokeObjectURL(blobUrl);
        }

        const baseAnimation = host.modelSourceAnimationsByModel.get(targetModel);
        const mergedAnimation = baseAnimation
            ? host.mergeModelAnimations(baseAnimation, animation)
            : animation;

        host.modelSourceAnimationsByModel.set(targetModel, mergedAnimation);
        host.appendModelMotionImport(targetModel, { type: "vmd", path: filePath });
        const animHandle = targetModel.createRuntimeAnimation(mergedAnimation);
        targetModel.setRuntimeAnimation(animHandle);

        host._totalFrames = Math.max(
            previousTotalFrames,
            Math.floor(host.mmdRuntime.animationFrameTimeDuration),
            300,
        );
        host.seekTo(loadFrame);

        host.modelKeyframeTracksByModel.set(
            targetModel,
            host.buildModelTrackFrameMapFromAnimation(mergedAnimation),
        );
        host.emitMergedKeyframeTracks();

        const motionInfo: MotionInfo = {
            name: fileName.replace(/\.vmd$/i, ""),
            path: filePath,
            frameCount: host._totalFrames,
        };

        host.onMotionLoaded?.(motionInfo);
        return motionInfo;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to load VMD:", message);
        host.onError?.(`VMD load error: ${message}`);
        return null;
    }
}

export async function loadVPD(host: any, filePath: string): Promise<MotionInfo | null> {
    try {
        const targetModel = host.currentModel;
        if (!targetModel) {
            host.onError?.("Load a PMX model first");
            return null;
        }
        const loadFrame = host._currentFrame;
        const previousTotalFrames = host._totalFrames;
        const pathParts = filePath.replace(/\\/g, "/");
        const lastSlash = pathParts.lastIndexOf("/");
        const fileName = pathParts.substring(lastSlash + 1);

        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            host.onError?.("Failed to read pose file");
            return null;
        }

        const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
        const arrayBuffer = uint8.buffer.slice(
            uint8.byteOffset,
            uint8.byteOffset + uint8.byteLength,
        );
        const poseAnimation = host.vpdLoader.loadFromBuffer("modelPose", arrayBuffer);
        const shiftedPoseAnimation = host.createOffsetModelAnimation(poseAnimation, loadFrame);
        const baseAnimation = host.modelSourceAnimationsByModel.get(targetModel);
        const mergedAnimation = baseAnimation
            ? host.mergeModelAnimations(baseAnimation, shiftedPoseAnimation)
            : shiftedPoseAnimation;
        host.modelSourceAnimationsByModel.set(targetModel, mergedAnimation);
        host.appendModelMotionImport(targetModel, { type: "vpd", path: filePath, frame: loadFrame });

        const animHandle = targetModel.createRuntimeAnimation(mergedAnimation);
        targetModel.setRuntimeAnimation(animHandle);

        host._totalFrames = Math.max(
            previousTotalFrames,
            Math.floor(host.mmdRuntime.animationFrameTimeDuration),
            loadFrame,
            300,
        );
        host.seekTo(loadFrame);

        host.modelKeyframeTracksByModel.set(
            targetModel,
            host.buildModelTrackFrameMapFromAnimation(mergedAnimation),
        );
        host.emitMergedKeyframeTracks();

        const motionInfo: MotionInfo = {
            name: fileName.replace(/\.vpd$/i, ""),
            path: filePath,
            frameCount: host._totalFrames,
        };

        host.onMotionLoaded?.(motionInfo);
        return motionInfo;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to load pose:", message);
        host.onError?.(`Pose load error: ${message}`);
        return null;
    }
}

export async function loadCameraVMD(host: any, filePath: string): Promise<MotionInfo | null> {
    try {
        const pathParts = filePath.replace(/\\/g, "/");
        const lastSlash = pathParts.lastIndexOf("/");
        const fileName = pathParts.substring(lastSlash + 1);

        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            host.onError?.("Failed to read camera VMD file");
            return null;
        }

        const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
        const blob = new Blob([uint8]);
        const blobUrl = URL.createObjectURL(blob);

        const animationPromise = host.vmdLoader.loadAsync("cameraMotion", blobUrl);
        let animation: Awaited<typeof animationPromise>;
        try {
            animation = await animationPromise;
        } finally {
            URL.revokeObjectURL(blobUrl);
        }

        if (animation.cameraTrack.frameNumbers.length === 0) {
            host.onError?.("This VMD has no camera track");
            return null;
        }

        host.syncMmdCameraFromViewportCamera(true);

        if (host.cameraAnimationHandle !== null) {
            host.mmdCamera.destroyRuntimeAnimation(host.cameraAnimationHandle);
            host.cameraAnimationHandle = null;
        }

        host.cameraAnimationHandle = host.mmdCamera.createRuntimeAnimation(animation);
        host.mmdCamera.setRuntimeAnimation(host.cameraAnimationHandle);
        host.hasCameraMotion = true;
        host.cameraMotionPath = filePath;
        host.cameraSourceAnimation = animation;
        host.cameraKeyframeFrames = new Uint32Array(animation.cameraTrack.frameNumbers);
        host.emitMergedKeyframeTracks();

        host._currentFrame = 0;
        host.mmdRuntime.seekAnimation(0, true);
        host.onFrameUpdate?.(host._currentFrame, host._totalFrames);

        const motionInfo: MotionInfo = {
            name: fileName.replace(/\.vmd$/i, ""),
            path: filePath,
            frameCount: host._totalFrames,
        };

        host.onCameraMotionLoaded?.(motionInfo);
        return motionInfo;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to load camera VMD:", message);
        host.onError?.(`Camera VMD load error: ${message}`);
        return null;
    }
}

export async function loadMP3(host: any, filePath: string): Promise<boolean> {
    try {
        const pathParts = filePath.replace(/\\/g, "/");
        const lastSlash = pathParts.lastIndexOf("/");
        const fileName = pathParts.substring(lastSlash + 1);

        const buffer = await window.electronAPI.readBinaryFile(filePath);
        if (!buffer) {
            host.onError?.("Audio file read failed");
            return false;
        }

        if (host.audioBlobUrl) {
            URL.revokeObjectURL(host.audioBlobUrl);
        }
        if (host.audioPlayer) {
            host.audioPlayer.dispose();
        }

        const uint8 = new Uint8Array(buffer as unknown as ArrayBuffer);
        const blob = new Blob([uint8], { type: getAudioMimeType(fileName) });
        host.audioBlobUrl = URL.createObjectURL(blob);

        host.audioPlayer = new StreamAudioPlayer(host.scene);
        host.audioPlayer.source = host.audioBlobUrl;
        await host.mmdRuntime.setAudioPlayer(host.audioPlayer);
        host.audioSourcePath = filePath;

        host.onAudioLoaded?.(fileName.replace(/\.(mp3|wav|wave|ogg)$/i, ""));
        return true;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("Failed to load audio:", message);
        host.onError?.(`Audio load error: ${message}`);
        return false;
    }
}
