// @apply-without-toon
{
let rawBaseColor=clamp(baseColor.rgb,vec3f(0.0),vec3f(1.0));
let fallbackShadowColor=vec3f(0.56,0.56,0.56);
let shadowTint=max(clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0)),fallbackShadowColor);
let forcedShadowColor=clamp(rawBaseColor*shadowTint,vec3f(0.0),vec3f(1.0));
baseColor=vec4f(rawBaseColor,baseColor.a);
diffuseColor=rawBaseColor;
baseAmbientColor=fallbackShadowColor;
diffuseBase+=forcedShadowColor;

#ifdef SPECULARTERM
info.specular=vec3f(0.0);
#endif
#ifdef SHEEN
info.sheen=vec3f(0.0);
#endif
#ifdef CLEARCOAT
info.clearCoat=vec4f(0.0);
#endif

toonFlatLightMask=0.0;
toonFlatLightColor=vec3f(0.0);
}
