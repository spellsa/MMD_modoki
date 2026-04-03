#ifdef TOON_TEXTURE_COLOR
{
let rawBaseColor=clamp(baseColor.rgb,vec3f(0.0),vec3f(1.0));
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let toonShadowPixel=vec2i(0,0);
let toonRaw=clamp(textureLoad(toonSampler,toonShadowPixel,0).rgb,vec3f(0.0),vec3f(1.0));
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let forcedShadowColor=clamp(rawBaseColor*toonShadowBand,vec3f(0.0),vec3f(1.0));
baseColor=vec4f(rawBaseColor,baseColor.a);
diffuseColor=rawBaseColor;
toonFlatLightMask=0.0;
toonFlatLightColor=vec3f(0.0);
toonFinalOverrideMix=1.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=forcedShadowColor;
toonFinalOverrideLumaMin=0.0;
toonFinalOverrideLumaMax=1.0;
diffuseBase+=forcedShadowColor;
}
#elif defined(IGNORE_DIFFUSE_WHEN_TOON_TEXTURE_DISABLED)
{
let rawBaseColor=clamp(baseColor.rgb,vec3f(0.0),vec3f(1.0));
let fallbackToonBand=vec3f(0.56,0.56,0.56);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let forcedShadowBand=mix(shadowTint,fallbackToonBand,toonInfluence);
let forcedShadowColor=clamp(rawBaseColor*forcedShadowBand,vec3f(0.0),vec3f(1.0));
baseColor=vec4f(rawBaseColor,baseColor.a);
diffuseColor=rawBaseColor;
baseAmbientColor=fallbackToonBand;
toonFlatLightMask=0.0;
toonFlatLightColor=vec3f(0.0);
toonFinalOverrideMix=1.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=forcedShadowColor;
toonFinalOverrideLumaMin=0.0;
toonFinalOverrideLumaMax=1.0;
diffuseBase+=forcedShadowColor;
}
#else
{
let rawBaseColor=clamp(baseColor.rgb,vec3f(0.0),vec3f(1.0));
let fallbackToonBand=vec3f(0.56,0.56,0.56);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
let forcedShadowBand=mix(shadowTint,fallbackToonBand,toonInfluence);
let forcedShadowColor=clamp(rawBaseColor*forcedShadowBand,vec3f(0.0),vec3f(1.0));
baseColor=vec4f(rawBaseColor,baseColor.a);
diffuseColor=rawBaseColor;
baseAmbientColor=fallbackToonBand;
toonFlatLightMask=0.0;
toonFlatLightColor=vec3f(0.0);
toonFinalOverrideMix=1.0;
toonFinalOverrideUseColorLuma=0.0;
toonFinalOverrideColor=forcedShadowColor;
toonFinalOverrideLumaMin=0.0;
toonFinalOverrideLumaMax=1.0;
diffuseBase+=forcedShadowColor;
}
#endif
