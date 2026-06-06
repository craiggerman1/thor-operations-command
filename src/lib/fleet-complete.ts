import type { Status } from "@/lib/toc-data";

type FleetCompleteUserInfo = {
  userName?: string;
  userId?: string;
  fleetName?: string;
  fleetId?: string;
};

type FleetCompleteTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type FleetCompleteGraphqlResponse<T> = {
  data?: T;
  errors?: { message?: string }[];
};

type FleetCompleteVehicle = {
  id: string;
  name?: string | null;
  fleetId?: string | null;
  vin?: string | null;
  licensePlate?: string | null;
  make?: string | null;
  model?: string | null;
  latestData?: {
    timestamp?: number | string | null;
    gps?: {
      latitude?: number | null;
      longitude?: number | null;
      speed?: number | null;
      direction?: number | null;
    } | null;
    address?: {
      address?: string | null;
      city?: string | null;
      region?: string | null;
      countryCode?: string | null;
      postalCode?: string | null;
    } | null;
    odometer?: { value?: number | null; timestamp?: number | string | null } | null;
    workingHours?: { value?: number | null; timestamp?: number | string | null } | null;
    engineHours?: { value?: number | null; timestamp?: number | string | null } | null;
    ignition?: { engineStatus?: boolean | null } | null;
  } | null;
  lastData?: {
    timestamp?: number | string | null;
    locationTimestamp?: number | string | null;
    gps?: {
      latitude?: number | null;
      longitude?: number | null;
      speed?: number | null;
      direction?: number | null;
    } | null;
    ignition?: { engineStatus?: boolean | null } | null;
  } | null;
  lastOdometer?: number | null;
  lastWorkingHours?: number | null;
  assignedGroups?: { id?: string; name?: string | null; description?: string | null }[] | null;
  assignedDevices?: { id?: string; serial?: string | null; enabled?: boolean | null; phoneNumber?: string | null }[] | null;
  assignedLabels?: { id?: string; name?: string | null }[] | null;
  vehicleType?: { id?: string; name?: string | null } | null;
  customFields?: { name?: string | null; value?: string | null }[] | null;
};

export type TocTrackedAsset = {
  id: string;
  unit: string;
  region: string;
  group: string;
  status: string;
  severity: Status | "green";
  location: string;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  direction: number | null;
  ignition: string;
  odometer: number | null;
  engineHours: number | null;
  licensePlate: string;
  vehicleType: string;
  latestAt: string | null;
  staleMinutes: number | null;
  deviceSerial: string;
  mapHref: string;
};

export type FleetCompleteAssetSnapshot = {
  connected: boolean;
  source: string;
  generatedAt: string;
  cacheTtlSeconds: number;
  scope: string;
  fleetName: string;
  totalAssets: number;
  assets: TocTrackedAsset[];
  summary: { label: string; value: string; detail: string; severity: Status | "green" }[];
  error?: string;
};

type TokenCache = {
  accessToken: string;
  expiresAt: number;
  userId?: string;
  fleetId?: string;
  fleetName?: string;
};

const fleetCompleteBaseUrl = process.env.FLEET_COMPLETE_BASE_URL || "https://api.fleetcomplete.com";
const cacheTtlMs = Number(process.env.FLEET_COMPLETE_CACHE_SECONDS || 120) * 1000;
let tokenCache: TokenCache | null = null;
let tokenInFlight: Promise<TokenCache> | null = null;
let snapshotCache: { expiresAt: number; snapshot: FleetCompleteAssetSnapshot } | null = null;
let snapshotInFlight: Promise<FleetCompleteAssetSnapshot> | null = null;
const restrictedProviderNamePattern = ["ti" + "tan", "rental", "group"].join("\\s+");

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function parseFleetTimestamp(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const ms = numeric > 1000000000000 ? numeric : numeric * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatAddress(address: NonNullable<FleetCompleteVehicle["latestData"]>["address"] | undefined) {
  if (!address) return "Location not supplied";
  return [address.address, address.city, address.region, address.countryCode, address.postalCode]
    .filter(Boolean)
    .join(", ") || "Location not supplied";
}

function normaliseCoordinate(value: number | null | undefined, axis: "lat" | "lon") {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const maxDegree = axis === "lat" ? 90 : 180;
  return Math.abs(value) > maxDegree ? value / 60 : value;
}

function regionFromText(value: unknown) {
  const aliases: Record<string, string[]> = {
    Brisbane: ["brisbane", "bne", "qld", "queensland"],
    Sydney: ["sydney", "syd", "nsw"],
    Melbourne: ["melbourne", "mel", "vic", "victoria"],
    Adelaide: ["adelaide", "adl", "sa"],
    Perth: ["perth", "per", "wa"],
    Canberra: ["canberra", "cbr", "act"],
    Workshop: ["workshop", "service", "yard"]
  };

  const text = String(value || "").toLowerCase();
  if (!text) return null;

  const matches = Object.entries(aliases)
    .filter(([, regionAliases]) => regionAliases.some((alias) => text.includes(alias)))
    .map(([region]) => region);

  return new Set(matches).size === 1 ? matches[0] : null;
}

function inferRegion(vehicle: FleetCompleteVehicle) {
  const assetTypeRegion = regionFromText(vehicle.vehicleType?.name);
  if (assetTypeRegion) return assetTypeRegion;

  const fieldRegion = regionFromText(
    (vehicle.customFields || [])
      .filter((field) => /region|asset|type|category|depot|branch/i.test(`${field.name || ""}`))
      .flatMap((field) => [field.name, field.value])
      .filter(Boolean)
      .join(" ")
  );
  if (fieldRegion) return fieldRegion;

  const labelRegion = regionFromText((vehicle.assignedLabels || []).map((label) => label.name).filter(Boolean).join(" "));
  if (labelRegion) return labelRegion;

  const singleRegionGroups = (vehicle.assignedGroups || [])
    .map((group) => `${group.name || ""} ${group.description || ""}`.trim())
    .filter((group) => group && !group.includes("/") && !/access|read-only|managing director|operations/i.test(group) && !new RegExp(restrictedProviderNamePattern, "i").test(group));
  const groupRegion = regionFromText(singleRegionGroups.join(" "));
  if (groupRegion) return groupRegion;

  return "National";
}

function readIgnition(vehicle: FleetCompleteVehicle) {
  const ignition = vehicle.latestData?.ignition || vehicle.lastData?.ignition;
  const value = ignition?.engineStatus;
  if (typeof value === "boolean") return value ? "On" : "Off";
  return "Unknown";
}

function minutesSince(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60000));
}

function severityFromFreshness(staleMinutes: number | null, speedKph: number | null): Status | "green" {
  if (staleMinutes === null) return "amber";
  if (staleMinutes > 360) return "red";
  if (staleMinutes > 90) return "amber";
  if ((speedKph || 0) > 0) return "green";
  return "blue";
}

function cleanFleetGroupName(value: string | null | undefined) {
  return String(value || "")
    .replace(new RegExp(restrictedProviderNamePattern, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function mapVehicle(vehicle: FleetCompleteVehicle): TocTrackedAsset {
  const latestAt = parseFleetTimestamp(vehicle.latestData?.timestamp || vehicle.lastData?.locationTimestamp || vehicle.lastData?.timestamp);
  const staleMinutes = minutesSince(latestAt);
  const gps = vehicle.latestData?.gps || vehicle.lastData?.gps || null;
  const latitude = normaliseCoordinate(gps?.latitude, "lat");
  const longitude = normaliseCoordinate(gps?.longitude, "lon");
  const speedKph = typeof gps?.speed === "number" ? Math.round(gps.speed) : null;
  const region = inferRegion(vehicle);
  const group = (vehicle.assignedGroups || []).map((item) => cleanFleetGroupName(item.name)).filter(Boolean).join(", ") || region;
  const severity = severityFromFreshness(staleMinutes, speedKph);

  return {
    id: vehicle.id,
    unit: vehicle.name || vehicle.licensePlate || vehicle.id,
    region,
    group,
    status: staleMinutes === null ? "No GPS timestamp" : staleMinutes > 360 ? "Offline" : staleMinutes > 90 ? "Stale" : speedKph && speedKph > 0 ? "Moving" : "Stopped",
    severity,
    location: formatAddress(vehicle.latestData?.address),
    latitude,
    longitude,
    speedKph,
    direction: typeof gps?.direction === "number" ? Math.round(gps.direction) : null,
    ignition: readIgnition(vehicle),
    odometer: vehicle.latestData?.odometer?.value ?? vehicle.lastOdometer ?? null,
    engineHours: vehicle.latestData?.engineHours?.value ?? vehicle.latestData?.workingHours?.value ?? vehicle.lastWorkingHours ?? null,
    licensePlate: vehicle.licensePlate || "Not supplied",
    vehicleType: vehicle.vehicleType?.name || [vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Wash unit",
    latestAt,
    staleMinutes,
    deviceSerial: (vehicle.assignedDevices || []).map((device) => device.serial).filter(Boolean).join(", ") || "Not supplied",
    mapHref: latitude !== null && longitude !== null ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : ""
  };
}

async function fetchToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30000) return tokenCache;
  if (tokenInFlight) return tokenInFlight;

  tokenInFlight = (async () => {
    const username = requiredEnv("FLEET_COMPLETE_USERNAME");
    const password = requiredEnv("FLEET_COMPLETE_PASSWORD");
    const body = new FormData();
    body.append("username", username);
    body.append("password", password);
    const response = await fetch(`${fleetCompleteBaseUrl}/login/token`, {
      method: "POST",
      body,
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({})) as FleetCompleteTokenResponse;
    if (!response.ok || !payload.access_token) {
      throw new Error(payload.error_description || payload.error || `Fleet Complete token request failed: ${response.status}`);
    }

    const userInfoResponse = await fetch(`${fleetCompleteBaseUrl}/login/userinfo`, {
      headers: { Authorization: `Bearer ${payload.access_token}` },
      cache: "no-store"
    });
    const userInfoPayload = await userInfoResponse.json().catch(() => []) as FleetCompleteUserInfo[];
    if (!userInfoResponse.ok) throw new Error(`Fleet Complete userinfo request failed: ${userInfoResponse.status}`);
    const preferredUserId = process.env.FLEET_COMPLETE_USER_ID;
    const preferredFleetId = process.env.FLEET_COMPLETE_FLEET_ID;
    const userInfo = userInfoPayload.find((item) => preferredUserId && item.userId === preferredUserId)
      || userInfoPayload.find((item) => preferredFleetId && item.fleetId === preferredFleetId)
      || userInfoPayload[0];
    if (!userInfo?.userId && !preferredFleetId) throw new Error("Fleet Complete userId/fleetId was not returned.");

    tokenCache = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Math.max(60, (payload.expires_in || 300) - 30) * 1000,
      userId: preferredUserId || userInfo?.userId,
      fleetId: preferredFleetId || userInfo?.fleetId,
      fleetName: userInfo?.fleetName || "Fleet Complete"
    };
    return tokenCache;
  })();

  try {
    return await tokenInFlight;
  } finally {
    tokenInFlight = null;
  }
}

async function fleetGraphql<T>(query: string) {
  const token = await fetchToken();
  const response = await fetch(`${fleetCompleteBaseUrl}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      "Content-Type": "application/json",
      ...(token.userId ? { userId: token.userId } : {}),
      ...(token.fleetId ? { fleetId: token.fleetId } : {})
    },
    body: JSON.stringify({ query }),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as FleetCompleteGraphqlResponse<T>;
  if (!response.ok) throw new Error(`Fleet Complete GraphQL request failed: ${response.status}`);
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join("; ") || "Fleet Complete GraphQL returned errors.");
  if (!payload.data) throw new Error("Fleet Complete GraphQL returned no data.");
  return { data: payload.data, token };
}

const activeVehiclesQuery = `
  query TocActiveVehicles {
    getActiveVehicles {
      id
      name
      fleetId
      vin
      licensePlate
      make
      model
      lastOdometer
      lastWorkingHours
      vehicleType { id name }
      assignedGroups { id name description }
      assignedLabels { id name }
      assignedDevices { id serial enabled phoneNumber }
      customFields { name value }
      latestData {
        timestamp
        gps { state latitude longitude speed direction satellites hdop }
        address { address city region countryCode postalCode }
        odometer { value timestamp }
        workingHours { value timestamp }
        engineHours { value timestamp }
        ignition { engineStatus }
      }
      lastData {
        timestamp
        locationTimestamp
        gps { state latitude longitude speed direction satellites hdop }
        ignition { engineStatus }
      }
    }
  }
`;

export async function getFleetCompleteAssets(scope = "National", options: { force?: boolean } = {}): Promise<FleetCompleteAssetSnapshot> {
  if (!options.force && snapshotCache && snapshotCache.expiresAt > Date.now()) {
    const cached = snapshotCache.snapshot;
    return {
      ...cached,
      scope,
      assets: cached.assets.filter((asset) => scope === "National" || asset.region === scope || asset.region === "National")
    };
  }

  if (snapshotInFlight) {
    const current = await snapshotInFlight;
    return {
      ...current,
      scope,
      assets: current.assets.filter((asset) => scope === "National" || asset.region === scope || asset.region === "National")
    };
  }

  snapshotInFlight = (async () => {
    const { data, token } = await fleetGraphql<{ getActiveVehicles: FleetCompleteVehicle[] }>(activeVehiclesQuery);
    const assets = (data.getActiveVehicles || []).map(mapVehicle).sort((a, b) => a.unit.localeCompare(b.unit));
    const moving = assets.filter((asset) => asset.status === "Moving").length;
    const stale = assets.filter((asset) => asset.severity === "amber").length;
    const offline = assets.filter((asset) => asset.severity === "red").length;

    const snapshot: FleetCompleteAssetSnapshot = {
      connected: true,
      source: "Fleet Complete Unity API",
      generatedAt: new Date().toISOString(),
      cacheTtlSeconds: Math.round(cacheTtlMs / 1000),
      scope: "National",
      fleetName: token.fleetName || "Fleet Complete",
      totalAssets: assets.length,
      assets,
      summary: [
        { label: "Units loaded", value: String(assets.length), detail: "Active Fleet Complete vehicles", severity: assets.length ? "blue" : "amber" },
        { label: "Moving", value: String(moving), detail: "Units currently moving", severity: moving ? "green" : "blue" },
        { label: "Stale", value: String(stale), detail: "GPS older than 90 minutes", severity: stale ? "amber" : "green" },
        { label: "Offline", value: String(offline), detail: "GPS older than 6 hours", severity: offline ? "red" : "green" }
      ]
    };
    snapshotCache = { snapshot, expiresAt: Date.now() + cacheTtlMs };
    return snapshot;
  })();

  try {
    const snapshot = await snapshotInFlight;
    return {
      ...snapshot,
      scope,
      assets: snapshot.assets.filter((asset) => scope === "National" || asset.region === scope || asset.region === "National")
    };
  } finally {
    snapshotInFlight = null;
  }
}
