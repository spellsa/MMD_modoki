// @apply-without-toon
{
let baseLitColor=clamp(baseColor.rgb,vec3f(0.0),vec3f(1.0));
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let flatStrength=clamp(uniforms.toonTextureMultiplicativeColor.a,0.0,1.0);
let fallbackToonLit=vec3f(0.82,0.82,0.82);
let effectiveLightTint=max(lightTint,fallbackToonLit);
let litBoost=max(effectiveLightTint,vec3f(1.0));
let lightBoost=max(lightTint-vec3f(1.0),vec3f(0.0));
let forcedLitColor=baseLitColor*mix(vec3f(1.0),litBoost,0.55+flatStrength*0.35);
let boostEnergy=max(lightBoost.r,max(lightBoost.g,lightBoost.b));
let alphaCompensation=mix(1.0,1.0/max(baseColor.a,0.08),0.9);
let forcedBoostColor=max(lightBoost*1.45,effectiveLightTint*0.11)*(1.05+flatStrength*3.0)*(0.85+boostEnergy*0.85)*alphaCompensation;

// Ignore PMX toon flags and shadow rules entirely: always display as a lit face.
baseColor=vec4f(baseLitColor,baseColor.a);
diffuseColor=baseLitColor;
baseAmbientColor=fallbackToonLit;
diffuseBase+=forcedLitColor*mix(1.0,alphaCompensation,0.6);

#ifdef SPECULARTERM
info.specular=vec3f(0.0);
#endif
#ifdef SHEEN
info.sheen=vec3f(0.0);
#endif
#ifdef CLEARCOAT
info.clearCoat=vec4f(0.0);
#endif

// Force the same "light over 100%" additive lift to apply regardless of PMX toon flags,
// toon texture presence, or material-specific face settings.
toonFlatLightMask=select(0.0,1.0,boostEnergy>0.0001);
toonFlatLightColor=forcedBoostColor;
toonFinalOverrideMix=0.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=vec3f(0.0);
toonFinalOverrideLumaMin=0.0;
toonFinalOverrideLumaMax=1.0;
}
