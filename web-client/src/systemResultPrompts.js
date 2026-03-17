import { parseCheckAction, parseCheckSetAction } from './gameUi/actionTags'

function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function listAvailableChecks(context) {
  return (context?.currentLocationActions || [])
    .map((actionTag) => parseCheckAction(actionTag) || parseCheckSetAction(actionTag))
    .flatMap((entry) => {
      if (!entry) return []
      if (Array.isArray(entry.checks)) {
        return entry.checks
      }
      return [entry]
    })
    .filter((check) => check?.skill && Number.isFinite(check?.dc))
}

export function buildCheckUnavailableFeedback(rejectedActions, context) {
  const checkRejections = (rejectedActions || []).filter(
    (entry) => entry?.action?.type === '@CHECK' || entry?.action?.type === '@CHECK_SET',
  )
  if (checkRejections.length === 0) {
    return ''
  }

  const duplicateRejection = checkRejections.find(
    (entry) => entry.reason === 'duplicate_resolved_check',
  )
  const outOfScopeRejection = checkRejections.find(
    (entry) => entry.reason === 'check_not_allowed_in_scene',
  )
  const availableChecks = listAvailableChecks(context)
  const availableCheckHint = availableChecks.length
    ? `当前这里受系统支持的检定：${availableChecks
        .map((check) => `${check.skill} DC ${check.dc}`)
        .join('、')}。`
    : '当前这里没有额外可通过检定取得的新信息。'

  if (duplicateRejection) {
    return [
      '你再次仔细观察了一阵，但眼前的结构并没有显露出比先前更多的新线索。',
      '',
      `<<HINT>>这里继续过同类检定不会得到新消息，除非环境发生变化。${availableCheckHint}<</HINT>>`,
    ].join('\n')
  }

  if (outOfScopeRejection) {
    return [
      '你试着从眼前的迹象里再挖出更多端倪，但这一次并没有形成新的可裁定发现。',
      '',
      `<<HINT>>这里当前没有可用的这项检定。${availableCheckHint}<</HINT>>`,
    ].join('\n')
  }

  return [
    '你谨慎地重新审视了一遍周围，但暂时没有获得足以改变局势的新发现。',
    '',
    `<<HINT>>这里继续过这类检定不会得到新的系统信息。${availableCheckHint}<</HINT>>`,
  ].join('\n')
}

export function buildSystemCheckResultPrompt(outcome, playerContext = "") {
  const lines = [
    "[SYS_CHECK_RESULT]",
    "kind=single",
    `skill=${outcome.skill}`,
    `dc=${outcome.dc}`,
    `roll=${outcome.breakdown.baseRoll}`,
    `total=${outcome.total}`,
    `outcome=${outcome.isSuccess ? "success" : "failure"}`,
    `breakdown=${normalizeInlineText(outcome.breakdown.expression)}`,
  ];

  if (outcome.reason) {
    lines.push(`reason=${normalizeInlineText(outcome.reason)}`);
  }
  lines.push(`roll_signal=${outcome.rollSignal}`);
  if (playerContext.trim()) {
    lines.push(`intent=${normalizeInlineText(playerContext)}`);
  }
  lines.push('[SYS_BRANCH_DIRECTIVE]');
  lines.push(`MANDATORY: The check for "${normalizeInlineText(outcome.reason || playerContext || `${outcome.skill}:${outcome.dc}`)}" is now CLOSED.`);
  lines.push(`You MUST commit to the ${outcome.isSuccess ? 'SUCCESS' : 'FAILURE'} branch NOW.`);
  lines.push('Do NOT issue another [@CHECK] or [@CHECK_SET] for the same intent, obstacle, or target.');
  lines.push('Advance the scene immediately. No repeated uncertainty for the same action.');

  return lines.join("\n");
}

export function buildSystemCheckSetResultPrompt(
  checkSet,
  outcomes,
  playerContext = "",
) {
  const lines = [
    "[SYS_CHECK_SET_RESULT]",
    `label=${normalizeInlineText(checkSet.label)}`,
    `mode=${checkSet.mode}`,
  ];

  if (checkSet.explanation) {
    lines.push(`explanation=${normalizeInlineText(checkSet.explanation)}`);
  }
  if (playerContext.trim()) {
    lines.push(`intent=${normalizeInlineText(playerContext)}`);
  }

  outcomes.forEach((outcome, index) => {
    lines.push(
      `result_${index + 1}=${normalizeInlineText(outcome.skill)}|roll=${outcome.breakdown.baseRoll}|total=${outcome.total}|dc=${outcome.dc}|roll_signal=${outcome.rollSignal}|${outcome.isSuccess ? "success" : "failure"}|math=${normalizeInlineText(outcome.breakdown.expression)}`,
    );
  });
  lines.push('[SYS_BRANCH_DIRECTIVE]');
  lines.push(`MANDATORY: The check set "${normalizeInlineText(checkSet.label)}" is now CLOSED.`);
  lines.push('You MUST commit to the resolved branch NOW.');
  lines.push('Do NOT issue another [@CHECK] or [@CHECK_SET] for the same intent, obstacle, or target.');
  lines.push('Advance the scene immediately. No repeated uncertainty for the same action.');

  return lines.join("\n");
}

export function buildSystemRollResultPrompt(parsedAction, rollResult) {
  return [
    "[SYS_ROLL_RESULT]",
    `label=${normalizeInlineText(parsedAction.label)}`,
    `formula=${normalizeInlineText(parsedAction.normalizedFormula)}`,
    `total=${rollResult.total}`,
    `breakdown=${normalizeInlineText(rollResult.breakdown)}`,
  ].join("\n");
}

export function buildEndgameResolutionPrompt() {
  return [
    "[SYS_ENDGAME_DIRECTIVE]",
    "state=endgame",
    "required=resolve_now",
    "allowed=last_chance_or_session_end",
  ].join("\n");
}
