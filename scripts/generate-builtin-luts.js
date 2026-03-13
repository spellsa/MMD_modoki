const fs = require("fs");
const path = require("path");

const LUT_SIZE = 16;
const LUT_MAX_VALUE = 4095;
const OUTPUT_DIR = path.resolve(__dirname, "..", "lut");

const presets = [
  { id: "anime-soft" },
  { id: "anime-cool" },
  { id: "anime-dramatic" },
  { id: "monotone" },
  { id: "sepia" },
  { id: "teal-orange" },
];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const transformLutColor = (presetId, r, g, b) => {
  let outR = r;
  let outG = g;
  let outB = b;

  const applySaturation = (saturationScale) => {
    const luma = outR * 0.2126 + outG * 0.7152 + outB * 0.0722;
    outR = luma + (outR - luma) * saturationScale;
    outG = luma + (outG - luma) * saturationScale;
    outB = luma + (outB - luma) * saturationScale;
  };

  const applyContrast = (contrastScale) => {
    outR = (outR - 0.5) * contrastScale + 0.5;
    outG = (outG - 0.5) * contrastScale + 0.5;
    outB = (outB - 0.5) * contrastScale + 0.5;
  };

  const mixColor = (mixR, mixG, mixB, amount) => {
    outR = outR * (1 - amount) + mixR * amount;
    outG = outG * (1 - amount) + mixG * amount;
    outB = outB * (1 - amount) + mixB * amount;
  };

  switch (presetId) {
    case "anime-soft":
      applyContrast(1.04);
      applySaturation(1.14);
      outR += 0.04;
      outG += 0.015;
      outB -= 0.03;
      break;
    case "anime-cool":
      applyContrast(1.05);
      applySaturation(1.1);
      outR -= 0.02;
      outG += 0.015;
      outB += 0.05;
      break;
    case "anime-dramatic":
      applyContrast(1.14);
      applySaturation(1.22);
      outR += 0.03;
      outG -= 0.01;
      outB += 0.015;
      break;
    case "monotone": {
      const luma = outR * 0.299 + outG * 0.587 + outB * 0.114;
      outR = luma;
      outG = luma;
      outB = luma;
      applyContrast(1.08);
      break;
    }
    case "sepia": {
      const srcR = outR;
      const srcG = outG;
      const srcB = outB;
      outR = srcR * 0.393 + srcG * 0.769 + srcB * 0.189;
      outG = srcR * 0.349 + srcG * 0.686 + srcB * 0.168;
      outB = srcR * 0.272 + srcG * 0.534 + srcB * 0.131;
      applyContrast(1.04);
      mixColor(0.58, 0.44, 0.25, 0.08);
      break;
    }
    case "teal-orange": {
      const luma = outR * 0.2126 + outG * 0.7152 + outB * 0.0722;
      const shadowWeight = clamp01((0.52 - luma) / 0.52);
      const highlightWeight = clamp01((luma - 0.48) / 0.52);
      applyContrast(1.1);
      applySaturation(1.08);
      outR += highlightWeight * 0.08 - shadowWeight * 0.015;
      outG += highlightWeight * 0.02 + shadowWeight * 0.01;
      outB -= highlightWeight * 0.045;
      outR -= shadowWeight * 0.05;
      outG += shadowWeight * 0.03;
      outB += shadowWeight * 0.08;
      break;
    }
    default:
      break;
  }

  return {
    r: clamp01(outR),
    g: clamp01(outG),
    b: clamp01(outB),
  };
};

const buildLut3dlText = (presetId) => {
  const lines = [];
  lines.push(Array.from({ length: LUT_SIZE }, (_, i) => String(i)).join(" "));

  for (let r = 0; r < LUT_SIZE; r += 1) {
    for (let g = 0; g < LUT_SIZE; g += 1) {
      for (let b = 0; b < LUT_SIZE; b += 1) {
        const color = transformLutColor(
          presetId,
          r / (LUT_SIZE - 1),
          g / (LUT_SIZE - 1),
          b / (LUT_SIZE - 1),
        );
        const rr = Math.round(color.r * LUT_MAX_VALUE);
        const gg = Math.round(color.g * LUT_MAX_VALUE);
        const bb = Math.round(color.b * LUT_MAX_VALUE);
        lines.push(`${rr} ${gg} ${bb}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const preset of presets) {
  const outputPath = path.join(OUTPUT_DIR, `${preset.id}.3dl`);
  fs.writeFileSync(outputPath, buildLut3dlText(preset.id), "utf8");
  console.log(`wrote ${path.relative(process.cwd(), outputPath)}`);
}
