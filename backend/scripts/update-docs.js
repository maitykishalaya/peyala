const fs = require('fs');
const path = require('path');

const memoryBankPath = path.join(__dirname, '../../MEMORY_BANK.md');
const readmePath = path.join(__dirname, '../../README.md');

// 1. Update MEMORY_BANK.md
let mb = fs.readFileSync(memoryBankPath, 'utf8');

const targetMB = '## 4) Database Models & Schemas';
const section330 = `### 3.30 Recipe Management, Universal Unit Conversion & Automated Inventory Consumption Engine (\`/recipes\`)
- **Operational Need**: Automatically deduct raw materials from inventory upon selling menu items, eliminate manual stock entry drift, and allow purchasing in bulk packaging (packets, cartons, bottles, boxes, kg) while maintaining canonical stock in usable kitchen units (grams, ml, pieces).
- **Core Principles & Architecture**:
  1. **Strict Zero Existing Logic Break (Mandatory)**: All additions are additive. Historical inventory, purchases, accounts, and sales entries are never mutated.
  2. **Admin-Controlled Master Toggle (\`POSSetting.recipeInventoryAutomationEnabled\`)**: Default: \`false\`. When disabled, the POS operates in standard manual inventory mode. When enabled, only verified and activated recipes consume inventory.
  3. **Universal Unit Conversion Engine (\`backend/src/utils/unitConverter.js\` & \`backend/src/models/UnitConversion.js\`)**:
     - Standard built-in metric conversions: Weight (\`kg\` $\\leftrightarrow$ \`gram\`), Volume (\`litre\` $\\leftrightarrow$ \`ml\`), Count (\`dozen\` $\\leftrightarrow$ \`piece\`).
     - Item-specific packaging rules: e.g. 1 Packet = 25 pieces; 1 Bottle = 750 ml; 1 Carton = 12 Bottles = 9,000 ml.
     - Backward-compatible procurement adapter in \`backend/src/routes/purchases.js\`: converts received purchase units into canonical stock units before calculating Weighted Average Cost (WAC).
  4. **Recipe Model (\`backend/src/models/Recipe.js\`)**:
     - Links to \`menuItem\` + optional \`variantName\`.
     - Supports versioning (\`v1\`, \`v2\`), yields, loss %, estimated cost calculated from current ingredient WAC, and confidence scores.
     - Status: \`draft\`, \`active\`, \`inactive\`.
  5. **Automated Recipe Generation Engine (\`backend/src/services/recipeSuggestionEngine.js\`)**:
     - Evaluates all active menu items against inventory items using culinary taxonomy.
     - Generated 289 initial draft recipes tagged strictly as \`DRAFT — NOT ACTIVE\` with confidence scores and requiring explicit admin review and approval before activation.
  6. **Automated Inventory Consumption Engine (\`backend/src/services/inventoryConsumptionEngine.js\`)**:
     - Triggered on KOT round creation (\`POST /api/orders\` Round 1 and \`POST /api/orders/:id/items\` add-on rounds).
     - Direct billing fallback on \`POST /api/orders/:id/pay\`.
     - Deterministic idempotency key (\`order_\${orderId}_item_\${itemId}_rnd_\${round}_inv_\${invId}\`) prevents duplicate deduction across retries or offline synchronization.
     - Non-blocking shortage policy: hospitality food preparation is never halted by database stock levels.
     - Stock reversals on soft item cancellation (\`DELETE /api/orders/:id/items/:itemId\`), whole order cancel (\`POST /api/orders/:id/cancel\`), and settled bill deletion (\`DELETE /api/orders/:id/settled\`).
  7. **Immutable Movements Ledger (\`backend/src/models/InventoryMovement.js\`)**:
     - Comprehensive audit trail of all automated stock deductions and reversals.
  8. **Frontend Module (\`frontend/src/app/recipes/page.tsx\`)**:
     - 4 tabbed workspaces: Recipe Directory & Builder, Unit Conversion Manager, Auto Suggestions, and Stock Movements Ledger.
     - Added to sidebar/navigation via \`AppLayout.tsx\`.

---

`;

if (!mb.includes('### 3.30 Recipe Management')) {
  mb = mb.replace(targetMB, section330 + targetMB);
}

fs.writeFileSync(memoryBankPath, mb, 'utf8');
console.log('✅ MEMORY_BANK.md updated successfully.');

// 2. Update README.md
let rm = fs.readFileSync(readmePath, 'utf8');

const readmeFeature = `
- **Recipe Management & Automated Inventory Consumption (\`/recipes\`)**: Connects menu items to raw materials, decimal-safe unit conversion adapter for bulk procurement (packets, bottles, boxes, cartons, kg) into canonical units (grams, ml, pieces), multi-round KOT auto-consumption, idempotency protection, item & order cancellation reversals, heuristic auto-recipe generator (289 draft recipes pre-seeded), and admin-controlled master toggle (\`POSSetting.recipeInventoryAutomationEnabled\`).
`;

if (!rm.includes('Recipe Management & Automated Inventory Consumption')) {
  const readmeTarget = '## Features';
  if (rm.includes(readmeTarget)) {
    rm = rm.replace(readmeTarget, readmeTarget + '\n' + readmeFeature);
  } else {
    rm += '\n' + readmeFeature;
  }
  fs.writeFileSync(readmePath, rm, 'utf8');
  console.log('✅ README.md updated successfully.');
}
