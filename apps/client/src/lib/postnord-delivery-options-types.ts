/**
 * Types for PostNord Delivery Options API.
 *
 * Endpoint: POST {host}/rest/shipment/v1/deliveryoptions?apikey=<KEY>
 * Returns structured delivery alternatives (mailbox, parcel-locker, service-point,
 * home, express-mailbox, groupage, international-parcel) for a recipient address,
 * given one or more sender warehouses.
 *
 * @see https://developer.postnord.com/api/getting-started/delivery-options
 */

export type PostNordCountryCode = "SE" | "NO" | "DK" | "FI" | (string & {});

export type PostNordDeliveryType =
  | "home"
  | "parcel-locker"
  | "service-point"
  | "mailbox"
  | "express-mailbox"
  | "groupage"
  | "international-parcel";

export type PostNordAddress = {
  streetName: string;
  streetNumber?: string;
  postCode: string;
  city: string;
  countryCode: PostNordCountryCode;
};

export type PostNordWarehouse = {
  id: string;
  address: PostNordAddress;
  /** ISO timestamp of latest order cut-off for the warehouse (controls earliest delivery). */
  orderHandling: { timeOfLatestOrder: string };
};

export type PostNordDeliveryOptionsRequest = {
  customer: { customerKey: string };
  warehouses: PostNordWarehouse[];
  filter: { deliveryTypes: PostNordDeliveryType[] };
  recipient: { address: PostNordAddress };
};

export type PostNordCheckoutTexts = {
  title: string;
  briefDescription?: string;
  fullDescription?: string;
  friendlyDeliveryInfo?: string;
};

export type PostNordSustainability = {
  fossilFree?: boolean;
  nordicSwanEcoLabel?: boolean;
};

export type PostNordTimeRange = { from: string; to: string };

export type PostNordOpeningDay =
  | { open: true; timeRanges: PostNordTimeRange[] }
  | { open: false };

export type PostNordOpeningHours = {
  regular: {
    monday: PostNordOpeningDay;
    tuesday: PostNordOpeningDay;
    wednesday: PostNordOpeningDay;
    thursday: PostNordOpeningDay;
    friday: PostNordOpeningDay;
    saturday: PostNordOpeningDay;
    sunday: PostNordOpeningDay;
  };
  deviations?: Array<{
    date?: string;
    open?: boolean;
    timeRanges?: PostNordTimeRange[];
  }>;
};

export type PostNordPickupLocation = {
  name: string;
  /** Distance from recipient address in metres. */
  distanceFromRecipientAddress?: number;
  address: PostNordAddress;
  coordinate?: { latitude: number; longitude: number };
  openingHours?: PostNordOpeningHours;
};

export type PostNordBookingInstructions = {
  /** Stable id used to reference the picked option in subsequent booking calls. */
  deliveryOptionId: string;
  serviceCode: string;
  additionalServiceCodes: string[];
  /** Present for service-point / parcel-locker locations. */
  servicePointId?: string;
};

export type PostNordDeliveryTime =
  | { date: { latest: string; earliest?: string } }
  | { dayRange: { days: string } };

export type PostNordDeliveryAlternative = {
  bookingInstructions: PostNordBookingInstructions;
  descriptiveTexts: { checkout: PostNordCheckoutTexts };
  deliveryTime: PostNordDeliveryTime;
  sustainability?: PostNordSustainability;
  /** Present for parcel-locker / service-point alternatives. */
  location?: PostNordPickupLocation;
};

export type PostNordDeliveryOptionGroup = {
  type: PostNordDeliveryType;
  defaultOption?: PostNordDeliveryAlternative;
  additionalOptions?: PostNordDeliveryAlternative[];
};

export type PostNordWarehouseDeliveryOptions = {
  warehouse: PostNordWarehouse;
  deliveryOptions: PostNordDeliveryOptionGroup[];
};

export type PostNordDeliveryOptionsResponse = {
  warehouseToDeliveryOptions: PostNordWarehouseDeliveryOptions[];
};

/** Compact selection emitted to the cart when the user picks an alternative. */
export type PostNordDeliveryOptionsSelection = {
  deliveryOptionId: string;
  type: PostNordDeliveryType;
  serviceCode: string;
  additionalServiceCodes: string[];
  servicePointId?: string;
  title: string;
  friendlyDeliveryInfo?: string;
  warehouseId: string;
  /** Only set for parcel-locker / service-point. */
  locationName?: string;
  locationAddress?: PostNordAddress;
  /** Latest delivery date/time as ISO string when available. */
  latestDelivery?: string;
};
