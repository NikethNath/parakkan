// ASTM D1250 / API MPMS Ch. 11.1 — Table 53B (Generalized Products).
// Reduces an observed hydrometer density at the observed temperature to the
// standard density at 15 °C. Covers MS (petrol) and HSD (diesel), which both
// fall in the "generalized products" group, so one set of constants applies.
//
// Density is in kg/m³ at 15 °C. The 1980 API 2540 generalized-products
// constants for the thermal-expansion coefficient α₁₅ = K0/ρ² + K1/ρ:
const K0 = 346.4228;
const K1 = 0.4388;

export type Astm3bResult = {
  /** standard density at 15 °C (kg/m³) */
  density15: number;
  /** observed density, normalized to kg/m³ */
  observed: number;
  tempC: number;
  /** thermal-expansion coefficient at 15 °C, per °C */
  alpha15: number;
  /** CTL = volume(15 °C) / volume(observed T); multiply observed-temp litres by
   *  this to get litres at 15 °C */
  vcf: number;
  /** whether inputs are within the table's validity window */
  inRange: boolean;
};

/** Coefficient of thermal expansion at 15 °C for a given base density. */
function alpha(rho15: number): number {
  return K0 / (rho15 * rho15) + K1 / rho15;
}

/** CTL (correction to 15 °C) from the base density at 15 °C and observed temp. */
function ctl(rho15: number, tempC: number): number {
  const dT = tempC - 15;
  const a = alpha(rho15);
  return Math.exp(-a * dT * (1 + 0.8 * a * dT));
}

/**
 * Observed density (kg/m³ or kg/L) at `tempC` → density at 15 °C.
 * Accepts kg/L (e.g. 0.8350) or kg/m³ (e.g. 835.0) — anything < 2 is treated
 * as kg/L. Solved by fixed-point iteration since α depends on the unknown ρ₁₅.
 */
export function densityAt15(observed: number, tempC: number): Astm3bResult {
  const rhoObs = observed < 2 ? observed * 1000 : observed;
  let rho15 = rhoObs;
  for (let i = 0; i < 50; i++) {
    const next = rhoObs / ctl(rho15, tempC);
    if (Math.abs(next - rho15) < 1e-9) {
      rho15 = next;
      break;
    }
    rho15 = next;
  }
  return {
    density15: rho15,
    observed: rhoObs,
    tempC,
    alpha15: alpha(rho15),
    vcf: ctl(rho15, tempC),
    inRange: rho15 >= 653 && rho15 <= 1075 && tempC >= -30 && tempC <= 90,
  };
}

/** Forward direction (for validation / volume work): density at `tempC` from a
 *  base density at 15 °C. Exact inverse of {@link densityAt15}. */
export function densityAtT(rho15: number, tempC: number): number {
  return rho15 * ctl(rho15, tempC);
}
