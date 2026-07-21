import { describe, expect, test } from "bun:test";
import { EQUIVALENTS, funEquivalent, shuffledOrder } from "./equivalents";

describe("funEquivalent", () => {
  test("formats counts to one decimal for discrete units", () => {
    expect(funEquivalent(384, 0)).toBe("≈ 2.1 Krispy Kreme Original Glazed");
  });

  test("rounds Oak to whole millilitres", () => {
    const oak = EQUIVALENTS.findIndex((e) => e.decimals === 0);
    expect(funEquivalent(450, oak)).toBe("≈ 500 mL of Oak chocolate milk");
  });

  test("uses absolute value when over target", () => {
    expect(funEquivalent(-299, 5)).toBe("≈ 1.0 Maxibons");
  });

  test("index wraps past the end of the list", () => {
    expect(funEquivalent(100, EQUIVALENTS.length)).toBe(funEquivalent(100, 0));
  });
});

describe("shuffledOrder", () => {
  test("is a permutation of every index", () => {
    expect([...shuffledOrder()].sort((a, b) => a - b)).toEqual(
      EQUIVALENTS.map((_, i) => i),
    );
  });
});
