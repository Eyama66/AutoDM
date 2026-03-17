import OpenAIImport from "openai";
import { ActionProcessor } from "../engine/ActionProcessor.js";
import {
  createFallbackAdjudication,
  parseIntentAdjudication,
  type IntentAdjudication,
} from "./IntentAdjudication.js";
import { parseAIResponse } from "./AIResponseParser.js";
import { buildAdjudicationSystemPrompt } from "./adjudicationPrompt.js";
import {
  buildSceneFactContract,
  buildSystemPrompt as buildPromptSystemMessage,
  MAX_RECENT_HISTORY_MESSAGES,
  type ResponseProtocolMode,
} from "./promptBuilder.js";
import type { PromptContext } from "./promptBuilder.js";
import {
  buildNarrativeCorrectionPrompt,
  validateEnvelopeBoundaries,
  validateNarrativeBoundaries,
} from "../validation/NarrativeBoundaryValidator.js";
import {
  summarizePromptContextForTrace,
  trace,
  traceError,
  traceWarn,
  truncateForTrace,
} from "../debug/traceLogger.js";
export type { PromptContext } from "./promptBuilder.js";

/**
 * AIEngine: 叙事大脑适配器
 */
export class AIEngine {
  private client: any | null = null;
  private model: string = "deepseek-chat";
  private reasoningModel: string | null = null;
  private validationModel: string | null = null;
  private responseProtocolMode: ResponseProtocolMode = "legacy";
  private readonly strictRetryLimit = 2;

  constructor(config?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    reasoningModel?: string;
    validationModel?: string;
    responseProtocolMode?: ResponseProtocolMode;
  }) {
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
    this.reasoningModel =
      config?.reasoningModel || env.VITE_AI_REASONING_MODEL || null;
    this.validationModel =
      config?.validationModel || env.VITE_AI_VALIDATION_MODEL || this.model;
    this.responseProtocolMode = this.normalizeResponseProtocolMode(
      config?.responseProtocolMode || env.VITE_AI_RESPONSE_PROTOCOL_MODE,
    );

    if (apiKey && apiKey !== "在这里填写你的API_KEY" && apiKey !== "") {
      const OpenAIClient = (OpenAIImport as any).default || OpenAIImport;
      this.client = new OpenAIClient({
        apiKey: apiKey,
        baseURL: baseURL,
        dangerouslyAllowBrowser: true, // 允许浏览器环境直连
      });
      console.log(
        `[AI] LLM 引擎已激活。叙事模型: ${this.model}` +
          `${this.reasoningModel ? `，推理模型: ${this.reasoningModel}` : ""}` +
          `${this.validationModel ? `，验证模型: ${this.validationModel}` : ""}` +
          `，输出协议: ${this.responseProtocolMode}`,
      );
    } else {
      console.log("[AI] 未检测到有效的 API Key，进入 Mock 模式。");
    }
  }

  /**
   * 构造系统提示词：这是 AI 的“演出指南”
   */
  private buildSystemPrompt(context: PromptContext): string {
    return buildPromptSystemMessage(context, this.responseProtocolMode);
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
      trace("ai.mock", "mock move response selected", {
        userInput,
        target,
        context: summarizePromptContextForTrace(context),
      });
      if (this.responseProtocolMode !== "legacy") {
        return JSON.stringify({
          narrative: {
            segments: [
              {
                type: "narration",
                content: "你深吸一口气，推开了沉重的木门。这里的空气更加厚重了。",
              },
            ],
          },
          protocol: {
            actionText: `[@MOVE(${target})]`,
          },
        });
      }
      return `你深吸一口气，推开了沉重的木门。这里的空气更加厚重了。[@MOVE(${target})]`;
    }

    trace("ai.mock", "mock narrative response selected", {
      userInput,
      context: summarizePromptContextForTrace(context),
    });
    if (this.responseProtocolMode !== "legacy") {
      return JSON.stringify({
        narrative: {
          segments: [
            {
              type: "narration",
              content: `你在${context.currentLocationName}静静地观察着四周，风声在你耳边低语。`,
            },
          ],
        },
        protocol: {
          actionText: "[@NARRATE(null)]",
        },
      });
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
    options?: { inputRole?: "user" | "system"; modelOverride?: string | null },
  ): Promise<string> {
    const selectedModel =
      options?.modelOverride || this.selectNarrationModel(userInput, options);
    trace("ai.generate", "starting response generation", {
      model: selectedModel,
      hasClient: Boolean(this.client),
      inputRole: options?.inputRole || "user",
      responseProtocolMode: this.responseProtocolMode,
      userInput: truncateForTrace(userInput),
      historyCount: history.length,
      context: summarizePromptContextForTrace(context),
    });
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
        model: selectedModel,
        messages: apiMessages,
        stream: false,
        ...(this.shouldUseNativeJsonResponse() ? { response_format: { type: "json_object" } } : {}),
      });

      const content = response.choices[0]?.message?.content || "";
      trace("ai.generate", "model response received", {
        contentPreview: truncateForTrace(content, 600),
        contentLength: content.length,
      });
      return content;
    } catch (error) {
      console.error("[AI] DeepSeek 调用失败，切换回 Mock 模式:", error);
      traceError("ai.generate", "model request failed; falling back to mock", error);
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
        model: this.reasoningModel || this.model,
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
      const parsedResponse = parseAIResponse(response);
      const validation =
        parsedResponse.format === "json"
          ? validateEnvelopeBoundaries(parsedResponse, context)
          : validateNarrativeBoundaries(response, context);
      trace("ai.strict", "validated AI response", {
        retryCount,
        format: parsedResponse.format,
        valid: validation.valid,
        violations: validation.violations,
        responsePreview: truncateForTrace(response, 600),
      });
      if (!validation.valid) {
        const correctionPrompt = buildNarrativeCorrectionPrompt(validation);
        if (!correctionPrompt) {
          return response;
        }

        retryHistory.push({ role: "assistant", content: response });
        traceWarn("ai.strict", "response crossed narrative boundary; retrying", {
          retryCount,
          correctionPrompt,
          retryHistoryCount: retryHistory.length,
        });
        response = await this.generate(correctionPrompt, context, retryHistory, {
          inputRole: "system",
          modelOverride: this.reasoningModel,
        });
        continue;
      }

      const modelValidation = await this.validateWithModel(
        userInput,
        response,
        context,
        history,
        options,
      );
      trace("ai.strict", "validated AI response with model validator", {
        retryCount,
        validatorEnabled: Boolean(this.validationModel),
        validatorModel: this.validationModel,
        ...modelValidation,
      });
      if (modelValidation.valid) {
        return response;
      }

      const correctionPrompt = this.buildModelBoundaryCorrectionPrompt(modelValidation);
      retryHistory.push({ role: "assistant", content: response });
      traceWarn("ai.strict", "response rejected by model validator; retrying", {
        retryCount,
        correctionPrompt,
        retryHistoryCount: retryHistory.length,
      });
      response = await this.generate(correctionPrompt, context, retryHistory, {
        inputRole: "system",
        modelOverride: this.reasoningModel,
      });
    }

    traceWarn("ai.strict", "retry limit reached; returning last response", {
      retryLimit: this.strictRetryLimit,
      responsePreview: truncateForTrace(response, 600),
    });
    return response;
  }

  private selectNarrationModel(
    userInput: string,
    options?: { inputRole?: "user" | "system" },
  ): string {
    if (!this.reasoningModel) {
      return this.model;
    }

    if (
      options?.inputRole === "system" &&
      /^\[(SYS_CHECK_RESULT|SYS_CHECK_SET_RESULT|SYS_ROLL_RESULT|SYS_TURN_RESOLUTION|SYS_ENDGAME_DIRECTIVE|SYSTEM_BOUNDARY_CORRECTION|SYSTEM_MODEL_VALIDATION_CORRECTION)\]/.test(
        String(userInput || ""),
      )
    ) {
      return this.reasoningModel;
    }

    return this.model;
  }

  private shouldUseNativeJsonResponse(): boolean {
    return this.responseProtocolMode === "json_object";
  }

  private normalizeResponseProtocolMode(
    value: unknown,
  ): ResponseProtocolMode {
    if (
      value === "json_object" ||
      value === "json_text" ||
      value === "legacy"
    ) {
      return value;
    }
    return "legacy";
  }

  private shouldRunModelValidator(
    userInput: string,
    response: string,
    options?: { inputRole?: "user" | "system" },
  ): boolean {
    if (!this.client || !this.validationModel) {
      return false;
    }

    if (ActionProcessor.parse(response).length > 0) {
      return true;
    }

    if (this.hasPotentialSpatialTransitionWithoutMove(response)) {
      return true;
    }

    if (
      options?.inputRole === "system" &&
      /^\[(SYS_CHECK_RESULT|SYS_CHECK_SET_RESULT|SYS_ROLL_RESULT|SYS_TURN_RESOLUTION|SYS_ENDGAME_DIRECTIVE)\]/.test(
        String(userInput || ""),
      )
    ) {
      return true;
    }

    return false;
  }

  private hasPotentialSpatialTransitionWithoutMove(response: string): boolean {
    const parsedResponse = parseAIResponse(response);
    const parsedActions = ActionProcessor.parse(parsedResponse.protocolText || response);
    if (parsedActions.some((action) => action.type === "@MOVE")) {
      return false;
    }

    const text = String(parsedResponse.historyText || response || "").trim();
    if (!text) {
      return false;
    }

    const strongCuePatterns = [
      /终于到了尽头/,
      /从.+?(?:滑出|钻出|爬出)/,
      /落在.+?(?:空间|房间|洞穴|石室|长廊|地下)/,
      /你的身后.+?(?:出口|通道|排水管).+?(?:返回|攀爬)/,
      /通向何处/,
      /空间的另一侧/,
      /这里是一个.+?(?:空间|房间|地下|洞穴)/,
    ];

    if (strongCuePatterns.some((pattern) => pattern.test(text))) {
      return true;
    }

    const transitionVerbCount = [
      "来到",
      "进入",
      "踏入",
      "抵达",
      "走进",
      "走到",
      "穿过",
      "穿行",
      "滑出",
      "钻出",
      "爬出",
      "落在",
    ].filter((token) => text.includes(token)).length;

    const newSpaceNounCount = [
      "空间",
      "房间",
      "地下",
      "洞穴",
      "石室",
      "长廊",
      "祭坛",
      "穹顶",
      "裂缝",
      "开口",
    ].filter((token) => text.includes(token)).length;

    return transitionVerbCount > 0 && newSpaceNounCount > 0;
  }

  private async validateWithModel(
    userInput: string,
    response: string,
    context: PromptContext,
    history: { role: string; content: string }[] = [],
    options?: { inputRole?: "user" | "system" },
  ): Promise<{
    valid: boolean;
    reasons: string[];
    skipped?: boolean;
    model?: string | null;
  }> {
    if (!this.shouldRunModelValidator(userInput, response, options)) {
      return {
        valid: true,
        reasons: [],
        skipped: true,
        model: this.validationModel,
      };
    }

    try {
      const parsedReply = parseAIResponse(response);
      const recentHistory = history.slice(-2).map((msg) => ({
        role: msg.role,
        content: truncateForTrace(msg.content, 220),
      }));

      const validatorResponse = await this.client.chat.completions.create({
        model: this.validationModel,
        messages: [
          {
            role: "system",
            content: [
              "你是 AutoDM 的边界验证器。你不负责写故事，只负责判定回复是否越界。",
              "只根据 scene fact contract、当前输入和 AI 回复判断。",
              "判 invalid 的情形包括：",
              "1. 引入当前 scene 中不存在的新地点、新出口、新 NPC、新 encounter、新可得物品。",
              "2. 把当前场景核心结构改写成新的结构、新威胁或新可交互体。",
              "3. 在收到 SYS_CHECK_RESULT / SYS_CHECK_SET_RESULT 后，没有提交成功/失败分支，反而重复同一意图的检定。",
              "4. 没有合法 @MOVE，却把玩家叙事性地带到了新的物理空间、房间、地下层级或通道尽头。",
              "只输出 JSON：{\"valid\": boolean, \"reasons\": string[]}",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              inputRole: options?.inputRole || "user",
              currentInput: userInput,
              recentHistory,
              sceneFactContract: buildSceneFactContract(context),
              aiReply: response,
              aiReplyFormat: parsedReply.format,
              aiReplyHistoryText: parsedReply.historyText,
              aiReplyProtocolText: parsedReply.protocolText,
            }),
          },
        ],
        stream: false,
        response_format: { type: "json_object" },
      });

      const content = validatorResponse.choices[0]?.message?.content || "";
      const parsed = JSON.parse(content || "{}");
      return {
        valid: parsed?.valid !== false,
        reasons: Array.isArray(parsed?.reasons)
          ? parsed.reasons
              .map((reason: unknown) => String(reason || "").trim())
              .filter(Boolean)
          : [],
        model: this.validationModel,
      };
    } catch (error) {
      traceWarn("ai.strict", "model validator failed; skipping", {
        error,
        model: this.validationModel,
      });
      return {
        valid: true,
        reasons: [],
        skipped: true,
        model: this.validationModel,
      };
    }
  }

  private buildModelBoundaryCorrectionPrompt(result: {
    reasons: string[];
  }): string {
    return [
      "[SYSTEM_MODEL_VALIDATION_CORRECTION]",
      "你的上一条回复越过了场景事实边界或没有提交检定分支。",
      ...(result.reasons || []).map((reason, index) => `${index + 1}. ${reason}`),
      "请仅基于当前 scene fact contract 和 system 结果重写整条回复。",
      "若本轮收到检定结果，必须立刻提交 success / failure 分支，不得重发同一检定。",
      "不要解释系统、验证器或幕后规则。",
    ].join("\n");
  }
}
