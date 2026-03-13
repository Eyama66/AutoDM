/**
 * narrativeParser.js
 *
 * 将 DM 返回的扁平文本拆解为结构化段落。
 *
 * 段落类型:
 *   - narration:  旁白 / 环境描写
 *   - dialogue:   NPC 台词 (含 speaker 字段)
 *   - hint:       DM 给玩家的行动建议 (可折叠)
 *
 * 标签格式 (由 AI system prompt 约定):
 *   <<NPC: 角色名>>台词内容<</NPC>>
 *   <<HINT>>建议列表<</HINT>>
 *
 * 向后兼容: 不含任何标签的旧消息会被整体视为 narration。
 */

/**
 * @typedef {'narration' | 'dialogue' | 'hint'} SegmentType
 * @typedef {{ type: SegmentType, content: string, speaker?: string }} NarrativeSegment
 */

// 匹配 <<NPC: Name>>content<</NPC>> 和 <<HINT>>content<</HINT>>
// 使用 lazy 量词，避免跨标签吞噬
const SEGMENT_REGEX =
  /<<NPC:\s*(.+?)>>([\s\S]*?)<<\/NPC>>|<<HINT>>([\s\S]*?)<<\/HINT>>/g;

function normalizeDialogueContent(content) {
  const trimmed = String(content || "").trim();
  const fullyQuoted = trimmed.match(/^[“"]([\s\S]*?)[”"]$/);
  return fullyQuoted ? fullyQuoted[1].trim() : trimmed;
}

function splitDialogueParagraphs(dialogue) {
  const paragraphs = String(dialogue || "")
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs.flatMap((paragraph) => {
    const lines = paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (
      lines.length > 1 &&
      lines.every((line) => /^[“"].+/.test(line))
    ) {
      return lines;
    }

    return [paragraph];
  });
}

function pushDialogueSegments(segments, speaker, dialogue) {
  splitDialogueParagraphs(dialogue).forEach((paragraph) => {
    const content = normalizeDialogueContent(paragraph);
    if (content) {
      segments.push({ type: "dialogue", speaker, content });
    }
  });
}

function flushNarrationBuffer(segments, buffer) {
  const content = buffer.join("\n").trim();
  if (content) {
    segments.push({ type: "narration", content });
  }
  buffer.length = 0;
}

function isLikelySpeakerLabel(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 24) {
    return false;
  }

  if (/[。！？.!?:：]/.test(trimmed)) {
    return false;
  }

  return true;
}

function isLikelyDialogueLine(line) {
  return /^[“"]/.test(line.trim());
}

function parseLooseNarrativeContent(rawContent) {
  const segments = [];
  const narrationBuffer = [];
  const lines = String(rawContent || "").split("\n");

  let index = 0;
  while (index < lines.length) {
    const currentLine = lines[index];
    const trimmedLine = currentLine.trim();

    if (
      isLikelySpeakerLabel(trimmedLine) &&
      index + 1 < lines.length &&
      isLikelyDialogueLine(lines[index + 1] || "")
    ) {
      flushNarrationBuffer(segments, narrationBuffer);

      const speaker = trimmedLine;
      const dialogueLines = [];
      index += 1;

      while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (!trimmed) {
          if (dialogueLines.length > 0) {
            dialogueLines.push("");
          }
          index += 1;
          continue;
        }

        if (!isLikelyDialogueLine(trimmed)) {
          break;
        }

        dialogueLines.push(trimmed);
        index += 1;
      }

      pushDialogueSegments(segments, speaker, dialogueLines.join("\n"));
      continue;
    }

    narrationBuffer.push(currentLine);
    index += 1;
  }

  flushNarrationBuffer(segments, narrationBuffer);
  return segments;
}

/**
 * 解析 DM 输出文本，返回有序的段落数组。
 *
 * @param {string} rawContent - DM 返回的原始文本 (已由 CampaignManager 清理过动作标签)
 * @returns {NarrativeSegment[]}
 */
// AI 有时用 <<HINT>>...<<HINT>> 代替 <<HINT>>...<</HINT>>，在此修正
function normalizeHintTags(text) {
  return text.replace(/<<HINT>>([\s\S]*?)<<HINT>>/g, "<<HINT>>$1<</HINT>>");
}

export function parseNarrativeContent(rawContent) {
  if (!rawContent || typeof rawContent !== "string") {
    return [{ type: "narration", content: "" }];
  }

  const normalized = normalizeHintTags(rawContent);
  const segments = [];
  let lastIndex = 0;

  // 重置正则 lastIndex (全局正则是有状态的)
  SEGMENT_REGEX.lastIndex = 0;

  let match;
  while ((match = SEGMENT_REGEX.exec(normalized)) !== null) {
    // 标签前的文本 → narration
    if (match.index > lastIndex) {
      const before = normalized.slice(lastIndex, match.index).trim();
      if (before) {
        segments.push({ type: "narration", content: before });
      }
    }

    if (match[1] !== undefined) {
      // <<NPC: Name>>content<</NPC>>
      const speaker = match[1].trim();
      const dialogue = (match[2] || "").trim();
      if (dialogue) {
        pushDialogueSegments(segments, speaker, dialogue);
      }
    } else if (match[3] !== undefined) {
      // <<HINT>>content<</HINT>>
      const hint = (match[3] || "").trim();
      if (hint) {
        segments.push({ type: "hint", content: hint });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // 标签后的剩余文本 → narration
  if (lastIndex < normalized.length) {
    const tail = normalized.slice(lastIndex).trim();
    if (tail) {
      segments.push(...parseLooseNarrativeContent(tail));
    }
  }

  // 旧消息 fallback: 没有标签时，尝试从”看守员 + 引号台词”这种格式中恢复对话块
  if (segments.length === 0) {
    return parseLooseNarrativeContent(normalized.trim());
  }

  return segments;
}
