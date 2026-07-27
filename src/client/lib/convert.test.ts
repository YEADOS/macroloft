import { describe, expect, test } from "bun:test";
import { CONVERSIONS, convert, formatConverted, parseNumber } from "./convert";

const byKey = (key: string) => CONVERSIONS.find((c) => c.key === key)!;

describe("parseNumber", () => {
  test("strips separators and spaces", () => {
    expect(parseNumber(" 1,200 ")).toBe(1200);
  });

  test("returns null for blank or half-typed input", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("kg")).toBeNull();
  });
});

describe("formatConverted", () => {
  test("scales precision to magnitude", () => {
    expect(formatConverted(3.937)).toBe("3.94");
    expect(formatConverted(81.6466)).toBe("81.6");
    expect(formatConverted(478.01)).toBe("478");
  });

  test("drops trailing zeros", () => {
    expect(formatConverted(25.4)).toBe("25.4");
    expect(formatConverted(0)).toBe("0");
  });
});

describe("convert", () => {
  test("kJ → kcal and back", () => {
    expect(convert("2000", byKey("energy"), false)).toBe("478");
    expect(convert("478", byKey("energy"), true)).toBe("2000");
  });

  test("lb → kg and back", () => {
    expect(convert("180", byKey("mass"), false)).toBe("81.6");
    expect(convert("81.6", byKey("mass"), true)).toBe("180");
  });

  test("in → mm and back", () => {
    expect(convert("1", byKey("length"), false)).toBe("25.4");
    expect(convert("100", byKey("length"), true)).toBe("3.94");
  });

  test("blank input converts to blank, not 0", () => {
    expect(convert("", byKey("energy"), false)).toBe("");
  });
});
