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

let litScalar=clamp(info.ndl*shadow,0.0,1.0);
let geometricLitMask=smoothstep(0.40,0.60,clamp(info.ndl,0.0,1.0))*smoothstep(0.38,0.62,clamp(shadow,0.0,1.0));
let toneBandLuma=clamp(dot(toonRaw,vec3f(0.299,0.587,0.114)),0.0,1.0);
let litMask=clamp(geometricLitMask*mix(1.0,toneBandLuma,0.65),0.0,1.0);
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let shadowTerm=info.diffuse*mix(one,toonShadowBand,1.0-litMask);
let rawMaterialColor=clamp(info.diffuse,vec3f(0.0),vec3f(1.0));

let surfaceLuma=clamp(dot(rawMaterialColor,vec3f(0.299,0.587,0.114)),0.0,1.0);
let baseMaterialColor=rawMaterialColor;
let normalizedMaterialColor=baseMaterialColor/max(max(baseMaterialColor.r,max(baseMaterialColor.g,baseMaterialColor.b)),0.001);
let colorChroma=max(baseMaterialColor.r,max(baseMaterialColor.g,baseMaterialColor.b))-min(baseMaterialColor.r,min(baseMaterialColor.g,baseMaterialColor.b));
let colorMask=smoothstep(0.05,0.30,colorChroma);
let emissiveThreshold=mix(0.52,0.88,clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0));
let emissiveSoftness=mix(0.04,0.20,toonInfluence);
let emissiveSeed=surfaceLuma;
let rawEmissiveMask=smoothstep(emissiveThreshold-emissiveSoftness,emissiveThreshold+emissiveSoftness,emissiveSeed);
let rawHaloMask=max(
    smoothstep(emissiveThreshold-emissiveSoftness*2.4,emissiveThreshold+emissiveSoftness*0.2,emissiveSeed)-rawEmissiveMask,
    0.0
);
let lightBoost=max(lightTint-one,vec3f(0.0));
let emissiveMask=rawEmissiveMask*mix(0.08,1.0,colorMask);
let haloMask=rawHaloMask*mix(0.05,0.85,colorMask);
let materialGlowColor=mix(baseMaterialColor,normalizedMaterialColor,mix(0.55,0.85,surfaceLuma))*mix(0.80,1.20,colorMask);
let emissiveColor=materialGlowColor+(lightBoost*materialGlowColor)*0.18;
let bloomLikeGlow=emissiveColor*(emissiveMask*0.88+haloMask*0.34);
let baseLiftMask=clamp(mix(0.30,0.65,colorMask)+emissiveMask*0.20,0.0,0.82);
let luminousBase=mix(shadowTerm,rawMaterialColor,baseLiftMask);

diffuseBase+=luminousBase+bloomLikeGlow;
toonFlatLightMask=clamp(emissiveMask+haloMask*0.9,0.0,1.0);
toonFlatLightColor=emissiveColor*(0.56+emissiveMask*0.52+haloMask*0.22);
}
#else
{
let rawMaterialColor=clamp(info.diffuse,vec3f(0.0),vec3f(1.0));
let shadedColor=clamp(mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon),vec3f(0.0),vec3f(1.0));
let baseMaterialColor=rawMaterialColor;
let normalizedMaterialColor=baseMaterialColor/max(max(baseMaterialColor.r,max(baseMaterialColor.g,baseMaterialColor.b)),0.001);
let surfaceLuma=clamp(dot(rawMaterialColor,vec3f(0.299,0.587,0.114)),0.0,1.0);
let colorChroma=max(baseMaterialColor.r,max(baseMaterialColor.g,baseMaterialColor.b))-min(baseMaterialColor.r,min(baseMaterialColor.g,baseMaterialColor.b));
let colorMask=smoothstep(0.05,0.30,colorChroma);
let emissiveThreshold=0.72;
let emissiveSoftness=0.12;
let emissiveSeed=surfaceLuma;
let rawEmissiveMask=smoothstep(emissiveThreshold-emissiveSoftness,emissiveThreshold+emissiveSoftness,emissiveSeed);
let rawHaloMask=max(
    smoothstep(emissiveThreshold-emissiveSoftness*2.2,emissiveThreshold+emissiveSoftness*0.15,emissiveSeed)-rawEmissiveMask,
    0.0
);
let emissiveMask=rawEmissiveMask*mix(0.08,1.0,colorMask);
let haloMask=rawHaloMask*mix(0.05,0.80,colorMask);
let emissiveColor=mix(baseMaterialColor,normalizedMaterialColor,mix(0.45,0.80,surfaceLuma))*mix(0.75,1.15,colorMask);
let baseLiftMask=clamp(mix(0.28,0.60,colorMask)+emissiveMask*0.18,0.0,0.78);
let luminousBase=mix(shadedColor,rawMaterialColor,baseLiftMask);

diffuseBase+=luminousBase+emissiveColor*(emissiveMask*0.82+haloMask*0.28);
toonFlatLightMask=clamp(emissiveMask+haloMask*0.75,0.0,1.0);
toonFlatLightColor=emissiveColor*(0.52+emissiveMask*0.40+haloMask*0.18);
}
#endif
