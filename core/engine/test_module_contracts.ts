import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateModuleContracts } from "./moduleContractValidator.js";

function testEldoraShadowContracts(): void {
  console.log("🚀 开始验证 eldora_shadow 模组 contract...");

  const moduleRoot = join(process.cwd(), "..", "data", "modules", "eldora_shadow");
  const manifest = readJson(join(moduleRoot, "module_manifest.json"));
  const modulePlot = readJson(join(moduleRoot, "module_plot.json"));
  const areaFiles = ["THORN_VILLAGE.json", "WHISPERING_CATACOMBS.json", "CRIMSON_SANCTUM.json"];
  const areas = areaFiles.map((fileName) => readJson(join(moduleRoot, "areas", fileName)));

  const result = validateModuleContracts({
    manifest,
    modulePlot,
    areas,
  });

  if (result.warnings.length > 0) {
    throw new Error(
      `❌ 模组 contract 警告未清理:\n${result.warnings
        .map((issue) => `- [${issue.code}] ${issue.file}: ${issue.message}`)
        .join("\n")}`,
    );
  }

  if (result.errors.length > 0) {
    throw new Error(
      `❌ 模组 contract 校验失败:\n${result.errors
        .map((issue) => `- [${issue.code}] ${issue.file}: ${issue.message}`)
        .join("\n")}`,
    );
  }

  console.log("✅ eldora_shadow 模组 contract 校验通过。");
}

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

testEldoraShadowContracts();
