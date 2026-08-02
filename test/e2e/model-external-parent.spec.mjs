import { expect, test } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launchMmdModoki } from "./electron-app.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tofuPath = resolve(repoRoot, "test/fixtures/external-parent/tofu.pmx");
const platePath = resolve(repoRoot, "test/fixtures/external-parent/plate.pmx");

test("豆腐モデルを皿モデルのセンターボーンへ登録し、追従と解除を確認する", async () => {
  const launched = await launchMmdModoki(repoRoot);
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => Boolean(window.mmdModokiE2e));

    await page.evaluate(async ({ tofu, plate }) => {
      await window.mmdModokiE2e.loadModel(tofu);
      await window.mmdModokiE2e.loadModel(plate);
    }, { tofu: tofuPath, plate: platePath });

    const modelSelect = page.locator("#info-model-select");
    await expect(modelSelect.locator("option")).toHaveCount(3);

    await modelSelect.selectOption("0");
    const childXInput = page.locator("#bone-controls input[data-control-key='tx']");
    const childYInput = page.locator("#bone-controls input[data-control-key='ty']");
    await childXInput.fill("2");
    await childXInput.press("Enter");
    await childYInput.fill("1");
    await childYInput.press("Enter");

    const parentModelSelect = page.locator("#info-external-parent-select");
    const parentBoneSelect = page.locator("#info-parent-bone-select");
    await expect(parentModelSelect).toBeVisible();
    await parentModelSelect.selectOption("1");
    await expect(parentBoneSelect).toHaveValue("センター");
    await page.locator("[data-testid='model-external-parent-register']").click();

    const registered = await page.evaluate(() => window.mmdModokiE2e.getModelExternalParent(0));
    expect(registered).toMatchObject({
        childBoneName: "センター",
        parentBoneName: "センター",
        parentModelIndex: 1,
    });
    await expect(childXInput).toHaveValue("0.00");
    await expect(childYInput).toHaveValue("0.00");

    await modelSelect.selectOption("1");
    const parentYInput = page.locator("#bone-controls input[data-control-key='ty']");
    await parentYInput.fill("5");
    await parentYInput.press("Enter");
    await page.waitForTimeout(250);

    const positions = await page.evaluate(() => ({
      activeModelIndex: window.mmdModokiE2e.getActiveModelIndex(),
      activeTransform: window.mmdModokiE2e.getActiveBoneTransform("センター"),
      child: window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      parent: window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター"),
    }));
    expect(positions.activeModelIndex).toBe(1);
    expect(positions.activeTransform?.position.y).toBeCloseTo(5, 2);
    expect(positions.parent?.y, JSON.stringify(positions)).toBeGreaterThan(4.9);
    expect(positions.child?.y).toBeCloseTo(positions.parent.y, 2);

    expect(await page.evaluate(() => (
      window.mmdModokiE2e.setBoneGizmoRotationDrag({ x: 25, y: 40, z: 0 }, true)
    ))).toBe(true);
    await page.waitForTimeout(250);
    const duringParentRotationDrag = await page.evaluate(() => ({
      child: window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      parent: window.mmdModokiE2e.getModelBoneRenderedPosition(1, "センター"),
    }));
    expect(duringParentRotationDrag.child?.y).toBeCloseTo(duringParentRotationDrag.parent.y, 2);
    expect(await page.evaluate(() => (
      window.mmdModokiE2e.setBoneGizmoRotationDrag({ x: 25, y: 40, z: 0 }, false)
    ))).toBe(true);
    await page.waitForTimeout(250);

    await modelSelect.selectOption("0");
    await page.waitForTimeout(250);
    const gizmoState = await page.evaluate(() => ({
      child: window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター"),
      gizmo: window.mmdModokiE2e.getBoneGizmoPosition(),
    }));
    expect(gizmoState.gizmo).not.toBeNull();
    expect(gizmoState.gizmo?.x).toBeCloseTo(gizmoState.child.x, 2);
    expect(gizmoState.gizmo?.y).toBeCloseTo(gizmoState.child.y, 2);
    expect(gizmoState.gizmo?.z).toBeCloseTo(gizmoState.child.z, 2);

    await parentModelSelect.selectOption("");
    await page.locator("[data-testid='model-external-parent-register']").click();
    await page.waitForTimeout(250);

    expect(await page.evaluate(() => window.mmdModokiE2e.getModelExternalParent(0))).toBeNull();
    const detachedChild = await page.evaluate(() => (
      window.mmdModokiE2e.getModelBoneRenderedPosition(0, "センター")
    ));
    expect(detachedChild?.y).toBeCloseTo(0, 2);
  } finally {
    await launched.close();
  }
});
