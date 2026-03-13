// @apply-without-toon
{
let one=vec3f(1.0);
let rawBaseColor=clamp(baseColor.rgb,vec3f(0.0),vec3f(1.0));
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let fallbackToonBand=vec3f(0.78,0.78,0.78);
let toonRaw=max(vec3f(clamp(shadow,0.02,0.98)),fallbackToonBand*0.22);
let toneBandLuma=clamp(dot(toonRaw,vec3f(0.299,0.587,0.114)),0.0,1.0);
let litMask=clamp(mix(0.12,1.0,toneBandLuma),0.0,1.0);
let shadowMask=1.0-litMask;
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let shadowTerm=rawBaseColor*mix(one,toonShadowBand,shadowMask);
let lightBoost=max(lightTint-one,vec3f(0.0));
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));

baseColor=vec4f(rawBaseColor,baseColor.a);
diffuseColor=rawBaseColor;
baseAmbientColor=max(fallbackToonBand,shadowTint);
diffuseBase+=shadowTerm;

toonFlatLightMask=litMask*clamp(boostEnergy*(0.9+flatStrength*2.6),0.0,1.0);
toonFlatLightColor=lightBoost*(0.7+flatStrength*2.8)*(0.4+0.35*1.8);
}
