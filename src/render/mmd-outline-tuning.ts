import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";

const GLSL_DEFAULT_OUTLINE_OFFSET = "vec3 viewNormal=view*(mat3(finalWorld)*normalUpdated);vec4 projectedPosition=viewProjection*finalWorld*vec4(positionUpdated,1.0);vec2 screenNormal=normalize(vec2(viewNormal));projectedPosition.xy+=screenNormal/(viewport*0.25/*0.5 */)*offset*projectedPosition.w;";
const GLSL_MMD_TAPERED_OUTLINE_OFFSET = "vec3 viewNormal=view*(mat3(finalWorld)*normalUpdated);vec4 projectedPosition=viewProjection*finalWorld*vec4(positionUpdated,1.0);vec3 normalizedViewNormal=normalize(viewNormal);vec2 screenNormal=normalizedViewNormal.xy;projectedPosition.xy+=screenNormal/(viewport*0.25/*0.5 */)*offset*projectedPosition.w;";

const WGSL_DEFAULT_OUTLINE_OFFSET = "var viewNormal: vec3f=uniforms.view*(mat3x3(finalWorld[0].xyz,finalWorld[1].xyz,finalWorld[2].xyz)*normalUpdated);var projectedPosition: vec4f=uniforms.viewProjection*finalWorld*vec4f(positionUpdated,1.0);var screenNormal: vec2f=normalize(viewNormal.xy);projectedPosition=vec4f(\nprojectedPosition.xy+(screenNormal/(uniforms.viewport*0.25/*0.5 */)*uniforms.offset*projectedPosition.w),";
const WGSL_MMD_TAPERED_OUTLINE_OFFSET = "var viewNormal: vec3f=uniforms.view*(mat3x3(finalWorld[0].xyz,finalWorld[1].xyz,finalWorld[2].xyz)*normalUpdated);var projectedPosition: vec4f=uniforms.viewProjection*finalWorld*vec4f(positionUpdated,1.0);var normalizedViewNormal: vec3f=normalize(viewNormal);var screenNormal: vec2f=normalizedViewNormal.xy;projectedPosition=vec4f(\nprojectedPosition.xy+(screenNormal/(uniforms.viewport*0.25/*0.5 */)*uniforms.offset*projectedPosition.w),";

function replaceShaderChunk(source: string | undefined, from: string, to: string): string | undefined {
    if (!source || !source.includes(from)) return source;
    return source.replace(from, to);
}

export function applyMmdOutlineTaperingShader(): void {
    const glslKey = "mmdOutlineVertexShader";
    const wgslKey = "mmdOutlineVertexShader";
    ShaderStore.ShadersStore[glslKey] = replaceShaderChunk(
        ShaderStore.ShadersStore[glslKey],
        GLSL_DEFAULT_OUTLINE_OFFSET,
        GLSL_MMD_TAPERED_OUTLINE_OFFSET,
    ) ?? ShaderStore.ShadersStore[glslKey];
    ShaderStore.ShadersStoreWGSL[wgslKey] = replaceShaderChunk(
        ShaderStore.ShadersStoreWGSL[wgslKey],
        WGSL_DEFAULT_OUTLINE_OFFSET,
        WGSL_MMD_TAPERED_OUTLINE_OFFSET,
    ) ?? ShaderStore.ShadersStoreWGSL[wgslKey];
}
