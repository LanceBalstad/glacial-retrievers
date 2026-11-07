export const BUSINESS_PHONE_DISPLAY = "(218) 935-0931";
export const BUSINESS_PHONE_HREF = "tel:+12189350931";

export const BUSINESS_ADDRESS_STREET = "1877 230th Ave";
export const BUSINESS_ADDRESS_CITY = "Mahnomen, MN 56557";
export const BUSINESS_ADDRESS = `${BUSINESS_ADDRESS_STREET}, ${BUSINESS_ADDRESS_CITY}`;
// Google Maps doesn't place the street address correctly, so directions
// search for the road (T57) instead. The displayed address stays the same.
const BUSINESS_DIRECTIONS_QUERY = "T57, Mahnomen, MN";
// Opens directions in Google Maps (or the phone's maps app).
export const BUSINESS_DIRECTIONS_HREF = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  BUSINESS_DIRECTIONS_QUERY,
)}`;
