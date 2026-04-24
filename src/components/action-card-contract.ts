interface ActionCardBaseProps {
  title: string;
}

type ActionCardContentProps =
  | {
      lines: readonly [string, ...string[]];
      emptyStateText?: string;
    }
  | {
      lines?: readonly [] | undefined;
      emptyStateText: string;
    };

type ActionCardPrimaryActionProps =
  | {
      primaryActionId: string;
      primaryActionLabel: string;
    }
  | {
      primaryActionId?: undefined;
      primaryActionLabel?: undefined;
    };

type ActionCardDismissProps =
  | {
      dismissible: true;
      dismissActionId: string;
    }
  | {
      dismissible?: false | undefined;
      dismissActionId?: undefined;
    };

/**
 * A compact, shell-owned card for title + body text with optional shell actions.
 */
export type ActionCardProps = ActionCardBaseProps &
  ActionCardContentProps &
  ActionCardPrimaryActionProps &
  ActionCardDismissProps;

interface ActionCardInput {
  title: string;
  lines?: readonly string[] | undefined;
  emptyStateText?: string | undefined;
  primaryActionId?: string | undefined;
  primaryActionLabel?: string | undefined;
  dismissible?: boolean | undefined;
  dismissActionId?: string | undefined;
}

export interface ResolvedActionCardContent {
  lines: readonly string[];
  usesEmptyState: boolean;
}

export function normalizeActionCardProps(
  input: ActionCardInput,
  owner = "Action card"
): ActionCardProps {
  const title = readRequiredString(input.title, `${owner} title`);
  const lines = normalizeLines(input.lines, `${owner} lines`);
  const emptyStateText = readOptionalString(input.emptyStateText, `${owner} emptyStateText`);
  const hasLines = lines !== undefined && lines.length > 0;

  if (!hasLines && emptyStateText === undefined) {
    throw new Error(`${owner} requires non-empty lines or emptyStateText.`);
  }

  const primaryActionId = readOptionalString(input.primaryActionId, `${owner} primaryActionId`);
  const primaryActionLabel = readOptionalString(
    input.primaryActionLabel,
    `${owner} primaryActionLabel`
  );
  const hasPrimaryAction = primaryActionId !== undefined || primaryActionLabel !== undefined;
  if (hasPrimaryAction && (primaryActionId === undefined || primaryActionLabel === undefined)) {
    throw new Error(`${owner} requires both primaryActionId and primaryActionLabel.`);
  }

  const dismissActionId = readOptionalString(input.dismissActionId, `${owner} dismissActionId`);
  if (dismissActionId !== undefined && input.dismissible !== true) {
    throw new Error(`${owner} requires dismissible: true when dismissActionId is provided.`);
  }
  if (input.dismissible === true && dismissActionId === undefined) {
    throw new Error(`${owner} requires dismissActionId when dismissible is true.`);
  }

  const normalized: ActionCardInput = { title };
  if (hasLines) {
    normalized.lines = lines;
  }
  if (!hasLines) {
    normalized.emptyStateText = emptyStateText!;
  } else if (emptyStateText !== undefined) {
    normalized.emptyStateText = emptyStateText;
  }
  if (primaryActionId !== undefined && primaryActionLabel !== undefined) {
    normalized.primaryActionId = primaryActionId;
    normalized.primaryActionLabel = primaryActionLabel;
  }
  if (input.dismissible === true && dismissActionId !== undefined) {
    normalized.dismissible = true;
    normalized.dismissActionId = dismissActionId;
  }

  return normalized as ActionCardProps;
}

export function resolveActionCardContent(
  props: {
    lines?: readonly string[] | undefined;
    emptyStateText?: string | undefined;
  }
): ResolvedActionCardContent {
  if (props.lines && props.lines.length > 0) {
    return {
      lines: props.lines,
      usesEmptyState: false
    };
  }

  if (props.emptyStateText === undefined) {
    throw new Error("Action card content requires emptyStateText when no content lines are present.");
  }

  return {
    lines: [props.emptyStateText],
    usesEmptyState: true
  };
}

function readRequiredString(value: string, label: string): string {
  const normalized = readOptionalString(value, label);
  if (normalized === undefined) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function readOptionalString(value: string | undefined, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return value;
}

function normalizeLines(
  lines: readonly string[] | undefined,
  label: string
): readonly [string, ...string[]] | undefined {
  if (lines === undefined) {
    return undefined;
  }
  if (!Array.isArray(lines)) {
    throw new Error(`${label} must be an array of strings.`);
  }
  for (const line of lines) {
    if (typeof line !== "string") {
      throw new Error(`${label} must contain only strings.`);
    }
  }
  if (lines.length === 0) {
    return undefined;
  }
  return [...lines] as unknown as readonly [string, ...string[]];
}
