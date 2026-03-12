function normalizeInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
