/** Minimal robots.txt parser (pure / testable). */

export interface RobotsRule {
  allow: boolean;
  path: string;
}

/** Extract the rule set that applies to the given user-agent (falls back to `*`). */
export function parseRobotsRules(text: string, userAgent = "*"): RobotsRule[] {
  const lines = text.split(/\r?\n/);
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | undefined;
  let lastWasAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!current) {
        current = { agents: ["*"], rules: [] };
        groups.push(current);
      }
      current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const ua = userAgent.toLowerCase();
  const match =
    groups.find((g) => g.agents.includes(ua)) ??
    groups.find((g) => g.agents.includes("*"));
  return match ? match.rules : [];
}

function ruleToRegExp(path: string): RegExp {
  let pattern = "";
  for (const ch of path) {
    if (ch === "*") {
      pattern += ".*";
    } else if (ch === "$") {
      pattern += "$";
    } else {
      pattern += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + pattern);
}

function ruleMatches(rule: RobotsRule, pathname: string): boolean {
  if (rule.path === "") {
    return rule.allow ? false : false; // empty Disallow = allow all; never "matches" as a block
  }
  if (rule.path.includes("*") || rule.path.includes("$")) {
    return ruleToRegExp(rule.path).test(pathname);
  }
  return pathname.startsWith(rule.path);
}

function specificity(path: string): number {
  return path.replace(/\*/g, "").length;
}

/** Returns a predicate telling whether a path is allowed to be crawled. */
export function makeRobotsChecker(
  text: string,
  userAgent = "*"
): (pathname: string) => boolean {
  const rules = parseRobotsRules(text, userAgent);
  return (pathname: string): boolean => {
    let bestAllow = -1;
    let bestDisallow = -1;
    for (const rule of rules) {
      if (rule.path === "") {
        continue;
      }
      if (!ruleMatches(rule, pathname)) {
        continue;
      }
      const s = specificity(rule.path);
      if (rule.allow) {
        bestAllow = Math.max(bestAllow, s);
      } else {
        bestDisallow = Math.max(bestDisallow, s);
      }
    }
    if (bestDisallow === -1) {
      return true;
    }
    // Ties resolve in favor of Allow (Google convention).
    return bestAllow >= bestDisallow;
  };
}
