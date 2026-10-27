import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  auth,
  isAllowedAdminEmail,
  logoutFromFirebase,
  subscribeToAuth,
} from "../../lib/firebase";
import "./adminHome.css";

type EventRow = {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  event_type: string;
  event_status: string;
  details: Record<string, unknown>;
};

const eventTypeLabels: Record<string, string> = {
  general: "General inquiry",
  dog_boarding: "Boarding",
  interested_in_dog: "Dog interest",
  gun_dog_training: "Gun dog training",
  house_training: "House training",
  basic_obedience_training: "Basic obedience",
};

const statusLabels: Record<string, string> = {
  requested: "Requested",
  confirmed: "Confirmed",
  completed: "Completed",
  canceled: "Canceled",
};

const getEventCategory = (eventType: string): "boarding" | "training" | "pickup" | "other" => {
  if (eventType === "dog_boarding") {
    return "boarding";
  }

  if (
    [
      "gun_dog_training",
      "house_training",
      "basic_obedience_training",
    ].includes(eventType)
  ) {
    return "training";
  }

  if (eventType === "interested_in_dog") {
    return "pickup";
  }

  return "other";
};

const getDetailString = (
  details: Record<string, unknown>,
  keys: string[],
): string | null => {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateRange = (startDate: string | null | undefined, endDate: string | null | undefined) => {
  if (!startDate) {
    return "No date";
  }

  if (endDate && endDate !== startDate) {
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  }

  return formatDate(startDate);
};

const formatEventSummary = (event: EventRow) => {
  const firstName =
    getDetailString(event.details, [
      "customer_first_name",
      "owner_first_name",
      "first_name",
    ]) ?? event.first_name;

  const lastName =
    getDetailString(event.details, [
      "customer_last_name",
      "owner_last_name",
      "last_name",
    ]) ?? event.last_name;

  const summary =
    getDetailString(event.details, ["description", "question", "details"]) ??
    "No additional details provided.";

  return {
    customerName: `${firstName} ${lastName}`.trim(),
    summary,
  };
};

const AdminHome = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"pending" | "confirmed">("pending");
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );

  useEffect(() => {
    if (!auth) {
      navigate("/admin-login", { replace: true });
      return;
    }

    const unsubscribe = subscribeToAuth((nextUser) => {
      if (!nextUser || !isAllowedAdminEmail(nextUser.email)) {
        navigate("/admin-login", { replace: true });
        return;
      }
    });

    return unsubscribe;
  }, [navigate]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/events");
      const payload = (await response.json().catch(() => null)) as EventRow[] | null;

      if (!response.ok) {
        const errorMessage =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Unable to load events.";

        throw new Error(errorMessage);
      }

      setEvents(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load the schedule right now.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  const pendingEvents = useMemo(
    () => events.filter((event) => event.event_status === "requested"),
    [events],
  );

  const confirmedEvents = useMemo(
    () => events.filter((event) => event.event_status === "confirmed"),
    [events],
  );

  const handleStatusUpdate = async (eventId: number, nextStatus: "confirmed" | "canceled") => {
    try {
      const response = await fetch(`/api/events/${eventId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to update this event.");
      }

      await loadEvents();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update this event.",
      );
    }
  };

  const handleLogout = async () => {
    try {
      await logoutFromFirebase();
      navigate("/admin-login", { replace: true });
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Unable to sign out right now.",
      );
    }
  };

  const monthLabel = calendarMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const monthStart = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1,
  );
  const firstDayIndex = (monthStart.getDay() + 6) % 7;
  const calendarCells = useMemo(() => {
    const cells: Array<{
      date: Date;
      inMonth: boolean;
      events: EventRow[];
    }> = [];

    for (let index = 0; index < 42; index += 1) {
      const currentDate = new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth(),
        index - firstDayIndex + 1,
      );

      const dayEvents = confirmedEvents.filter((event) => {
        const startDate = event.start_date ? new Date(`${event.start_date}T00:00:00`) : null;
        const endDate = event.end_date ? new Date(`${event.end_date}T00:00:00`) : startDate;

        if (!startDate) {
          return false;
        }

        const targetDay = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate(),
          12,
        );

        return (
          startDate <= targetDay && (!endDate || endDate >= targetDay)
        );
      });

      cells.push({
        date: currentDate,
        inMonth: currentDate.getMonth() === calendarMonth.getMonth(),
        events: dayEvents,
      });
    }

    return cells;
  }, [calendarMonth, confirmedEvents, firstDayIndex]);

  return (
    <main className="admin-page admin-dashboard-page">
      <div className="admin-dashboard">
        <div className="admin-dashboard-topbar">
          <button type="button" className="admin-logout-button" onClick={handleLogout}>
            Log out
          </button>
        </div>

        <section className="admin-card list-card event-list-card">
          <div className="section-heading event-section-header">
            <h2>{activeView === "pending" ? "Inquiries" : "Confirmed inquiries"}</h2>
            <div className="event-toggle" aria-label="Event view toggle">
              <button
                type="button"
                className={activeView === "pending" ? "event-toggle-button active" : "event-toggle-button"}
                onClick={() => setActiveView("pending")}
              >
                Pending
              </button>
              <button
                type="button"
                className={activeView === "confirmed" ? "event-toggle-button active" : "event-toggle-button"}
                onClick={() => setActiveView("confirmed")}
              >
                Confirmed
              </button>
            </div>
          </div>

          {loading ? (
            <p>Loading events…</p>
          ) : activeView === "pending" ? (
            pendingEvents.length === 0 ? (
              <p>No new inquiries right now.</p>
            ) : (
              <div className="request-list">
                {pendingEvents.map((event) => {
                  const { customerName, summary } = formatEventSummary(event);
                  return (
                    <article key={event.id} className="request-item">
                      <div className="request-item-header">
                        <strong>{customerName || "Guest customer"}</strong>
                        <span className="pill">
                          {eventTypeLabels[event.event_type] ?? event.event_type}
                        </span>
                      </div>
                      <p>{summary}</p>
                      <small>
                        {formatDateRange(event.start_date, event.end_date)}
                        {event.phone ? ` • ${event.phone}` : ""}
                      </small>
                      <div className="request-actions">
                        <button
                          type="button"
                          onClick={() => handleStatusUpdate(event.id, "confirmed")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="secondary-button small-button"
                          onClick={() => handleStatusUpdate(event.id, "canceled")}
                        >
                          Decline
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : confirmedEvents.length === 0 ? (
            <p>No confirmed inquiries yet.</p>
          ) : (
            <div className="request-list compact-list">
              {confirmedEvents.map((event) => {
                const { customerName } = formatEventSummary(event);
                const category = getEventCategory(event.event_type);
                const categoryLabel =
                  category === "boarding"
                    ? "Boarding"
                    : category === "training"
                      ? "Training"
                      : category === "pickup"
                        ? "Dog pickup"
                        : "Other";

                return (
                  <div key={event.id} className="confirmed-item">
                    <div>
                      <strong>{customerName || "Guest customer"}</strong>
                      <p>{eventTypeLabels[event.event_type] ?? event.event_type}</p>
                    </div>
                    <div className="confirmed-meta">
                      <span className={`category-pill category-${category}`}>
                        {categoryLabel}
                      </span>
                      <span>{statusLabels[event.event_status] ?? event.event_status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-card calendar-card">
          <div className="calendar-header">
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() =>
                setCalendarMonth(
                  new Date(
                    calendarMonth.getFullYear(),
                    calendarMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
            >
              Prev
            </button>
            <h2>{monthLabel}</h2>
            <button
              type="button"
              className="secondary-button small-button"
              onClick={() =>
                setCalendarMonth(
                  new Date(
                    calendarMonth.getFullYear(),
                    calendarMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
            >
              Next
            </button>
          </div>

          <div className="calendar-weekdays" aria-hidden="true">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarCells.map((cell, index) => (
              <div
                key={`${cell.date.toISOString()}-${index}`}
                className={`calendar-day ${cell.inMonth ? "" : "is-outside"} ${
                  cell.events.length > 0 ? "has-events" : ""
                }`}
              >
                <span className="day-number">{cell.date.getDate()}</span>
                {cell.events.slice(0, 2).map((event) => {
                  const category = getEventCategory(event.event_type);

                  return (
                    <span
                      key={event.id}
                      className={`day-event-label event-category-${category}`}
                    >
                      {eventTypeLabels[event.event_type] ?? event.event_type}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        {error && <p className="admin-error">{error}</p>}
      </div>
    </main>
  );
};

export default AdminHome;
