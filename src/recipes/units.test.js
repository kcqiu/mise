import { describe, expect, it } from "vitest";
import { convertMeasurement, formatQuantityFraction } from "./units";

describe("units conversion module", () => {
  describe("formatQuantityFraction", () => {
    it("formats whole numbers and common fractions", () => {
      expect(formatQuantityFraction(1)).toBe("1");
      expect(formatQuantityFraction(0.5)).toBe("1/2");
      expect(formatQuantityFraction(0.25)).toBe("1/4");
      expect(formatQuantityFraction(0.75)).toBe("3/4");
      expect(formatQuantityFraction(0.333)).toBe("1/3");
      expect(formatQuantityFraction(1.5)).toBe("1 1/2");
      expect(formatQuantityFraction(2.25)).toBe("2 1/4");
    });

    it("handles null, zero, and decimals", () => {
      expect(formatQuantityFraction(null)).toBe("");
      expect(formatQuantityFraction(0)).toBe("0");
      expect(formatQuantityFraction(1.1)).toBe("1.1");
    });
  });

  describe("convertMeasurement - Original mode", () => {
    it("preserves original values and formats with multiplier", () => {
      expect(convertMeasurement(10, "ml", "original")).toEqual({
        quantity: "10",
        unit: "ml",
        formatted: "10 ml",
      });

      expect(convertMeasurement(10, "ml", "original", 2)).toEqual({
        quantity: "20",
        unit: "ml",
        formatted: "20 ml",
      });

      expect(convertMeasurement(1, "cup", "original")).toEqual({
        quantity: "1",
        unit: "cup",
        formatted: "1 cup",
      });
    });

    it("handles items without units or counts", () => {
      expect(convertMeasurement(2, "", "original")).toEqual({
        quantity: "2",
        unit: "",
        formatted: "2",
      });
    });
  });

  describe("convertMeasurement - Metric to US Customary", () => {
    it("converts 10 ml oat milk to 2 tsp", () => {
      const result = convertMeasurement(10, "ml", "us");
      expect(result.quantity).toBe("2");
      expect(result.unit).toBe("tsp");
      expect(result.formatted).toBe("2 tsp");
    });

    it("converts 15 ml to 1 tbsp", () => {
      const result = convertMeasurement(15, "ml", "us");
      expect(result.quantity).toBe("1");
      expect(result.unit).toBe("tbsp");
      expect(result.formatted).toBe("1 tbsp");
    });

    it("converts 30 ml to 2 tbsp", () => {
      const result = convertMeasurement(30, "ml", "us");
      expect(result.quantity).toBe("2");
      expect(result.unit).toBe("tbsp");
      expect(result.formatted).toBe("2 tbsp");
    });

    it("converts 60 ml heavy cream to 1/4 cup", () => {
      const result = convertMeasurement(60, "ml", "us");
      expect(result.quantity).toBe("1/4");
      expect(result.unit).toBe("cup");
      expect(result.formatted).toBe("1/4 cup");
    });

    it("converts 120 ml to 1/2 cup", () => {
      const result = convertMeasurement(120, "ml", "us");
      expect(result.quantity).toBe("1/2");
      expect(result.unit).toBe("cup");
      expect(result.formatted).toBe("1/2 cup");
    });

    it("converts 240 ml to 1 cup", () => {
      const result = convertMeasurement(240, "ml", "us");
      expect(result.quantity).toBe("1");
      expect(result.unit).toBe("cup");
      expect(result.formatted).toBe("1 cup");
    });

    it("leaves existing US units untouched in US mode", () => {
      const result = convertMeasurement(1, "cup", "us");
      expect(result.quantity).toBe("1");
      expect(result.unit).toBe("cup");
      expect(result.formatted).toBe("1 cup");
    });

    it("converts metric weights (g, kg) to oz and lb", () => {
      const smallWeight = convertMeasurement(100, "g", "us");
      expect(smallWeight.unit).toBe("oz");

      const largeWeight = convertMeasurement(500, "g", "us");
      expect(largeWeight.unit).toBe("lb");
    });
  });

  describe("convertMeasurement - US Customary to Metric", () => {
    it("converts 1 tsp to 5 ml", () => {
      const result = convertMeasurement(1, "tsp", "metric");
      expect(result.quantity).toBe("5");
      expect(result.unit).toBe("ml");
      expect(result.formatted).toBe("5 ml");
    });

    it("converts 1 tbsp to 15 ml", () => {
      const result = convertMeasurement(1, "tbsp", "metric");
      expect(result.quantity).toBe("15");
      expect(result.unit).toBe("ml");
      expect(result.formatted).toBe("15 ml");
    });

    it("converts 1 cup to 240 ml", () => {
      const result = convertMeasurement(1, "cup", "metric");
      expect(result.quantity).toBe("240");
      expect(result.unit).toBe("ml");
      expect(result.formatted).toBe("240 ml");
    });

    it("converts 1/2 cup to 120 ml", () => {
      const result = convertMeasurement(0.5, "cup", "metric");
      expect(result.quantity).toBe("120");
      expect(result.unit).toBe("ml");
      expect(result.formatted).toBe("120 ml");
    });

    it("converts 1/4 cup to 60 ml", () => {
      const result = convertMeasurement(0.25, "cup", "metric");
      expect(result.quantity).toBe("60");
      expect(result.unit).toBe("ml");
      expect(result.formatted).toBe("60 ml");
    });

    it("leaves existing Metric units untouched in Metric mode", () => {
      const result = convertMeasurement(10, "ml", "metric");
      expect(result.quantity).toBe("10");
      expect(result.unit).toBe("ml");
      expect(result.formatted).toBe("10 ml");
    });
  });

  describe("convertMeasurement - Non-convertible items", () => {
    it("preserves counts and qualitative descriptors", () => {
      expect(convertMeasurement(2, "cloves", "us")).toEqual({
        quantity: "2",
        unit: "cloves",
        formatted: "2 cloves",
      });

      expect(convertMeasurement(1, "pinch", "metric")).toEqual({
        quantity: "1",
        unit: "pinch",
        formatted: "1 pinch",
      });

      expect(convertMeasurement(null, "to taste", "us")).toEqual({
        quantity: "",
        unit: "to taste",
        formatted: " to taste",
      });
    });
  });
});
