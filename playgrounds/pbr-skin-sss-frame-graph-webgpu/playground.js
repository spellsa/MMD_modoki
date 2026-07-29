export const createScene = async function () {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.055, 0.065, 0.085, 1);

    const camera = new BABYLON.ArcRotateCamera(
        "camera",
        -Math.PI / 2,
        Math.PI / 2.25,
        0.95,
        BABYLON.Vector3.Zero(),
        scene,
    );
    camera.minZ = 0.01;
    camera.lowerRadiusLimit = 0.5;
    camera.upperRadiusLimit = 2;
    camera.attachControl(canvas, true);

    const directionalLight = new BABYLON.DirectionalLight(
        "directionalLight",
        new BABYLON.Vector3(-0.35, -0.8, 0.45),
        scene,
    );
    directionalLight.position = new BABYLON.Vector3(0.4, 0.8, -0.6);
    directionalLight.intensity = 2.5;

    const environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env",
        scene,
    );
    scene.environmentTexture = environmentTexture;

    const createSkinMaterial = (name) => {
        const material = new BABYLON.PBRMaterial(name, scene);
        material.albedoColor = new BABYLON.Color3(0.78, 0.48, 0.4);
        material.metallic = 0;
        material.roughness = 0.72;
        material.environmentIntensity = 1;
        material.specularIntensity = 0.35;
        material.subSurface.isRefractionEnabled = false;
        material.subSurface.isTranslucencyEnabled = false;
        return material;
    };

    const standardMaterial = createSkinMaterial("standardMaterial");
    const scatteringMaterial = createSkinMaterial("scatteringMaterial");

    const standardSphere = BABYLON.MeshBuilder.CreateSphere(
        "standardSphere",
        { diameter: 0.4, segments: 64 },
        scene,
    );
    standardSphere.position.x = -0.24;
    standardSphere.material = standardMaterial;

    const scatteringSphere = BABYLON.MeshBuilder.CreateSphere(
        "scatteringSphere",
        { diameter: 0.4, segments: 64 },
        scene,
    );
    scatteringSphere.position.x = 0.24;
    scatteringSphere.material = scatteringMaterial;

    const groundMaterial = new BABYLON.PBRMaterial("groundMaterial", scene);
    groundMaterial.albedoColor = new BABYLON.Color3(0.13, 0.15, 0.19);
    groundMaterial.metallic = 0;
    groundMaterial.roughness = 0.9;

    const ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 2, height: 2 },
        scene,
    );
    ground.position.y = -0.22;
    ground.material = groundMaterial;

    const subSurfaceConfiguration = scene.enableSubSurfaceForPrePass();
    if (!subSurfaceConfiguration) {
        throw new Error("SubSurfaceConfiguration could not be enabled.");
    }

    subSurfaceConfiguration.metersPerUnit = 1;
    scatteringMaterial.subSurface.scatteringDiffusionProfile =
        new BABYLON.Color3(0.0016, 0.00152, 0.00148);
    scatteringMaterial.subSurface.isScatteringEnabled = true;

    const sceneColorTarget = new BABYLON.RenderTargetTexture(
        "frameGraphSceneColor",
        {
            width: Math.max(1, engine.getRenderWidth()),
            height: Math.max(1, engine.getRenderHeight()),
        },
        scene,
        {
            generateMipMaps: false,
            doNotChangeAspectRatio: true,
            generateDepthBuffer: true,
            generateStencilBuffer: true,
            samples: 1,
        },
    );
    sceneColorTarget.activeCamera = camera;
    sceneColorTarget.renderList = null;
    sceneColorTarget.renderParticles = true;
    sceneColorTarget.renderSprites = true;
    sceneColorTarget.ignoreCameraViewport = true;
    sceneColorTarget.useCameraPostProcesses = false;

    const sceneColorTexture = sceneColorTarget.getInternalTexture();
    if (!sceneColorTexture) {
        throw new Error("The intermediate scene-color texture was not created.");
    }

    const frameGraph = new BABYLON.FrameGraph(scene, false);
    frameGraph.name = "SSS Frame Graph comparison";

    const sourceTextureHandle = frameGraph.textureManager.importTexture(
        "frameGraphSceneColor",
        sceneColorTexture,
    );

    const imageProcessingEffect =
        new BABYLON.ThinImageProcessingPostProcess(
            "frameGraphImageProcessing",
            frameGraph.engine,
            {
                scene,
                shaderLanguage: engine.isWebGPU
                    ? BABYLON.ShaderLanguage.WGSL
                    : BABYLON.ShaderLanguage.GLSL,
            },
        );
    imageProcessingEffect.fromLinearSpace = false;

    const imageProcessingTask =
        new BABYLON.FrameGraphImageProcessingTask(
            "frameGraphImageProcessing",
            frameGraph,
            imageProcessingEffect,
        );
    imageProcessingTask.sourceTexture = sourceTextureHandle;
    imageProcessingTask.disabled = true;
    frameGraph.addTask(imageProcessingTask);

    const outputTask = new BABYLON.FrameGraphCopyToBackbufferColorTask(
        "frameGraphOutput",
        frameGraph,
    );
    outputTask.sourceTexture = imageProcessingTask.outputTexture;
    frameGraph.addTask(outputTask);

    await frameGraph.buildAsync();

    const routes = {
        direct: "1: Direct scene render",
        copy: "2: Intermediate RT -> Frame Graph copy",
        imageProcessing:
            "3: Intermediate RT -> Frame Graph image processing -> copy",
    };

    let route = "direct";
    let scatteringEnabled = true;
    let iblEnabled = true;
    let directLightEnabled = true;

    const addSceneColorTarget = () => {
        if (!camera.customRenderTargets.includes(sceneColorTarget)) {
            camera.customRenderTargets.push(sceneColorTarget);
        }
    };

    const removeSceneColorTarget = () => {
        const index = camera.customRenderTargets.indexOf(sceneColorTarget);
        if (index >= 0) {
            camera.customRenderTargets.splice(index, 1);
        }
    };

    const applyRoute = (nextRoute) => {
        route = nextRoute;
        if (route === "direct") {
            removeSceneColorTarget();
            imageProcessingTask.disabled = true;
            subSurfaceConfiguration.needsImageProcessing = true;
        } else {
            addSceneColorTarget();
            imageProcessingTask.disabled = route !== "imageProcessing";
            subSurfaceConfiguration.needsImageProcessing = false;
        }
    };

    const reportState = () => {
        console.table({
            babylonVersion: BABYLON.Engine.Version,
            engine: engine.getClassName(),
            route: routes[route],
            scatteringEnabled,
            iblEnabled,
            directLightEnabled,
            sceneColorUseCameraPostProcesses:
                sceneColorTarget.useCameraPostProcesses,
            metersPerUnit: subSurfaceConfiguration.metersPerUnit,
            imageProcessingBySss:
                subSurfaceConfiguration.needsImageProcessing,
        });
        console.info(
            "Keys: 1=direct, 2=RT+FrameGraph copy, " +
                "3=RT+FrameGraph image processing, S=SSS, " +
                "N=needsImageProcessing, I=IBL, L=direct light",
        );
    };

    scene.onAfterRenderObservable.add(() => {
        if (route !== "direct") {
            frameGraph.execute();
        }
    });

    scene.onKeyboardObservable.add((keyboardInfo) => {
        if (keyboardInfo.type !== BABYLON.KeyboardEventTypes.KEYDOWN) {
            return;
        }

        const key = keyboardInfo.event.key.toLowerCase();
        if (key === "1") {
            applyRoute("direct");
        } else if (key === "2") {
            applyRoute("copy");
        } else if (key === "3") {
            applyRoute("imageProcessing");
        } else if (key === "s") {
            scatteringEnabled = !scatteringEnabled;
            scatteringMaterial.subSurface.isScatteringEnabled =
                scatteringEnabled;
        } else if (key === "n") {
            subSurfaceConfiguration.needsImageProcessing =
                !subSurfaceConfiguration.needsImageProcessing;
        } else if (key === "i") {
            iblEnabled = !iblEnabled;
            scene.environmentTexture = iblEnabled
                ? environmentTexture
                : null;
        } else if (key === "l") {
            directLightEnabled = !directLightEnabled;
            directionalLight.setEnabled(directLightEnabled);
        } else {
            return;
        }

        reportState();
    });

    scene.onDisposeObservable.add(() => {
        frameGraph.dispose();
        sceneColorTarget.dispose();
    });

    applyRoute("direct");
    scene.executeWhenReady(reportState);
    return scene;
};
