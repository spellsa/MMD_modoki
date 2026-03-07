#ifdef TOON_TEXTURE_COLOR
{
let lightTint=max(uniforms.toonTextureMultiplicativeColor.rgb,vec3f(0.0));
let shadowTint=clamp(uniforms.toonTextureAdditiveColor.rgb,vec3f(0.0),vec3f(1.0));
let toonInfluence=clamp(uniforms.toonTextureAdditiveColor.a,0.0,1.0);
var toonRaw=vec3f(clamp(info.ndl*shadow,0.02,0.98));
toonRaw.r=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.r)).r;
toonRaw.g=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.g)).g;
toonRaw.b=textureSample(toonSampler,toonSamplerSampler,vec2f(0.5,toonRaw.b)).b;

let lit=clamp(info.ndl*shadow,0.0,1.0);
let b0=step(0.18,lit);
let b1=step(0.52,lit);
let b2=step(0.82,lit);
let cool=vec3f(0.06,0.25,0.88);
let warm=vec3f(1.00,0.54,0.18);
let high=vec3f(1.00,0.94,0.62);
let mid=mix(cool,warm,0.58);
let poster=cool*(1.0-b0)+mid*(b0-b1)+warm*(b1-b2)+high*b2;
let painted=mix(poster,mix(shadowTint,toonRaw,toonInfluence),0.45);

let punch=mix(0.55,1.35,b2);
diffuseBase+=info.diffuse*painted*punch;
toonFlatLightMask=clamp(b2*0.85,0.0,1.0);
toonFlatLightColor=lightTint*0.18+vec3f(0.22,0.10,0.00)*toonFlatLightMask;
}
#else
diffuseBase+=mix(info.diffuse*shadow,toonNdl*info.diffuse,info.isToon);
#endif
