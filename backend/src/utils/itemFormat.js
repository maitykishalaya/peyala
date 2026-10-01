/**
 * Utility to format order items with variants and add-ons consistently
 * across POS, Analytics, GST, and Auditing reports.
 */

function getOrderItemDetails(it) {
  const baseName = (it?.name || 'Unnamed Item').trim();
  const variantName = (it?.variant?.name || '').trim();
  const addons = (Array.isArray(it?.selectedAddons) ? it.selectedAddons : [])
    .map((a) => (typeof a === 'string' ? a : a?.name || '').trim())
    .filter(Boolean);

  const parts = [];
  if (variantName) parts.push(variantName);
  if (addons.length > 0) parts.push(`+ ${addons.join(', ')}`);

  const fullName = parts.length > 0 ? `${baseName} (${parts.join(', ')})` : baseName;

  return {
    fullName,
    baseName,
    variantName: variantName || null,
    addons,
  };
}

module.exports = {
  getOrderItemDetails,
};
