/**
 * Unit conversion utility for MISE.
 * Allows seamless switching between Original, US Customary, and Metric measurements.
 */

// Volume conversion factors to ml
const VOLUME_TO_ML = {
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  tbsp: 15,
  tbs: 15,
  tablespoon: 15,
  tablespoons: 15,
  "fl oz": 30,
  "fluid ounce": 30,
  "fluid ounces": 30,
  cup: 240,
  cups: 240,
  c: 240,
  pt: 480,
  pint: 480,
  pints: 480,
  qt: 960,
  quart: 960,
  quarts: 960,
  gal: 3840,
  gallon: 3840,
  gallons: 3840,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
};

// Weight conversion factors to grams
const WEIGHT_TO_G = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
};

const METRIC_VOLUME_UNITS = new Set([
  "ml",
  "milliliter",
  "milliliters",
  "millilitre",
  "millilitres",
  "l",
  "liter",
  "liters",
  "litre",
  "litres",
]);

const METRIC_WEIGHT_UNITS = new Set([
  "g",
  "gram",
  "grams",
  "kg",
  "kilogram",
  "kilograms",
]);

const US_VOLUME_UNITS = new Set([
  "tsp",
  "teaspoon",
  "teaspoons",
  "tbsp",
  "tbs",
  "tablespoon",
  "tablespoons",
  "fl oz",
  "fluid ounce",
  "fluid ounces",
  "cup",
  "cups",
  "c",
  "pt",
  "pint",
  "pints",
  "qt",
  "quart",
  "quarts",
  "gal",
  "gallon",
  "gallons",
]);

const US_WEIGHT_UNITS = new Set([
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
]);

/**
 * Normalizes unit string for lookup.
 */
function normalizeUnit(unit) {
  if (!unit || typeof unit !== "string") return "";
  return unit.toLowerCase().trim().replace(/[.]/g, "");
}

/**
 * Formats a numeric value into friendly culinary fractions or rounded decimals.
 */
export function formatQuantityFraction(value) {
  if (value === null || value === undefined || isNaN(value)) return "";
  if (value <= 0) return "0";

  const whole = Math.floor(value);
  const fraction = value - whole;

  // Standard culinary fractions
  const fractions = [
    [0.125, "1/8"],
    [0.25, "1/4"],
    [1 / 3, "1/3"],
    [0.375, "3/8"],
    [0.5, "1/2"],
    [0.625, "5/8"],
    [2 / 3, "2/3"],
    [0.75, "3/4"],
    [0.875, "7/8"],
  ];

  // If very close to 0 or 1, round to whole
  if (fraction < 0.04) {
    return whole.toString();
  }
  if (fraction > 0.96) {
    return (whole + 1).toString();
  }

  const match = fractions.find(
    ([number]) => Math.abs(fraction - number) < 0.015
  );

  if (match) {
    return whole > 0 ? `${whole} ${match[1]}` : match[1];
  }

  // Fallback: 1 decimal place if clean, else max 2
  if (Math.round(value * 10) / 10 === value) {
    return value.toString();
  }
  return Number(value.toFixed(2)).toString();
}

/**
 * Converts and formats an ingredient measurement.
 *
 * @param {number|null} rawQuantity Numeric quantity (e.g. 10, 60, 1)
 * @param {string} rawUnit Unit string (e.g. "ml", "cup", "tbsp")
 * @param {"original"|"us"|"metric"} system Target unit system
 * @param {number} multiplier Servings multiplier (e.g. 1, 2, 0.5)
 * @returns {{ quantity: string, unit: string, formatted: string }}
 */
export function convertMeasurement(
  rawQuantity,
  rawUnit = "",
  system = "original",
  multiplier = 1
) {
  if (rawQuantity === null || rawQuantity === undefined || isNaN(rawQuantity)) {
    return {
      quantity: "",
      unit: rawUnit || "",
      formatted: rawUnit ? ` ${rawUnit}` : "",
    };
  }

  const baseQuantity = Number(rawQuantity) * multiplier;
  const norm = normalizeUnit(rawUnit);

  // If system is original or no unit, just format base quantity
  if (system === "original" || !norm) {
    const qtyStr = formatQuantityFraction(baseQuantity);
    return {
      quantity: qtyStr,
      unit: rawUnit,
      formatted: `${qtyStr}${rawUnit ? ` ${rawUnit}` : ""}`,
    };
  }

  // --- TARGET: US SYSTEM ---
  if (system === "us") {
    // Already a US unit
    if (US_VOLUME_UNITS.has(norm) || US_WEIGHT_UNITS.has(norm)) {
      const qtyStr = formatQuantityFraction(baseQuantity);
      return {
        quantity: qtyStr,
        unit: rawUnit,
        formatted: `${qtyStr}${rawUnit ? ` ${rawUnit}` : ""}`,
      };
    }

    // Convert Metric Volume -> US Volume
    if (METRIC_VOLUME_UNITS.has(norm)) {
      const ml = baseQuantity * (VOLUME_TO_ML[norm] || 1);
      if (ml < 15) {
        // Less than 1 tbsp: use teaspoons (1 tsp = 5 ml)
        const tsps = ml / 5;
        const qtyStr = formatQuantityFraction(tsps);
        const unit = "tsp";
        return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
      }
      if (ml < 60) {
        // 15 ml to 45 ml: use tablespoons (1 tbsp = 15 ml)
        const tbsps = ml / 15;
        const qtyStr = formatQuantityFraction(tbsps);
        const unit = "tbsp";
        return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
      }
      // 60 ml and above: use cups (1 cup = 240 ml)
      const cups = ml / 240;
      const qtyStr = formatQuantityFraction(cups);
      const unit = cups <= 1 ? "cup" : "cups";
      return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
    }

    // Convert Metric Weight -> US Weight
    if (METRIC_WEIGHT_UNITS.has(norm)) {
      const grams = baseQuantity * (WEIGHT_TO_G[norm] || 1);
      if (grams >= 450) {
        const lbs = grams / 453.6;
        const qtyStr = formatQuantityFraction(lbs);
        const unit = "lb";
        return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
      }
      const oz = grams / 28.35;
      const qtyStr = formatQuantityFraction(oz);
      const unit = "oz";
      return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
    }
  }

  // --- TARGET: METRIC SYSTEM ---
  if (system === "metric") {
    // Already a Metric unit
    if (METRIC_VOLUME_UNITS.has(norm) || METRIC_WEIGHT_UNITS.has(norm)) {
      const qtyStr = formatQuantityFraction(baseQuantity);
      return {
        quantity: qtyStr,
        unit: rawUnit,
        formatted: `${qtyStr}${rawUnit ? ` ${rawUnit}` : ""}`,
      };
    }

    // Convert US Volume -> Metric Volume
    if (US_VOLUME_UNITS.has(norm)) {
      const ml = baseQuantity * (VOLUME_TO_ML[norm] || 1);
      if (ml >= 1000) {
        const liters = Math.round((ml / 1000) * 10) / 10;
        const qtyStr = liters.toString();
        const unit = "L";
        return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
      }
      // Round to nearest whole ml (or 0.5 for very small amounts)
      const roundedMl = ml < 10 ? Math.round(ml * 10) / 10 : Math.round(ml);
      const qtyStr = roundedMl.toString();
      const unit = "ml";
      return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
    }

    // Convert US Weight -> Metric Weight
    if (US_WEIGHT_UNITS.has(norm)) {
      const grams = baseQuantity * (WEIGHT_TO_G[norm] || 1);
      if (grams >= 1000) {
        const kg = Math.round((grams / 1000) * 10) / 10;
        const qtyStr = kg.toString();
        const unit = "kg";
        return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
      }
      // Round to nearest whole gram (e.g. 5g increments if > 50g)
      const roundedGrams =
        grams > 50 ? Math.round(grams / 5) * 5 : Math.round(grams);
      const qtyStr = roundedGrams.toString();
      const unit = "g";
      return { quantity: qtyStr, unit, formatted: `${qtyStr} ${unit}` };
    }
  }

  // Non-convertible unit (e.g. pinch, clove, can, slice): return as-is with multiplier
  const qtyStr = formatQuantityFraction(baseQuantity);
  return {
    quantity: qtyStr,
    unit: rawUnit,
    formatted: `${qtyStr}${rawUnit ? ` ${rawUnit}` : ""}`,
  };
}
