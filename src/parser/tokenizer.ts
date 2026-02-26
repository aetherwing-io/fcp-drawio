/**
 * Tokenize an operation string by whitespace, respecting quoted strings.
 * "add svc \"Auth Service\" theme:blue" → ["add", "svc", "Auth Service", "theme:blue"]
 */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Skip whitespace
    while (i < len && input[i] === " ") i++;
    if (i >= len) break;

    if (input[i] === '"') {
      // Quoted string
      i++; // skip opening quote
      let token = "";
      while (i < len && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < len) {
          // Escape sequence
          i++;
          token += input[i];
        } else {
          token += input[i];
        }
        i++;
      }
      if (i < len) i++; // skip closing quote
      tokens.push(token);
    } else {
      // Unquoted token — but if we encounter a quote mid-token (e.g., key:"value"),
      // switch to quoted parsing for the value part.
      let token = "";
      while (i < len && input[i] !== " ") {
        if (input[i] === '"') {
          // Embedded quoted value (e.g., label:"same process")
          i++; // skip opening quote
          while (i < len && input[i] !== '"') {
            if (input[i] === "\\" && i + 1 < len) {
              i++;
              token += input[i];
            } else {
              token += input[i];
            }
            i++;
          }
          if (i < len) i++; // skip closing quote
        } else {
          token += input[i];
          i++;
        }
      }
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Check if a token is a key:value pair.
 * Must contain ":" but not start with "@" (selectors) and not be an arrow.
 */
export function isKeyValue(token: string): boolean {
  if (token.startsWith("@")) return false;
  if (isArrow(token)) return false;
  const colonIdx = token.indexOf(":");
  return colonIdx > 0 && colonIdx < token.length - 1;
}

/**
 * Parse a key:value token. The value may include colons (e.g., "style:orthogonal").
 */
export function parseKeyValue(token: string): { key: string; value: string } {
  const colonIdx = token.indexOf(":");
  return {
    key: token.slice(0, colonIdx),
    value: token.slice(colonIdx + 1),
  };
}

/**
 * Check if a token is an arrow operator.
 */
export function isArrow(token: string): boolean {
  return token === "->" || token === "<->" || token === "--";
}

/**
 * Check if a token is a selector.
 */
export function isSelector(token: string): boolean {
  return token.startsWith("@");
}
