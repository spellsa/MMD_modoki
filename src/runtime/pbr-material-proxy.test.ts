import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Material } from "@babylonjs/core/Materials/material";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { describe, expect, it } from "vitest";
import { PbrMaterialProxy } from "./pbr-material-proxy";

function createMaterial(): PBRMaterial {
    return {
        albedoColor: new Color3(0.2, 0.3, 0.4),
        reflectionColor: new Color3(0.5, 0.6, 0.7),
        ambientColor: new Color3(0.1, 0.15, 0.2),
        alpha: 1,
        roughness: 0.35,
        transparencyMode: Material.MATERIAL_OPAQUE,
    } as PBRMaterial;
}

describe("PbrMaterialProxy", () => {
    it("applies MMD material morph values to PBR properties", () => {
        const material = createMaterial();
        const mesh = { isVisible: true } as Mesh;
        const proxy = new PbrMaterialProxy(material, [mesh]);

        proxy.diffuse[0] = 0.8;
        proxy.diffuse[3] = 0.5;
        proxy.specular[1] = 0.9;
        proxy.ambient[2] = 0.75;
        proxy.shininess = 80;
        proxy.applyChanges();

        expect(material.albedoColor.r).toBe(0.8);
        expect(material.alpha).toBe(0.5);
        expect(material.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
        expect(material.reflectionColor.g).toBe(0.9);
        expect(material.ambientColor.b).toBe(0.75);
        expect(material.roughness).toBe(0.8);
        expect(mesh.isVisible).toBe(true);
    });

    it("restores initial values and hides fully transparent meshes", () => {
        const material = createMaterial();
        const mesh = { isVisible: true } as Mesh;
        const proxy = new PbrMaterialProxy(material, [mesh]);

        proxy.diffuse[0] = 1;
        proxy.diffuse[3] = 0;
        proxy.shininess = 100;
        proxy.applyChanges();
        expect(mesh.isVisible).toBe(false);

        proxy.reset();
        proxy.applyChanges();
        expect(material.albedoColor.r).toBe(0.2);
        expect(material.alpha).toBe(1);
        expect(material.roughness).toBe(0.35);
        expect(material.transparencyMode).toBe(Material.MATERIAL_OPAQUE);
        expect(mesh.isVisible).toBe(true);
    });
});
