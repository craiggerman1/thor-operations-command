import { NextResponse } from "next/server";

type UrgentBroadcastMessage = {
  id: string;
  message: string;
  version: string;
  active: boolean;
  targetScope: string;
};

type DirectorBroadcastMessage = {
  message: string;
  version: string;
  active: boolean;
};

type BroadcastState = {
  urgentBroadcasts: UrgentBroadcastMessage[];
  directorBroadcast: DirectorBroadcastMessage | null;
};

const defaultState: BroadcastState = {
  urgentBroadcasts: [],
  directorBroadcast: null
};

const globalBroadcastState = globalThis as typeof globalThis & {
  __tocBroadcastState?: BroadcastState;
};

function getBroadcastState() {
  if (!globalBroadcastState.__tocBroadcastState) {
    globalBroadcastState.__tocBroadcastState = defaultState;
  }

  return globalBroadcastState.__tocBroadcastState;
}

function cleanUrgentBroadcasts(raw: unknown) {
  if (!Array.isArray(raw)) return [] as UrgentBroadcastMessage[];

  return raw.map((item) => {
    const broadcast = item as Partial<UrgentBroadcastMessage>;
    return {
      id: broadcast.id || `urgent-${Date.now()}`,
      message: broadcast.message || "",
      version: broadcast.version || Date.now().toString(),
      active: Boolean(broadcast.active),
      targetScope: broadcast.targetScope || "All users"
    };
  });
}

function cleanDirectorBroadcast(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;

  const broadcast = raw as Partial<DirectorBroadcastMessage>;
  return {
    message: broadcast.message || "",
    version: broadcast.version || Date.now().toString(),
    active: Boolean(broadcast.active)
  };
}

export function GET() {
  return NextResponse.json(getBroadcastState());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const state = getBroadcastState();

  if (body.kind === "urgent") {
    state.urgentBroadcasts = cleanUrgentBroadcasts(body.broadcasts);
  }

  if (body.kind === "director") {
    state.directorBroadcast = cleanDirectorBroadcast(body.broadcast);
  }

  if (body.kind === "clear-director") {
    state.directorBroadcast = null;
  }

  return NextResponse.json(state);
}
