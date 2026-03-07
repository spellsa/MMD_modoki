#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
var toonRaw=vec3f(clamp(info.ndl*shadow,0.02,0.98));
toonRaw.r=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.r)).r;
toonRaw.g=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.g)).g;
toonRaw.b=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.b)).b;
let selfMask=smoothstep(0.35,0.65,clamp(info.ndl,0.0,1.0));
let occlusionMask=smoothstep(0.30,0.70,clamp(shadow,0.0,1.0));
let litMask=clamp(selfMask*occlusionMask,0.0,1.0);
let pastelShadowTint=mix(shadowTint,vec3f(0.82,0.80,0.85),0.35);
let toonShadowBand=mix(pastelShadowTint,toonRaw,toonInfluence*0.65);
let shadowTerm=info.diffuse*mix(one,toonShadowBand,1.0-litMask*0.85);
let lightBoost=max(lightTint-one,vec3f(0.0));
toonFlatLightMask=litMask*0.4;
toonFlatLightColor=lightBoost*0.35+vec3f(0.02,0.02,0.025)*toonFlatLightMask;
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif

