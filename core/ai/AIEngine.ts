import OpenAIImport from "openai";
import {
  createFallbackAdjudication,
  parseIntentAdjudication,
  type IntentAdjudication,
} from "./IntentAdjudication.js";
import { buildAdjudicationSystemPrompt } from "./adjudicationPrompt.js";
import {
  buildSystemPrompt as buildPromptSystemMessage,
  MAX_RECENT_HISTORY_MESSAGES,
} from "./promptBuilder.js";
import type { PromptContext } from "./promptBuilder.js";
import {
  buildNarrativeCorrectionPrompt,
  validateNarrativeBoundaries,
} from "../validation/NarrativeBoundaryValidator.js";
export type { PromptContext } from "./promptBuilder.js";

/**
 * AIEngine: 叙事大脑适配器
 */
export class AIEngine {
  private client: any | null = null;
  private model: string = "deepseek-chat";
  private readonly strictRetryLimit = 2;

  constructor(config?: { apiKey?: string; baseURL?: string; model?: string }) {
    // 仅使用 import.meta.env，这是 Vite 在浏览器环境下的标准方式
    const env = (import.meta as any).env || {};

    const apiKey =
      config?.apiKey || env.VITE_AI_API_KEY || env.VITE_DEEPSEEK_API_KEY;

    const baseURL =
      config?.baseURL ||
      env.VITE_AI_BASE_URL ||
      env.VITE_DEEPSEEK_BASE_URL ||
      "https://api.deepseek.com";

    this.model = config?.model || env.VITE_AI_MODEL || "deepseek-chat";

    if (apiKey && apiKey !== "在这里填写你的API_KEY" && apiKey !== "") {
      const OpenAIClient = (OpenAIImport as any).default || OpenAIImport;
      this.client = new OpenAIClient({
        apiKey: apiKey,
        baseURL: baseURL,
        dangerouslyAllowBrowser: true, // 允许浏览器环境直连
      });
      console.log(`[AI] LLM 引擎已激活。当前模型: ${this.model}`);
    } else {
      console.log("[AI] 未检测到有效的 API Key，进入 Mock 模式。");
    }
  }

  /**
   * 构造系统提示词：这是 AI 的“演出指南”
   */
  private buildSystemPrompt(context: PromptContext): string {
    return buildPromptSystemMessage(context);
  }

  private buildAdjudicationPrompt(context: PromptContext): string {
    return buildAdjudicationSystemPrompt(context);
  }

  /**
   * 模拟生成 (Mock Mode): 既然现在没连真线，我们先用这个来测试逻辑笼子
   */
  async generateMockResponse(
    userInput: string,
    context: PromptContext,
  ): Promise<string> {
    console.log("[AI Mock] 收到推算请求...");

    // 简单的模拟逻辑：如果玩家提到“进去”或“走”，模拟移动
    if (userInput.includes("进") || userInput.includes("走")) {
      const target =
        context.availableExitOptions?.[0]?.id ||
        context.availableConnections[0] ||
        "UNKNOWN";
      return `你深吸一口气，推开了沉重的木门。这里的空气更加厚重了。[@MOVE(${target})]`;
    }

    return `你在${context.currentLocationName}静静地观察着四周，风声在你耳边低语。[@NARRATE(null)]`;
  }

  generateMockAdjudication(
    userInput: string,
    context: PromptContext,
  ): IntentAdjudication {
    const normalizedInput = String(userInput || "").trim();
    if (!normalizedInput) {
      return createFallbackAdjudication();
    }

    if (/传送|瞬移|直接到最终|最终决战/.test(normalizedInput)) {
      return {
        summary: "玩家试图直接跳过场景与剧情边界。",
        intentType: "wild_request",
        judgment: "blocked",
        reasons: ["scene_not_connected", "plot_locked", "unsupported_action"],
        targets: {
          npcNames: [],
          locationRefs: [],
          itemNames: [],
          encounterIds: [],
        },
        proposedChecks: [],
        proposedActions: [],
        narrativeDirectives: ["acknowledge_player_intent", "stay_in_scene", "preserve_tension"],
      };
    }

    if (/聊|交谈|说话/.test(normalizedInput)) {
      const firstNpc = String(context.allowedNpcSpeakerNames?.[0] || "").trim();
      return {
        summary: firstNpc
          ? `玩家想与${firstNpc}交谈。`
          : "玩家想与当前场景中的人物交谈。",
        intentType: "talk",
        judgment: firstNpc ? "allowed" : "clarify",
        reasons: firstNpc ? [] : ["insufficient_context"],
        targets: {
          npcNames: firstNpc ? [firstNpc] : [],
          locationRefs: [],
          itemNames: [],
          encounterIds: [],
        },
        proposedChecks: [],
        proposedActions: [],
        narrativeDirectives: ["acknowledge_player_intent", "stay_in_scene"],
      };
    }

    if (/进|走|去/.test(normalizedInput)) {
      const firstExit = context.availableExitOptions?.[0];
      if (firstExit?.id) {
        return {
          summary: `玩家试图前往${firstExit.name || firstExit.id}。`,
          intentType: "move",
          judgment: "allowed",
          reasons: [],
          targets: {
            npcNames: [],
            locationRefs: [firstExit.id],
            itemNames: [],
            encounterIds: [],
          },
          proposedChecks: [],
          proposedActions: [
            {
              type: "@MOVE",
              payload: firstExit.id,
              rationale: "目标位于当前场景已列出的出口中。",
            },
          ],
          narrativeDirectives: ["acknowledge_player_intent", "preserve_tension"],
        };
      }
    }

    return createFallbackAdjudication("玩家表达了意图，但当前需要 DM 先澄清或观察。");
  }

  /**
   * 生成叙事内容
   */
  async generate(
    userInput: string,
    context: PromptContext,
    history: { role: string; content: string }[] = [],
    options?: { inputRole?: "user" | "system" },
  ): Promise<string> {
    if (!this.client) {
      return this.generateMockResponse(userInput, context);
    }

    try {
      const recentHistory = history.slice(-MAX_RECENT_HISTORY_MESSAGES);

      const apiMessages: any[] = [
        { role: "system", content: this.buildSystemPrompt(context) },
      ];

      // 将历史对话映射为 OpenAI 格式
      recentHistory.forEach((msg) => {
        const normalizedRole =
          msg.role === "dm"
            ? "assistant"
            : msg.role === "system"
              ? "system"
              : "user";
        apiMessages.push({
          role: normalizedRole,
          content: msg.content,
        });
      });

      apiMessages.push({
        role: options?.inputRole || "user",
        content: userInput,
      });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: apiMessages,
        stream: false,
      });

      return response.choices[0]?.message?.content || "";
    } catch (error) {
      console.error("[AI] DeepSeek 调用失败，切换回 Mock 模式:", error);
      return this.generateMockResponse(userInput, context);
    }
  }

  async generateIntentAdjudication(
    userInput: string,
    context: PromptContext,
    history: { role: string; content: string }[] = [],
  ): Promise<IntentAdjudication> {
    // 当前阶段仅作为前端侧 contract/mock/shadow 能力保留。
    // production 目标应是后端 authoritative adjudication。
    if (!this.client) {
      return this.generateMockAdjudication(userInput, context);
    }

    try {
      const recentHistory = history.slice(-MAX_RECENT_HISTORY_MESSAGES);
      const apiMessages: any[] = [
        { role: "system", content: this.buildAdjudicationPrompt(context) },
      ];

      recentHistory.forEach((msg) => {
        const normalizedRole =
          msg.role === "dm"
            ? "assistant"
            : msg.role === "system"
              ? "system"
              : "user";
        apiMessages.push({
          role: normalizedRole,
          content: msg.content,
        });
      });

      apiMessages.push({
        role: "user",
        content: userInput,
      });

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: apiMessages,
        stream: false,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "";
      return (
        parseIntentAdjudication(content) ||
        createFallbackAdjudication("裁定结果无法解析，需要回到澄清路径。")
      );
    } catch (error) {
      console.error("[AI] Intent adjudication 失败，切换回保守模式:", error);
      return this.generateMockAdjudication(userInput, context);
    }
  }

  async generateStrictResponse(
    userInput: string,
    context: PromptContext,
    history: { role: string; content: string }[] = [],
    options?: { inputRole?: "user" | "system" },
  ): Promise<string> {
    let response = await this.generate(userInput, context, history, options);
    const retryHistory = [
      ...history,
      {
        role: options?.inputRole === "system" ? "system" : "user",
        content: userInput,
      },
    ];

    for (let retryCount = 0; retryCount < this.strictRetryLimit; retryCount += 1) {
      const validation = validateNarrativeBoundaries(response, context);
      if (validation.valid) {
        return response;
      }

      const correctionPrompt = buildNarrativeCorrectionPrompt(validation);
      if (!correctionPrompt) {
        return response;
      }

      retryHistory.push({ role: "assistant", content: response });
      response = await this.generate(correctionPrompt, context, retryHistory, {
        inputRole: "system",
      });
    }

    return response;
  }
}
