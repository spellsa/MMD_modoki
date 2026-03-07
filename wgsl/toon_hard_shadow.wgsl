#ifdef TOON_TEXTURE_COLOR
{
let one=vec3f(1.0);
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
var toonRaw=vec3f(clamp(info.ndl*shadow,0.02,0.98));
toonRaw.r=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.r)).r;
toonRaw.g=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.g)).g;
toonRaw.b=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.b)).b;
let litMask=step(0.58,clamp(info.ndl*shadow,0.0,1.0));
let shadowMask=1.0-litMask;
let toonShadowBand=mix(shadowTint,toonRaw,toonInfluence);
let shadowTerm=info.diffuse*mix(one,toonShadowBand,shadowMask);
toonFlatLightMask=litMask*0.25;
toonFlatLightColor=vec3f(0.08,0.08,0.08)*toonFlatLightMask;
diffuseBase+=shadowTerm;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif

