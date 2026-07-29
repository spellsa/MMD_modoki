const createScene = async function () {
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

    let scatteringEnabled = true;
    let iblEnabled = true;
    let directLightEnabled = true;

    const reportState = () => {
        console.table({
            babylonVersion: BABYLON.Engine.Version,
            engine: engine.getClassName(),
            scatteringEnabled,
            iblEnabled,
            directLightEnabled,
            metersPerUnit: subSurfaceConfiguration.metersPerUnit,
            imageProcessingBySss:
                subSurfaceConfiguration.needsImageProcessing,
        });
    };

    scene.onKeyboardObservable.add((keyboardInfo) => {
        if (keyboardInfo.type !== BABYLON.KeyboardEventTypes.KEYDOWN) {
            return;
        }

        const key = keyboardInfo.event.key.toLowerCase();
        if (key === "s") {
            scatteringEnabled = !scatteringEnabled;
            scatteringMaterial.subSurface.isScatteringEnabled =
                scatteringEnabled;
        } else if (key === "i") {
            iblEnabled = !iblEnabled;
            scene.environmentTexture = iblEnabled ? environmentTexture : null;
        } else if (key === "l") {
            directLightEnabled = !directLightEnabled;
            directionalLight.setEnabled(directLightEnabled);
        } else {
            return;
        }

        reportState();
    });

    scene.executeWhenReady(reportState);
    return scene;
};
