export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";

// Must match the values accepted by normalizeEventPayload in server/src/index.ts.
export type EventType =
  | "gun_dog_training"
  | "house_training"
  | "basic_obedience_training"
  | "interested_in_dog"
  | "dog_boarding"
  | "general";

export type EventStatus = "requested" | "confirmed" | "completed" | "canceled";

export interface CreateEventPayload {
  event_type: EventType;
  event_status: EventStatus;
  // Optional only for interested_in_dog, which has no date until a pickup is scheduled.
  start_date?: string | null;
  end_date?: string | null;
  details: Record<string, unknown>;
}

export const todayISODate = () => new Date().toISOString().slice(0, 10);

export const createEvent = async (
  payload: CreateEventPayload,
  fallbackError: string,
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new Error(result.error ?? fallbackError);
  }
};
