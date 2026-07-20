import { Material } from "@babylonjs/core/Materials/material";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Vec3, Vec4 } from "babylon-mmd/esm/Loader/Parser/mmdTypes";
import type { IMmdMaterialProxy } from "babylon-mmd/esm/Runtime/IMmdMaterialProxy";

function finiteOr(value: number | null | undefined, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Minimal material-morph bridge for babylon-mmd's PBRMaterialBuilder.
 *
 * Sphere/toon textures and MMD outlines are intentionally unsupported by the
 * upstream PBR builder, so their morph channels remain inert here as well.
 */
export class PbrMaterialProxy implements IMmdMaterialProxy {
    public readonly diffuse: Vec4;
    public readonly specular: Vec3;
    public shininess: number;
    public readonly ambient: Vec3;
    public readonly edgeColor: Vec4 = [0, 0, 0, 0];
    public edgeSize = 0;
    public readonly textureMultiplicativeColor: Vec4 = [1, 1, 1, 1];
    public readonly textureAdditiveColor: Vec4 = [0, 0, 0, 0];
    public readonly sphereTextureMultiplicativeColor: Vec4 = [1, 1, 1, 1];
    public readonly sphereTextureAdditiveColor: Vec4 = [0, 0, 0, 0];
    public readonly toonTextureMultiplicativeColor: Vec4 = [1, 1, 1, 1];
    public readonly toonTextureAdditiveColor: Vec4 = [0, 0, 0, 0];

    private readonly initialDiffuse: Vec4;
    private readonly initialSpecular: Vec3;
    private readonly initialShininess: number;
    private readonly initialAmbient: Vec3;
    private readonly initialTransparencyMode: number | null;

    constructor(
        private readonly material: PBRMaterial,
        private readonly referencedMeshes: readonly Mesh[],
    ) {
        const albedo = material.albedoColor;
        this.diffuse = [albedo.r, albedo.g, albedo.b, material.alpha];
        const reflection = material.reflectionColor;
        this.specular = [reflection.r, reflection.g, reflection.b];
        this.shininess = finiteOr(material.roughness, 0) * 100;
        const ambient = material.ambientColor;
        this.ambient = [ambient.r, ambient.g, ambient.b];

        this.initialDiffuse = [...this.diffuse];
        this.initialSpecular = [...this.specular];
        this.initialShininess = this.shininess;
        this.initialAmbient = [...this.ambient];
        this.initialTransparencyMode = material.transparencyMode;
    }

    public reset(): void {
        for (let index = 0; index < 4; index += 1) {
            this.diffuse[index] = this.initialDiffuse[index];
        }
        for (let index = 0; index < 3; index += 1) {
            this.specular[index] = this.initialSpecular[index];
            this.ambient[index] = this.initialAmbient[index];
        }
        this.shininess = this.initialShininess;
    }

    public applyChanges(): void {
        this.material.albedoColor.set(this.diffuse[0], this.diffuse[1], this.diffuse[2]);
        this.material.alpha = this.diffuse[3];
        this.material.transparencyMode = this.diffuse[3] === 1
            ? this.initialTransparencyMode
            : Material.MATERIAL_ALPHABLEND;

        const visible = this.diffuse[3] > 0;
        for (const mesh of this.referencedMeshes) {
            mesh.isVisible = visible;
        }

        this.material.reflectionColor.set(this.specular[0], this.specular[1], this.specular[2]);
        this.material.roughness = Math.max(0, Math.min(1, finiteOr(this.shininess, 0) / 100));
        this.material.ambientColor.set(this.ambient[0], this.ambient[1], this.ambient[2]);
    }
}
