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
let bandMid=step(0.25,litScalar);
let bandHigh=step(0.68,litScalar);
let shadowBand=vec3f(0.05,0.02,0.10);
let midBand=vec3f(0.16,0.22,0.90);
let highBand=vec3f(0.18,0.95,1.00);
let neonBand=shadowBand*(1.0-bandMid)+midBand*(bandMid-bandHigh)+highBand*bandHigh;
let toonBand=mix(neonBand,mix(shadowTint,toonRaw,toonInfluence),0.35);

let rimMask=pow(1.0-clamp(info.ndl,0.0,1.0),2.4);
let rimColor=vec3f(1.00,0.18,0.82)*rimMask*0.75;

diffuseBase+=info.diffuse*toonBand+rimColor;
toonFlatLightMask=clamp(bandHigh+rimMask*0.6,0.0,1.0);
toonFlatLightColor=lightTint*0.15+vec3f(0.04,0.35,0.95)*toonFlatLightMask;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif
