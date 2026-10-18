// A piece as one project uses it: the shared catalog record with that
// project's own edits laid over it. A room entry is { refId, qty, custom? };
// `custom` holds only what the studio changed for this project (name,
// finish, colour, price, …) — the catalog record itself is never touched,
// so the same sofa can be "bouclé, ivory" here and stay "linen, sand" in the
// catalog and every other project. Used by the app, the export (report.js)
// and the client share, so all three price a room the same way.

export const CUSTOM_FIELDS = ['name', 'retailer', 'finish', 'color', 'dimensions', 'notes', 'url', 'image', 'price', 'priceOnRequest'];

const blank = (v) => v == null || v === '';
const toPrice = (v) => (blank(v) ? null : Number(String(v).replace(/[^0-9.]/g, '')));

export function resolvePiece(catalogItem, entry) {
  const c = catalogItem || { name: 'Removed from catalog' };
  const o = (entry && entry.custom) || {};
  const pick = (k) => (blank(o[k]) ? (c[k] == null ? '' : c[k]) : o[k]);
  const price = blank(o.price) ? toPrice(c.price) : toPrice(o.price);
  // "Price on request": set on the catalog piece or for this project, or
  // simply no price known — either way it can't be added into a total.
  const flagged = o.priceOnRequest != null ? !!o.priceOnRequest : !!c.priceOnRequest;
  const onRequest = flagged || price == null || isNaN(price);
  return {
    ...c,
    id: (entry && entry.refId) || c.id,
    name: pick('name'), retailer: pick('retailer'), finish: pick('finish'), color: pick('color'),
    dimensions: pick('dimensions'), notes: pick('notes'), url: pick('url'), image: pick('image'),
    price: onRequest ? null : price,
    priceOnRequest: onRequest,
    qty: Math.max(1, Number(entry && entry.qty) || 1),
    edited: Object.keys(o).some((k) => !blank(o[k])),
  };
}

/** The line under every investment total. Prices never include delivery,
 *  white-glove or tax; when any piece is priced on request, say so too. */
export function priceExclusions(hasOnRequest) {
  return hasOnRequest
    ? 'Prices shown do not include pieces marked “Price on request”, shipping, white-glove delivery or taxes.'
    : 'Prices shown do not include shipping, white-glove delivery or taxes.';
}

export const ON_REQUEST_LABEL = 'Price on request';
