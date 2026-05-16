import { describe, it, expect } from "vitest";
import { normalize, tokenize } from "../src/shared/normalizer";

describe("normalize", () => {
  const cases: [string, string][] = [
    ["Booking.com B.V.", "booking com"],
    ["Uber Netherlands B.V.", "uber"],
    ["ASML Holding N.V.", "asml"],
    ["TomTom N.V.", "tomtom"],
    ["Shell", "shell"],
    ["ING Group N.V.", "ing"],
    ["  Adyen  N.V.  ", "adyen"],
    ["", ""],
    ["Philips International B.V.", "philips"],
    ["KPMG Europe LLP", "kpmg europe llp"], // non-Dutch suffix, untouched
  ];

  it.each(cases)('normalize("%s") → "%s"', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });
});

describe("tokenize", () => {
  it("splits on spaces and filters empties", () => {
    expect(tokenize("booking com")).toEqual(["booking", "com"]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("handles single token", () => {
    expect(tokenize("asml")).toEqual(["asml"]);
  });
});
