import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeProductImport } from "./pkms-product-normalizer";

describe("PKMS product normalizer", () => {
  it("reads products from a products envelope and inherits document metadata", () => {
    const result = normalizeProductImport({
      products: [
        {
          sin: "V2870",
          productName: "Victaulic FireLock Series FL-SR/SW",
          responseType: "Standard Response",
          kFactor: [
            {
              value: 2.8,
              units: "GPM/psi^0.5"
            },
            {
              value: 4,
              units: "LPM/bar^0.5"
            }
          ],
          temperatureRatings: [
            {
              sprinklerTemp: "135°F/57°C",
              coverPlateTemp: null,
              bulbColor: "Orange"
            },
            {
              sprinklerTemp: "155°F/68°C",
              coverPlateTemp: null,
              bulbColor: "Red"
            }
          ],
          approvals: [
            { agency: "cULus", classification: "Horizontal Sidewall" },
            { agency: "FM", classification: "Horizontal Sidewall" }
          ]
        },
        {
          sin: "V4270",
          productName: "Victaulic FireLock Series FL-SR/SW",
          kFactor: [
            {
              value: 4.2,
              units: "GPM/psi^0.5"
            },
            {
              value: 6.1,
              units: "LPM/bar^0.5"
            }
          ]
        }
      ],
      accessories: [],
      documentInfo: {
        documentNumber: "41.52",
        manufacturer: "Victaulic"
      }
    });

    assert.equal(result.sourceItems, 2);
    assert.equal(result.products.length, 2);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(
      {
        manufacturer: result.products[0].manufacturer,
        productNo: result.products[0].product_no,
        kFactor: result.products[0].k_value_raw,
        approvals: result.products[0].approvals,
        temperatureRatings: result.products[0].temperature_ratings,
        color: result.products[0].color
      },
      {
        manufacturer: "Victaulic",
        productNo: "V2870",
        kFactor: "2.8 GPM/psi^0.5 / 40 LPM/bar^0.5",
        approvals: "cULus, FM",
        temperatureRatings: [
          {
            sprinklerTemp: "135°F/57°C",
            coverPlateTemp: null,
            bulbColor: "Orange"
          },
          {
            sprinklerTemp: "155°F/68°C",
            coverPlateTemp: null,
            bulbColor: "Red"
          }
        ],
        color: "Orange, Red"
      }
    );
    assert.equal(
      result.products[1].k_value_raw,
      "4.2 GPM/psi^0.5 / 61 LPM/bar^0.5"
    );

    const reviewedResult = normalizeProductImport(result.products);

    assert.equal(reviewedResult.products[0].approvals, "cULus, FM");
    assert.equal(reviewedResult.products[0].color, "Orange, Red");
    assert.equal(reviewedResult.products[0].temperature_ratings?.length, 2);
  });

  it("keeps supporting a top-level product array", () => {
    const result = normalizeProductImport([
      {
        manufacturer: "Reliable",
        SIN: "R123",
        productName: "Example sprinkler"
      }
    ]);

    assert.equal(result.products.length, 1);
    assert.equal(result.products[0].manufacturer, "Reliable");
    assert.equal(result.products[0].product_no, "R123");
  });
});
