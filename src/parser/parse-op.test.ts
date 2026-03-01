import { describe, it, expect } from "vitest";
import { parseOp, isParseError } from "./parse-op.js";
import { tokenize, isKeyValue, isArrow, isSelector } from "./tokenizer.js";

// ── Tokenizer ─────────────────────────────────────────────

describe("tokenize", () => {
  it("splits simple tokens", () => {
    expect(tokenize("add svc AuthService")).toEqual(["add", "svc", "AuthService"]);
  });

  it("handles quoted strings", () => {
    expect(tokenize('add svc "Auth Service" theme:blue')).toEqual([
      "add", "svc", "Auth Service", "theme:blue",
    ]);
  });

  it("handles escaped quotes", () => {
    expect(tokenize('label A "say \\"hello\\""')).toEqual([
      "label", "A", 'say "hello"',
    ]);
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("handles multiple spaces", () => {
    expect(tokenize("add   svc   A")).toEqual(["add", "svc", "A"]);
  });

  it("converts literal \\n to newline in unquoted tokens", () => {
    const result = tokenize("add svc Container\\nRegistry");
    expect(result).toEqual(["add", "svc", "Container\nRegistry"]);
  });

  it("converts literal \\n to newline in quoted strings", () => {
    const result = tokenize('add svc "Container\\nRegistry"');
    expect(result).toEqual(["add", "svc", "Container\nRegistry"]);
  });

  it("converts literal \\n to newline in embedded quoted values", () => {
    // tokenize preserves embedded quotes — parseKeyValue strips them
    const result = tokenize('label:"Line1\\nLine2"');
    expect(result).toEqual(['label:"Line1\nLine2"']);
  });

  it("converts multiple \\n sequences", () => {
    const result = tokenize("add svc A\\nB\\nC");
    expect(result).toEqual(["add", "svc", "A\nB\nC"]);
  });
});

describe("isKeyValue", () => {
  it("detects key:value", () => {
    expect(isKeyValue("theme:blue")).toBe(true);
    expect(isKeyValue("near:AuthService")).toBe(true);
    expect(isKeyValue("size:140x60")).toBe(true);
  });

  it("rejects selectors", () => {
    expect(isKeyValue("@type:db")).toBe(false);
  });

  it("rejects arrows", () => {
    expect(isKeyValue("->")).toBe(false);
  });

  it("rejects bare words", () => {
    expect(isKeyValue("AuthService")).toBe(false);
    expect(isKeyValue("add")).toBe(false);
  });

  it("rejects colon-only", () => {
    expect(isKeyValue(":")).toBe(false);
    expect(isKeyValue(":value")).toBe(false);
    expect(isKeyValue("key:")).toBe(false);
  });
});

describe("isArrow", () => {
  it("detects arrows", () => {
    expect(isArrow("->")).toBe(true);
    expect(isArrow("<->")).toBe(true);
    expect(isArrow("--")).toBe(true);
  });

  it("rejects non-arrows", () => {
    expect(isArrow("-")).toBe(false);
    expect(isArrow("=>")).toBe(false);
  });
});

describe("isSelector", () => {
  it("detects selectors", () => {
    expect(isSelector("@type:db")).toBe(true);
    expect(isSelector("@recent")).toBe(true);
    expect(isSelector("@all")).toBe(true);
  });

  it("rejects non-selectors", () => {
    expect(isSelector("theme:blue")).toBe(false);
    expect(isSelector("AuthService")).toBe(false);
  });
});

// ── Parser: add ───────────────────────────────────────────

describe("parseOp — add", () => {
  it("parses basic add", () => {
    const op = parseOp("add svc AuthService theme:blue");
    expect(isParseError(op)).toBe(false);
    if (!isParseError(op)) {
      expect(op.verb).toBe("add");
      expect(op.type).toBe("svc");
      expect(op.target).toBe("AuthService");
      expect(op.params.get("theme")).toBe("blue");
    }
  });

  it("parses add with quoted label", () => {
    const op = parseOp('add decision "Is Valid?" theme:yellow');
    if (!isParseError(op)) {
      expect(op.type).toBe("decision");
      expect(op.target).toBe("Is Valid?");
      expect(op.params.get("theme")).toBe("yellow");
    }
  });

  it("parses add with positioning", () => {
    const op = parseOp("add db UserDB theme:green near:AuthService dir:below");
    if (!isParseError(op)) {
      expect(op.type).toBe("db");
      expect(op.target).toBe("UserDB");
      expect(op.params.get("near")).toBe("AuthService");
      expect(op.params.get("dir")).toBe("below");
    }
  });

  it("parses add with absolute position", () => {
    const op = parseOp("add api Gateway theme:orange at:200,50");
    if (!isParseError(op)) {
      expect(op.params.get("at")).toBe("200,50");
    }
  });

  it("parses add with size and count", () => {
    const op = parseOp("add svc Worker theme:gray in:Backend count:3 size:100x50");
    if (!isParseError(op)) {
      expect(op.params.get("count")).toBe("3");
      expect(op.params.get("size")).toBe("100x50");
      expect(op.params.get("in")).toBe("Backend");
    }
  });

  it("errors on empty add", () => {
    expect(isParseError(parseOp("add"))).toBe(true);
  });
});

// ── Parser: connect ───────────────────────────────────────

describe("parseOp — connect", () => {
  it("parses simple connect", () => {
    const op = parseOp("connect AuthService -> UserDB");
    if (!isParseError(op)) {
      expect(op.verb).toBe("connect");
      expect(op.targets).toEqual(["AuthService", "UserDB"]);
      expect(op.arrows).toEqual(["->"]);
    }
  });

  it("parses connect with label and style", () => {
    const op = parseOp("connect AuthService -> UserDB label:queries style:dashed");
    if (!isParseError(op)) {
      expect(op.params.get("label")).toBe("queries");
      expect(op.params.get("style")).toBe("dashed");
    }
  });

  it("parses chained connect", () => {
    const op = parseOp("connect A -> B -> C -> D");
    if (!isParseError(op)) {
      expect(op.targets).toEqual(["A", "B", "C", "D"]);
      expect(op.arrows).toEqual(["->", "->", "->"]);
    }
  });

  it("parses bidirectional connect", () => {
    const op = parseOp("connect Client <-> Server label:WebSocket");
    if (!isParseError(op)) {
      expect(op.arrows).toEqual(["<->"]);
    }
  });

  it("parses undirected connect", () => {
    const op = parseOp('connect Service -- Service label:"same process"');
    if (!isParseError(op)) {
      expect(op.arrows).toEqual(["--"]);
      expect(op.params.get("label")).toBe("same process");
    }
  });

  it("parses connect with arrow head types", () => {
    const op = parseOp("connect AuthService -> UserDB source-arrow:none target-arrow:crow-foot");
    if (!isParseError(op)) {
      expect(op.params.get("source-arrow")).toBe("none");
      expect(op.params.get("target-arrow")).toBe("crow-foot");
    }
  });

  it("errors on missing arrow", () => {
    expect(isParseError(parseOp("connect A B"))).toBe(true);
  });
});

// ── Parser: style ─────────────────────────────────────────

describe("parseOp — style", () => {
  it("parses style with properties", () => {
    const op = parseOp("style AuthService fill:red stroke:darkred font-size:14");
    if (!isParseError(op)) {
      expect(op.verb).toBe("style");
      expect(op.target).toBe("AuthService");
      expect(op.params.get("fill")).toBe("red");
      expect(op.params.get("stroke")).toBe("darkred");
      expect(op.params.get("font-size")).toBe("14");
    }
  });

  it("parses style with selector", () => {
    const op = parseOp("style @type:db fill:green");
    if (!isParseError(op)) {
      expect(op.target).toBe("@type:db");
      expect(op.selector).toBe("@type:db");
    }
  });
});

describe("parseOp — style bare flags", () => {
  it("captures bold as bare flag param", () => {
    const op = parseOp("style Title bold");
    if (!isParseError(op)) {
      expect(op.verb).toBe("style");
      expect(op.target).toBe("Title");
      expect(op.params.get("bold")).toBe("true");
    }
  });

  it("captures multiple bare flags", () => {
    const op = parseOp("style Title bold italic underline");
    if (!isParseError(op)) {
      expect(op.params.get("bold")).toBe("true");
      expect(op.params.get("italic")).toBe("true");
      expect(op.params.get("underline")).toBe("true");
    }
  });

  it("captures no-bold negation flag", () => {
    const op = parseOp("style Title no-bold");
    if (!isParseError(op)) {
      expect(op.params.get("no-bold")).toBe("true");
    }
  });

  it("mixes bare flags with key:value params", () => {
    const op = parseOp("style Title bold fontSize:24 italic font-family:Helvetica");
    if (!isParseError(op)) {
      expect(op.target).toBe("Title");
      expect(op.params.get("bold")).toBe("true");
      expect(op.params.get("italic")).toBe("true");
      expect(op.params.get("fontSize")).toBe("24");
      expect(op.params.get("font-family")).toBe("Helvetica");
    }
  });

  it("captures align and valign as key:value", () => {
    const op = parseOp("style Title align:left valign:top");
    if (!isParseError(op)) {
      expect(op.params.get("align")).toBe("left");
      expect(op.params.get("valign")).toBe("top");
    }
  });
});

// ── Parser: other verbs ───────────────────────────────────

describe("parseOp — remove", () => {
  it("parses remove", () => {
    const op = parseOp("remove AuthService");
    if (!isParseError(op)) {
      expect(op.verb).toBe("remove");
      expect(op.target).toBe("AuthService");
    }
  });
});

describe("parseOp — label", () => {
  it("parses label change", () => {
    const op = parseOp('label Gateway "API Gateway v2"');
    if (!isParseError(op)) {
      expect(op.verb).toBe("label");
      expect(op.target).toBe("Gateway");
      expect(op.params.get("text")).toBe("API Gateway v2");
    }
  });

  it("parses edge label with arrow syntax", () => {
    const op = parseOp('label Auth -> DB "read/write"');
    if (!isParseError(op)) {
      expect(op.verb).toBe("label");
      expect(op.targets).toEqual(["Auth", "DB"]);
      expect(op.arrows).toEqual(["->"]);
      expect(op.params.get("text")).toBe("read/write");
    }
  });

  it("returns error for edge label missing text", () => {
    const op = parseOp("label Auth -> DB");
    expect(isParseError(op)).toBe(true);
  });
});

describe("parseOp — badge", () => {
  it("parses badge with position", () => {
    const op = parseOp('badge PaymentService "PCI" pos:top-right');
    if (!isParseError(op)) {
      expect(op.verb).toBe("badge");
      expect(op.target).toBe("PaymentService");
      expect(op.params.get("text")).toBe("PCI");
      expect(op.params.get("pos")).toBe("top-right");
    }
  });
});

describe("parseOp — move", () => {
  it("parses move with absolute position", () => {
    const op = parseOp("move AuthService to:100,200");
    if (!isParseError(op)) {
      expect(op.verb).toBe("move");
      expect(op.target).toBe("AuthService");
      expect(op.params.get("to")).toBe("100,200");
    }
  });

  it("parses move with relative position", () => {
    const op = parseOp("move AuthService near:UserDB dir:above");
    if (!isParseError(op)) {
      expect(op.params.get("near")).toBe("UserDB");
      expect(op.params.get("dir")).toBe("above");
    }
  });
});

describe("parseOp — resize", () => {
  it("parses resize", () => {
    const op = parseOp("resize AuthService to:200x100");
    if (!isParseError(op)) {
      expect(op.verb).toBe("resize");
      expect(op.params.get("to")).toBe("200x100");
    }
  });
});

describe("parseOp — swap", () => {
  it("parses swap", () => {
    const op = parseOp("swap A B");
    if (!isParseError(op)) {
      expect(op.verb).toBe("swap");
      expect(op.targets).toEqual(["A", "B"]);
    }
  });
});

describe("parseOp — group", () => {
  it("parses group", () => {
    const op = parseOp("group AuthService UserDB as:Backend");
    if (!isParseError(op)) {
      expect(op.verb).toBe("group");
      expect(op.targets).toEqual(["AuthService", "UserDB"]);
      expect(op.params.get("as")).toBe("Backend");
    }
  });

  it("errors without as:NAME", () => {
    expect(isParseError(parseOp("group A B"))).toBe(true);
  });
});

describe("parseOp — ungroup", () => {
  it("parses ungroup", () => {
    const op = parseOp("ungroup Backend");
    if (!isParseError(op)) {
      expect(op.verb).toBe("ungroup");
      expect(op.target).toBe("Backend");
    }
  });
});

describe("parseOp — page", () => {
  it("parses page add", () => {
    const op = parseOp('page add "Deployment View"');
    if (!isParseError(op)) {
      expect(op.verb).toBe("page");
      expect(op.subcommand).toBe("add");
      expect(op.target).toBe("Deployment View");
    }
  });

  it("parses page switch", () => {
    const op = parseOp('page switch "Page-2"');
    if (!isParseError(op)) {
      expect(op.subcommand).toBe("switch");
      expect(op.target).toBe("Page-2");
    }
  });
});

describe("parseOp — layer", () => {
  it("parses layer create", () => {
    const op = parseOp("layer create Background");
    if (!isParseError(op)) {
      expect(op.verb).toBe("layer");
      expect(op.subcommand).toBe("create");
      expect(op.target).toBe("Background");
    }
  });

  it("parses layer move", () => {
    const op = parseOp("layer move AuthService to:Background");
    if (!isParseError(op)) {
      expect(op.subcommand).toBe("move");
      expect(op.targets).toEqual(["AuthService"]);
      expect(op.params.get("to")).toBe("Background");
    }
  });
});

describe("parseOp — checkpoint", () => {
  it("parses checkpoint", () => {
    const op = parseOp("checkpoint v1-layout");
    if (!isParseError(op)) {
      expect(op.verb).toBe("checkpoint");
      expect(op.target).toBe("v1-layout");
    }
  });
});

describe("parseOp — title", () => {
  it("parses title", () => {
    const op = parseOp('title "Order Processing System"');
    if (!isParseError(op)) {
      expect(op.verb).toBe("title");
      expect(op.target).toBe("Order Processing System");
    }
  });
});

describe("parseOp — define", () => {
  it("parses define", () => {
    const op = parseOp("define payment-svc base:svc theme:purple badge:PCI");
    if (!isParseError(op)) {
      expect(op.verb).toBe("define");
      expect(op.target).toBe("payment-svc");
      expect(op.params.get("base")).toBe("svc");
      expect(op.params.get("theme")).toBe("purple");
      expect(op.params.get("badge")).toBe("PCI");
    }
  });
});

describe("parseOp — disconnect", () => {
  it("parses disconnect", () => {
    const op = parseOp("disconnect AuthService -> UserDB");
    if (!isParseError(op)) {
      expect(op.verb).toBe("disconnect");
      expect(op.targets).toEqual(["AuthService", "UserDB"]);
    }
  });
});

// ── Error cases ───────────────────────────────────────────

describe("parseOp — errors", () => {
  it("errors on empty input", () => {
    expect(isParseError(parseOp(""))).toBe(true);
  });

  it("errors on unknown verb", () => {
    const result = parseOp("fly AuthService");
    expect(isParseError(result)).toBe(true);
    if (isParseError(result)) {
      expect(result.error).toContain("unknown verb");
    }
  });
});
