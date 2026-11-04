import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../../components/modal/modal.tsx";
import RequiredMark from "../../components/requiredMark/requiredMark.tsx";
import {
  auth,
  isAllowedAdminEmail,
  logoutFromFirebase,
  subscribeToAuth,
} from "../../lib/firebase";
import { adminFetch } from "../../lib/adminApi";
import "./adminHome.css";

// Status values match public.event_status. On this page they read as:
// requested = New, confirmed = Booked, completed = Done, canceled = Not booked.
type EventStatus = "requested" | "confirmed" | "completed" | "canceled";

type EventRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  created_at: string;
  event_type: string;
  event_status: EventStatus;
  details: Record<string, unknown>;
};

type StatusUpdate = {
  status: EventStatus;
  start_date?: string | null;
  end_date?: string | null;
};

// Body for POST /api/admin/events and PUT /api/admin/events/:id.
type AdminEventPayload = {
  event_type: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  start_date: string;
  end_date: string | null;
  details: Record<string, unknown>;
};

type DogOption = {
  id: number;
  name: string | null;
  breed: string;
};

// "interest" is an interested_in_dog event: an inquiry until a pickup date is
// set, then a dog purchase pickup on the calendar.
type Category = "boarding" | "training" | "interest" | "general";

type Toast = {
  message: string;
  undo?: () => Promise<void>;
};

const categoryLabels: Record<Category, string> = {
  boarding: "Boarding",
  training: "Training",
  interest: "Dog interest",
  general: "Question",
};

// How each category reads once it is on the calendar.
const calendarLabels: Record<Category, string> = {
  boarding: "Boarding",
  training: "Training",
  interest: "Dog pickup",
  general: "Question",
};

const trainingTypeLabels: Record<string, string> = {
  gun_dog_training: "Gun dog training",
  house_training: "House training",
  basic_obedience_training: "Basic obedience",
};

// Event types the admin can put on the calendar by hand.
const calendarEventTypeOptions = [
  { value: "dog_boarding", label: "Boarding" },
  { value: "gun_dog_training", label: "Gun dog training" },
  { value: "house_training", label: "House training" },
  { value: "basic_obedience_training", label: "Basic obedience training" },
  { value: "interested_in_dog", label: "Dog purchase pickup" },
];

const historyStatusLabels: Record<EventStatus, string> = {
  requested: "New",
  confirmed: "Booked",
  completed: "Done",
  canceled: "Not booked",
};

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ---------- Date helpers (all dates are local YYYY-MM-DD strings) ---------- */

const toISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseISODate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (value: string, days: number) => {
  const date = parseISODate(value);
  date.setDate(date.getDate() + days);
  return toISODate(date);
};

const formatShortDate = (value: string) =>
  parseISODate(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatDateRange = (start: string | null, end: string | null) => {
  if (!start) {
    return null;
  }

  if (end && end !== start) {
    return `${formatShortDate(start)} → ${formatShortDate(end)}`;
  }

  return formatShortDate(start);
};

const formatReceived = (createdAt: string) => {
  const created = new Date(createdAt);
  const days = Math.round(
    (parseISODate(toISODate(new Date())).getTime() -
      parseISODate(toISODate(created)).getTime()) /
      86_400_000,
  );

  if (days <= 0) {
    return `Today, ${created.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  return created.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const formatAgendaDay = (value: string, today: string) => {
  if (value === today) {
    return "Today";
  }

  if (value === addDays(today, 1)) {
    return "Tomorrow";
  }

  return formatShortDate(value);
};

/* ---------- Event helpers ---------- */

const getCategory = (eventType: string): Category => {
  if (eventType === "dog_boarding") {
    return "boarding";
  }

  if (eventType in trainingTypeLabels) {
    return "training";
  }

  if (eventType === "interested_in_dog") {
    return "interest";
  }

  return "general";
};

// Boarding and training inquiries arrive with requested dates.
const hasRequestedDates = (category: Category) =>
  category === "boarding" || category === "training";

// Everything except general questions can go on the calendar once it has a date.
const isCalendarCategory = (category: Category) => category !== "general";

const getDetail = (details: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = details[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
};

const getContact = (event: EventRow) => {
  const firstName =
    getDetail(event.details, ["owner_first_name", "customer_first_name"]) ??
    event.first_name ??
    "";
  const lastName =
    getDetail(event.details, ["owner_last_name", "customer_last_name"]) ??
    event.last_name ??
    "";

  return {
    name: `${firstName} ${lastName}`.trim() || "Unknown customer",
    lastName: lastName || firstName || "Booking",
    email: event.email || getDetail(event.details, ["owner_email", "customer_email"]),
    phone: event.phone || getDetail(event.details, ["owner_phone", "customer_phone"]),
  };
};

const getDogCount = (event: EventRow) => {
  const count = Number(event.details.dog_count);

  if (Number.isInteger(count) && count > 0) {
    return count;
  }

  return Array.isArray(event.details.dogs) && event.details.dogs.length > 0
    ? event.details.dogs.length
    : 1;
};

// Interest inquiries carry an auto-generated description, so only admin notes count.
const getMessageKeys = (event: EventRow) =>
  getCategory(event.event_type) === "interest"
    ? ["notes"]
    : ["question", "notes", "description"];

const getMessage = (event: EventRow) => getDetail(event.details, getMessageKeys(event));

// Edits are saved back under the key the message came from so they stay visible.
const getMessageKey = (event: EventRow) =>
  getMessageKeys(event).find((key) => getDetail(event.details, [key])) ?? "notes";

// Short facts shown on cards, e.g. "2 dogs" or "Lab · 18 months · Male".
const getFacts = (event: EventRow): string[] => {
  const category = getCategory(event.event_type);

  if (category === "boarding") {
    const count = getDogCount(event);
    return [`${count} ${count === 1 ? "dog" : "dogs"}`];
  }

  if (category === "training") {
    const sex = getDetail(event.details, ["dog_sex"]);
    return [
      trainingTypeLabels[event.event_type],
      getDetail(event.details, ["dog_name"]),
      getDetail(event.details, ["dog_breed"]),
      getDetail(event.details, ["dog_age"]),
      sex === "M" ? "Male" : sex === "F" ? "Female" : null,
    ].filter((fact): fact is string => Boolean(fact));
  }

  if (category === "interest") {
    return [
      [getDetail(event.details, ["dog_name"]), getDetail(event.details, ["dog_breed"])]
        .filter(Boolean)
        .join(" · ") || "Available dog",
    ];
  }

  return [];
};

const getEndDate = (event: EventRow) => event.end_date ?? event.start_date;

// Snapshot of an event in the shape the admin edit route takes (used for undo).
const toAdminPayload = (event: EventRow): AdminEventPayload => {
  const contact = getContact(event);

  return {
    event_type: event.event_type,
    first_name:
      getDetail(event.details, ["owner_first_name", "customer_first_name"]) ??
      event.first_name ??
      "",
    last_name:
      getDetail(event.details, ["owner_last_name", "customer_last_name"]) ??
      event.last_name ??
      "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    start_date: event.start_date ?? "",
    end_date: event.end_date,
    details: event.details,
  };
};

/* ---------- Small presentational pieces ---------- */

const ContactButtons = ({ event }: { event: EventRow }) => {
  const { phone, email } = getContact(event);
  const subject = `Your ${categoryLabels[getCategory(event.event_type)].toLowerCase()} inquiry – Glacial Retrievers`;

  return (
    <div className="ah-contact">
      {phone && (
        <a className="ah-contact-link" href={`tel:${phone}`}>
          <span aria-hidden="true">☎</span> {phone}
        </a>
      )}
      {email && (
        <a
          className="ah-contact-link"
          href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
        >
          <span aria-hidden="true">✉</span> {email}
        </a>
      )}
    </div>
  );
};

const CategoryTag = ({ category }: { category: Category }) => (
  <span className={`ah-tag ah-tag-${category}`}>{categoryLabels[category]}</span>
);

/* ---------- Calendar ---------- */

type CalendarBar = {
  event: EventRow;
  startCol: number;
  endCol: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};

type CalendarWeek = {
  days: string[];
  bars: CalendarBar[];
  laneCount: number;
};

const buildCalendarWeeks = (month: Date, booked: EventRow[]): CalendarWeek[] => {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = toISODate(
    new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1 - firstOfMonth.getDay()),
  );

  return Array.from({ length: 6 }, (_, weekIndex) => {
    const days = Array.from({ length: 7 }, (__, dayIndex) =>
      addDays(gridStart, weekIndex * 7 + dayIndex),
    );
    const weekStart = days[0];
    const weekEnd = days[6];

    const segments = booked
      .filter((event) => event.start_date! <= weekEnd && getEndDate(event)! >= weekStart)
      .map((event) => {
        const start = event.start_date! < weekStart ? weekStart : event.start_date!;
        const end = getEndDate(event)! > weekEnd ? weekEnd : getEndDate(event)!;
        return {
          event,
          startCol: days.indexOf(start),
          endCol: days.indexOf(end),
          continuesLeft: event.start_date! < weekStart,
          continuesRight: getEndDate(event)! > weekEnd,
        };
      })
      .sort((a, b) => a.startCol - b.startCol || b.endCol - a.endCol);

    // Greedy lane assignment so overlapping bookings stack without colliding.
    const laneEnds: number[] = [];
    const bars = segments.map((segment) => {
      let lane = laneEnds.findIndex((laneEnd) => laneEnd < segment.startCol);

      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(segment.endCol);
      } else {
        laneEnds[lane] = segment.endCol;
      }

      return { ...segment, lane };
    });

    return { days, bars, laneCount: laneEnds.length };
  });
};

/* ---------- Page ---------- */

const AdminHome = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bookingTarget, setBookingTarget] = useState<EventRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<EventRow | null>(null);
  // "add" carries the date that was clicked (or "" from the Add button).
  const [editor, setEditor] = useState<
    { mode: "add"; date: string } | { mode: "edit"; event: EventRow } | null
  >(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const today = toISODate(new Date());

  useEffect(() => {
    if (!auth) {
      navigate("/admin-login", { replace: true });
      return;
    }

    return subscribeToAuth((nextUser) => {
      if (!nextUser || !isAllowedAdminEmail(nextUser.email)) {
        navigate("/admin-login", { replace: true });
      }
    });
  }, [navigate]);

  const loadEvents = useCallback(async () => {
    try {
      setError(null);
      const response = await adminFetch("/api/events");
      const payload = (await response.json().catch(() => null)) as
        | EventRow[]
        | { error?: string }
        | null;

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(
          (payload && !Array.isArray(payload) && payload.error) || "Unable to load inquiries.",
        );
      }

      setEvents(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load inquiries.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 7000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const sendStatusUpdate = async (eventId: number, update: StatusUpdate) => {
    const response = await adminFetch(`/api/events/${eventId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Unable to update this inquiry.");
    }
  };

  // Every status change offers an undo that restores the previous status and dates.
  const changeStatus = async (
    event: EventRow,
    update: StatusUpdate,
    toastMessage: string,
  ) => {
    setBusyId(event.id);
    setError(null);

    try {
      await sendStatusUpdate(event.id, update);
      await loadEvents();

      setToast({
        message: toastMessage,
        undo: async () => {
          await sendStatusUpdate(event.id, {
            status: event.event_status,
            // May restore null, e.g. un-scheduling a dog pickup.
            ...(update.start_date !== undefined ? { start_date: event.start_date } : {}),
            ...(update.end_date !== undefined ? { end_date: event.end_date } : {}),
          });
          await loadEvents();
          setToast({ message: "Change undone." });
        },
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Unable to update this inquiry.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const sendAdminEvent = async (payload: AdminEventPayload, eventId?: number) => {
    const response = await adminFetch(
      eventId ? `/api/admin/events/${eventId}` : "/api/admin/events",
      {
        method: eventId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(result?.error ?? "Unable to save this event.");
    }
  };

  // Throws on failure so the editor can show the error and stay open.
  const saveEvent = async (payload: AdminEventPayload) => {
    if (!editor) {
      return;
    }

    if (editor.mode === "add") {
      await sendAdminEvent(payload);
      setEditor(null);
      await loadEvents();
      setToast({ message: `${payload.first_name} ${payload.last_name} added to the calendar.` });
      return;
    }

    const original = editor.event;
    await sendAdminEvent(payload, original.id);
    setEditor(null);
    await loadEvents();
    setToast({
      message: "Changes saved.",
      undo: async () => {
        await sendAdminEvent(toAdminPayload(original), original.id);
        await loadEvents();
        setToast({ message: "Change undone." });
      },
    });
  };

  const handleLogout = async () => {
    try {
      await logoutFromFirebase();
      navigate("/admin-login", { replace: true });
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Unable to sign out.");
    }
  };

  const newInquiries = useMemo(
    () => events.filter((event) => event.event_status === "requested"),
    [events],
  );

  const booked = useMemo(
    () =>
      events.filter(
        (event) =>
          event.event_status === "confirmed" &&
          event.start_date &&
          isCalendarCategory(getCategory(event.event_type)),
      ),
    [events],
  );

  const history = useMemo(
    () =>
      events.filter(
        (event) => event.event_status === "canceled" || event.event_status === "completed",
      ),
    [events],
  );

  const weekAgenda = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => addDays(today, index));

    return days
      .map((day) => ({
        day,
        items: booked.flatMap((event) => {
          const category = getCategory(event.event_type);
          const end = getEndDate(event);
          const items: Array<{ event: EventRow; label: string }> = [];

          if (event.start_date === day) {
            items.push({
              event,
              label:
                category === "boarding"
                  ? "Drop-off"
                  : category === "interest"
                    ? "Dog pickup"
                    : "Training starts",
            });
          }

          if (category === "boarding" && end === day && end !== event.start_date) {
            items.push({ event, label: "Pick-up" });
          }

          return items;
        }),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [booked, today]);

  const dogsOnDay = useCallback(
    (day: string) =>
      booked
        .filter(
          (event) =>
            getCategory(event.event_type) === "boarding" &&
            event.start_date! <= day &&
            getEndDate(event)! >= day,
        )
        .reduce((total, event) => total + getDogCount(event), 0),
    [booked],
  );

  const bookedThisWeek = useMemo(() => {
    const weekEnd = addDays(today, 6);
    return booked.filter(
      (event) => event.start_date! <= weekEnd && getEndDate(event)! >= today,
    ).length;
  }, [booked, today]);

  const calendarWeeks = useMemo(
    () => buildCalendarWeeks(calendarMonth, booked),
    [calendarMonth, booked],
  );

  const shiftMonth = (offset: number) =>
    setCalendarMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );

  const greetingDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="admin-home">
      <div className="ah-container">
        <header className="ah-header">
          <div>
            <p className="ah-eyebrow">Admin dashboard</p>
            <h1>{greetingDate}</h1>
          </div>
          <button type="button" className="ah-button ah-button-ghost" onClick={handleLogout}>
            Log out
          </button>
        </header>

        <div className="ah-stats">
          <div className="ah-stat ah-stat-accent">
            <span className="ah-stat-value">{newInquiries.length}</span>
            <span className="ah-stat-label">
              New {newInquiries.length === 1 ? "inquiry" : "inquiries"} to follow up
            </span>
          </div>
          <div className="ah-stat">
            <span className="ah-stat-value">{bookedThisWeek}</span>
            <span className="ah-stat-label">Booked in the next 7 days</span>
          </div>
          <div className="ah-stat">
            <span className="ah-stat-value">{dogsOnDay(today)}</span>
            <span className="ah-stat-label">Dogs boarding today</span>
          </div>
        </div>

        {error && (
          <p className="ah-error" role="alert">
            {error}
          </p>
        )}

        <div className="ah-top-grid">
          <section className="ah-panel" aria-labelledby="ah-inbox-title">
            <div className="ah-panel-heading">
              <h2 id="ah-inbox-title">New inquiries</h2>
              <p>Call or email them back, then mark how it went.</p>
            </div>

            {loading ? (
              <p className="ah-empty">Loading inquiries…</p>
            ) : newInquiries.length === 0 ? (
              <div className="ah-empty">
                <strong>You’re all caught up.</strong>
                <span>New inquiries from the website will show up here.</span>
              </div>
            ) : (
              <ul className="ah-inbox">
                {newInquiries.map((event) => {
                  const category = getCategory(event.event_type);
                  const contact = getContact(event);
                  const dates = formatDateRange(event.start_date, event.end_date);
                  const facts = getFacts(event);
                  const message = getMessage(event);
                  const isBusy = busyId === event.id;

                  return (
                    <li key={event.id} className={`ah-inquiry ah-inquiry-${category}`}>
                      <div className="ah-inquiry-top">
                        <CategoryTag category={category} />
                        <span className="ah-muted">{formatReceived(event.created_at)}</span>
                      </div>

                      <h3>{contact.name}</h3>

                      {(hasRequestedDates(category) && dates) || facts.length > 0 ? (
                        <p className="ah-facts">
                          {hasRequestedDates(category) && dates && (
                            <span className="ah-facts-dates">Requested {dates}</span>
                          )}
                          {facts.map((fact) => (
                            <span key={fact}>{fact}</span>
                          ))}
                        </p>
                      ) : null}

                      {message && <p className="ah-message">{message}</p>}

                      <ContactButtons event={event} />

                      <div className="ah-actions">
                        {hasRequestedDates(category) ? (
                          <>
                            <button
                              type="button"
                              className="ah-button"
                              disabled={isBusy}
                              onClick={() => setBookingTarget(event)}
                            >
                              Booked
                            </button>
                            <button
                              type="button"
                              className="ah-button ah-button-ghost"
                              disabled={isBusy}
                              onClick={() =>
                                changeStatus(
                                  event,
                                  { status: "canceled" },
                                  `${contact.name} marked as not booked.`,
                                )
                              }
                            >
                              Not booked
                            </button>
                          </>
                        ) : (
                          <>
                            {category === "interest" && (
                              <button
                                type="button"
                                className="ah-button"
                                disabled={isBusy}
                                onClick={() => setBookingTarget(event)}
                              >
                                Schedule pickup
                              </button>
                            )}
                            <button
                              type="button"
                              className={
                                category === "interest" ? "ah-button ah-button-ghost" : "ah-button"
                              }
                              disabled={isBusy}
                              onClick={() =>
                                changeStatus(
                                  event,
                                  { status: "completed" },
                                  `${contact.name}’s inquiry marked as done.`,
                                )
                              }
                            >
                              Done
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ah-panel" aria-labelledby="ah-week-title">
            <div className="ah-panel-heading">
              <h2 id="ah-week-title">This week</h2>
              <p>Drop-offs, pick-ups, training starts, and dog pickups.</p>
            </div>

            {loading ? null : weekAgenda.length === 0 ? (
              <div className="ah-empty">
                <strong>Nothing booked this week.</strong>
                <span>Bookings appear here once you mark them as booked.</span>
              </div>
            ) : (
              <ol className="ah-agenda">
                {weekAgenda.map(({ day, items }) => (
                  <li key={day} className="ah-agenda-day">
                    <h3 className={day === today ? "is-today" : ""}>
                      {formatAgendaDay(day, today)}
                    </h3>
                    <ul>
                      {items.map(({ event, label }) => {
                        const category = getCategory(event.event_type);
                        const facts = getFacts(event);

                        return (
                          <li key={`${event.id}-${label}`}>
                            <button
                              type="button"
                              className={`ah-agenda-item ah-agenda-${category}`}
                              onClick={() => setDetailTarget(event)}
                            >
                              <span className="ah-agenda-label">{label}</span>
                              <span className="ah-agenda-name">{getContact(event).name}</span>
                              <span className="ah-muted">{facts[0]}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="ah-panel" aria-labelledby="ah-calendar-title">
          <div className="ah-calendar-heading">
            <div className="ah-panel-heading">
              <h2 id="ah-calendar-title">
                {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </h2>
              <p>Booked items only. Click a day to add something, or a booking to edit it.</p>
            </div>
            <div className="ah-calendar-nav">
              <button
                type="button"
                className="ah-button ah-button-small"
                onClick={() => setEditor({ mode: "add", date: "" })}
              >
                + Add event
              </button>
              <button
                type="button"
                className="ah-icon-button"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="ah-button ah-button-ghost ah-button-small"
                onClick={() => {
                  const now = new Date();
                  setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                }}
              >
                Today
              </button>
              <button
                type="button"
                className="ah-icon-button"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
              >
                ›
              </button>
            </div>
          </div>

          <div className="ah-legend">
            <span className="ah-legend-item ah-legend-boarding">Boarding</span>
            <span className="ah-legend-item ah-legend-training">Training</span>
            <span className="ah-legend-item ah-legend-interest">Dog purchase pickup</span>
            <span className="ah-legend-item ah-legend-dogs">Dogs boarding that day</span>
          </div>

          <div className="ah-calendar">
            <div className="ah-calendar-weekdays" aria-hidden="true">
              {weekdayNames.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            {calendarWeeks.map((week) => (
              <div
                key={week.days[0]}
                className="ah-calendar-week"
                style={{
                  gridTemplateRows: `var(--ah-day-head) repeat(${week.laneCount}, var(--ah-lane)) minmax(1.25rem, 1fr)`,
                }}
              >
                {week.days.map((day, dayIndex) => {
                  const inMonth = parseISODate(day).getMonth() === calendarMonth.getMonth();
                  const dogs = dogsOnDay(day);

                  return (
                    <button
                      key={day}
                      type="button"
                      className={[
                        "ah-calendar-day",
                        inMonth ? "" : "is-outside",
                        day === today ? "is-today" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ gridColumn: dayIndex + 1 }}
                      aria-label={`Add an event on ${formatShortDate(day)}`}
                      onClick={() => setEditor({ mode: "add", date: day })}
                    >
                      <span className="ah-day-number">{parseISODate(day).getDate()}</span>
                      {dogs > 0 && (
                        <span className="ah-day-dogs" title={`${dogs} dogs boarding`}>
                          {dogs} {dogs === 1 ? "dog" : "dogs"}
                        </span>
                      )}
                    </button>
                  );
                })}

                {week.bars.map((bar) => {
                  const category = getCategory(bar.event.event_type);
                  const contact = getContact(bar.event);
                  const label =
                    category === "boarding"
                      ? `${contact.lastName} · ${getDogCount(bar.event)}`
                      : `${contact.lastName} · ${category === "interest" ? "Pickup" : "Training"}`;

                  return (
                    <button
                      key={`${bar.event.id}-${week.days[0]}`}
                      type="button"
                      className={[
                        "ah-bar",
                        `ah-bar-${category}`,
                        bar.continuesLeft ? "continues-left" : "",
                        bar.continuesRight ? "continues-right" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{
                        gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`,
                        gridRow: bar.lane + 2,
                      }}
                      title={`${contact.name} – ${calendarLabels[category]}, ${formatDateRange(
                        bar.event.start_date,
                        bar.event.end_date,
                      )}`}
                      onClick={() => setDetailTarget(bar.event)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        <details className="ah-panel ah-history">
          <summary>
            <span>History</span>
            <span className="ah-muted">
              {history.length} closed {history.length === 1 ? "inquiry" : "inquiries"}
            </span>
          </summary>

          {history.length === 0 ? (
            <p className="ah-empty">Nothing here yet.</p>
          ) : (
            <ul className="ah-history-list">
              {history.map((event) => {
                const category = getCategory(event.event_type);
                const contact = getContact(event);
                const dates = formatDateRange(event.start_date, event.end_date);

                return (
                  <li key={event.id}>
                    <div className="ah-history-main">
                      <strong>{contact.name}</strong>
                      <span className="ah-muted">
                        {categoryLabels[category]}
                        {isCalendarCategory(category) && dates ? ` · ${dates}` : ""} · received{" "}
                        {formatReceived(event.created_at).toLowerCase()}
                      </span>
                    </div>
                    <span className={`ah-status ah-status-${event.event_status}`}>
                      {historyStatusLabels[event.event_status]}
                    </span>
                    <button
                      type="button"
                      className="ah-button ah-button-ghost ah-button-small"
                      disabled={busyId === event.id}
                      onClick={() =>
                        changeStatus(
                          event,
                          { status: "requested" },
                          `${contact.name} moved back to new inquiries.`,
                        )
                      }
                    >
                      Move back to new
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      </div>

      {bookingTarget && (
        <BookingDialog
          event={bookingTarget}
          onClose={() => setBookingTarget(null)}
          onConfirm={async (update) => {
            const target = bookingTarget;
            setBookingTarget(null);
            await changeStatus(
              target,
              { status: "confirmed", ...update },
              getCategory(target.event_type) === "interest"
                ? `Dog pickup with ${getContact(target).name} added to the calendar.`
                : `${getContact(target).name} is booked and on the calendar.`,
            );
          }}
        />
      )}

      {editor && (
        <EventEditorDialog
          event={editor.mode === "edit" ? editor.event : null}
          initialDate={editor.mode === "add" ? editor.date : ""}
          onClose={() => setEditor(null)}
          onSave={saveEvent}
        />
      )}

      {detailTarget && (
        <BookingDetailDialog
          event={detailTarget}
          onClose={() => setDetailTarget(null)}
          onEdit={() => {
            setEditor({ mode: "edit", event: detailTarget });
            setDetailTarget(null);
          }}
          onCancelBooking={async () => {
            const target = detailTarget;
            setDetailTarget(null);
            await changeStatus(
              target,
              { status: "canceled" },
              `${getContact(target).name}’s booking was canceled and removed from the calendar.`,
            );
          }}
        />
      )}

      {toast && (
        <div className="ah-toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                const undo = toast.undo;
                setToast(null);
                void undo?.().catch((undoError: unknown) =>
                  setError(
                    undoError instanceof Error ? undoError.message : "Unable to undo that change.",
                  ),
                );
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </main>
  );
};

/* ---------- Dialogs ---------- */

interface BookingDialogProps {
  event: EventRow;
  onClose: () => void;
  onConfirm: (update: Pick<StatusUpdate, "start_date" | "end_date">) => Promise<void>;
}

const BookingDialog = ({ event, onClose, onConfirm }: BookingDialogProps) => {
  const category = getCategory(event.event_type);
  const isBoarding = category === "boarding";
  const isPickup = category === "interest";
  const [startDate, setStartDate] = useState(event.start_date ?? "");
  const [endDate, setEndDate] = useState(event.end_date ?? event.start_date ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();

    if (!startDate) {
      setFormError(isPickup ? "Please choose the pickup date." : "Please choose a start date.");
      return;
    }

    if (isBoarding && endDate && endDate < startDate) {
      setFormError("The pick-up date can’t be before the drop-off date.");
      return;
    }

    await onConfirm(
      isBoarding
        ? { start_date: startDate, end_date: endDate || startDate }
        : { start_date: startDate },
    );
  };

  return (
    <Modal
      eyebrow={isPickup ? "Dog purchase pickup" : categoryLabels[category]}
      title={isPickup ? `Schedule pickup with ${getContact(event).name}` : `Book ${getContact(event).name}`}
      onClose={onClose}
    >
      <form className="modal-form ah-dialog" onSubmit={handleSubmit}>
        <p className="ah-dialog-note">
          {isPickup
            ? `Choose the day they’re picking up ${
                getDetail(event.details, ["dog_name"]) ?? "the dog"
              }. This adds the pickup to the calendar.`
            : "Confirm the dates you agreed on. Change them if they’re different from what was requested. This adds the booking to the calendar."}
        </p>

        <div className="modal-field-row">
          <label>
            {isBoarding ? "Drop-off date" : isPickup ? "Pickup date" : "Start date"}
            <input
              type="date"
              value={startDate}
              onChange={(changeEvent) => setStartDate(changeEvent.target.value)}
              required
            />
          </label>

          {isBoarding && (
            <label>
              Pick-up date
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(changeEvent) => setEndDate(changeEvent.target.value)}
                required
              />
            </label>
          )}
        </div>

        {formError && <p className="ah-error">{formError}</p>}

        <div className="ah-dialog-actions">
          <button type="button" className="ah-button ah-button-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ah-button">
            {isPickup ? "Add to calendar" : "Confirm booking"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

interface BookingDetailDialogProps {
  event: EventRow;
  onClose: () => void;
  onEdit: () => void;
  onCancelBooking: () => Promise<void>;
}

const BookingDetailDialog = ({
  event,
  onClose,
  onEdit,
  onCancelBooking,
}: BookingDetailDialogProps) => {
  const category = getCategory(event.event_type);
  const contact = getContact(event);
  const message = getMessage(event);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  return (
    <Modal eyebrow={`Booked · ${calendarLabels[category]}`} title={contact.name} onClose={onClose}>
      <div className="ah-dialog">
        <dl className="ah-detail-list">
          <div>
            <dt>
              {category === "boarding" ? "Stay" : category === "interest" ? "Pickup" : "Starts"}
            </dt>
            <dd>{formatDateRange(event.start_date, event.end_date)}</dd>
          </div>
          {getFacts(event).length > 0 && (
            <div>
              <dt>
                {category === "boarding" ? "Dogs" : category === "interest" ? "Dog" : "Details"}
              </dt>
              <dd>{getFacts(event).join(" · ")}</dd>
            </div>
          )}
          {message && (
            <div>
              <dt>Notes</dt>
              <dd className="ah-message">{message}</dd>
            </div>
          )}
          <div>
            <dt>Inquiry received</dt>
            <dd>{formatReceived(event.created_at)}</dd>
          </div>
        </dl>

        <ContactButtons event={event} />

        <div className="ah-dialog-actions">
          {confirmingCancel ? (
            <>
              <span className="ah-muted">Remove this booking from the calendar?</span>
              <button
                type="button"
                className="ah-button ah-button-ghost"
                onClick={() => setConfirmingCancel(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="ah-button ah-button-danger"
                onClick={() => void onCancelBooking()}
              >
                Cancel booking
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ah-button ah-button-ghost ah-button-danger-text ah-push-left"
                onClick={() => setConfirmingCancel(true)}
              >
                Cancel booking…
              </button>
              <button type="button" className="ah-button ah-button-ghost" onClick={onEdit}>
                Edit
              </button>
              <button type="button" className="ah-button" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

type EditorForm = {
  eventType: string;
  startDate: string;
  endDate: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dogCount: string;
  dogName: string;
  dogBreed: string;
  dogAge: string;
  dogSex: string;
  notes: string;
};

const toEditorForm = (event: EventRow | null, initialDate: string): EditorForm => {
  if (!event) {
    return {
      eventType: "dog_boarding",
      startDate: initialDate,
      endDate: initialDate,
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      dogCount: "1",
      dogName: "",
      dogBreed: "",
      dogAge: "",
      dogSex: "",
      notes: "",
    };
  }

  const payload = toAdminPayload(event);

  return {
    eventType: event.event_type,
    startDate: event.start_date ?? "",
    endDate: event.end_date ?? event.start_date ?? "",
    firstName: payload.first_name,
    lastName: payload.last_name,
    phone: payload.phone,
    email: payload.email,
    dogCount: String(getDogCount(event)),
    dogName: getDetail(event.details, ["dog_name"]) ?? "",
    dogBreed: getDetail(event.details, ["dog_breed"]) ?? "",
    dogAge: getDetail(event.details, ["dog_age"]) ?? "",
    dogSex: getDetail(event.details, ["dog_sex"]) ?? "",
    notes: getMessage(event) ?? "",
  };
};

interface EventEditorDialogProps {
  // null when adding a new calendar event.
  event: EventRow | null;
  initialDate: string;
  onClose: () => void;
  onSave: (payload: AdminEventPayload) => Promise<void>;
}

const EventEditorDialog = ({ event, initialDate, onClose, onSave }: EventEditorDialogProps) => {
  const [form, setForm] = useState<EditorForm>(() => toEditorForm(event, initialDate));
  const [availableDogs, setAvailableDogs] = useState<DogOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const category = getCategory(form.eventType);

  // Suggestions for the dog field on pickups; typing any name still works.
  useEffect(() => {
    if (category !== "interest" || availableDogs.length > 0) {
      return;
    }

    const controller = new AbortController();
    fetch("/api/dogs", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((dogs: DogOption[]) => setAvailableDogs(dogs))
      .catch(() => undefined);

    return () => controller.abort();
  }, [category, availableDogs.length]);

  const handleChange = (
    changeEvent: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = changeEvent.target;

    setForm((current) => {
      const next = { ...current, [name]: value };

      // Picking a listed dog fills in its breed.
      if (name === "dogName") {
        const match = availableDogs.find((dog) => dog.name === value);
        if (match) {
          next.dogBreed = match.breed;
        }
      }

      // Keep the boarding pick-up date from landing before drop-off.
      if (name === "startDate" && (!current.endDate || current.endDate < value)) {
        next.endDate = value;
      }

      return next;
    });
  };

  const handleSubmit = async (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault();
    setFormError(null);

    if (category === "boarding" && form.endDate < form.startDate) {
      setFormError("The pick-up date can’t be before the drop-off date.");
      return;
    }

    const dogCount = Number(form.dogCount);

    if (category === "boarding" && (!Number.isInteger(dogCount) || dogCount < 1)) {
      setFormError("Please enter how many dogs are staying.");
      return;
    }

    // Start from the existing details so nothing the customer sent is lost.
    const details: Record<string, unknown> = { ...(event?.details ?? {}) };
    const messageKey = event ? getMessageKey(event) : "notes";

    if (form.notes.trim()) {
      details[messageKey] = form.notes.trim();
    } else {
      delete details[messageKey];
    }

    if (category === "boarding") {
      details.dog_count = dogCount;
    }

    if (category === "training") {
      Object.assign(details, {
        dog_name: form.dogName.trim(),
        dog_breed: form.dogBreed.trim(),
        dog_age: form.dogAge.trim(),
        dog_sex: form.dogSex,
      });
    }

    if (category === "interest") {
      const match = availableDogs.find((dog) => dog.name === form.dogName.trim());
      Object.assign(details, {
        dog_name: form.dogName.trim(),
        dog_breed: form.dogBreed.trim(),
      });

      if (match) {
        details.dog_id = match.id;
      } else if (form.dogName.trim() !== (getDetail(event?.details ?? {}, ["dog_name"]) ?? "")) {
        delete details.dog_id;
      }
    }

    setSaving(true);

    try {
      await onSave({
        event_type: form.eventType,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        start_date: form.startDate,
        end_date: category === "boarding" ? form.endDate || form.startDate : null,
        details,
      });
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Unable to save this event.");
      setSaving(false);
    }
  };

  const startLabel =
    category === "boarding" ? "Drop-off date" : category === "interest" ? "Pickup date" : "Start date";

  return (
    <Modal
      eyebrow={event ? `Edit · ${calendarLabels[category]}` : "Add to calendar"}
      title={event ? getContact(event).name : "New calendar event"}
      size="wide"
      onClose={onClose}
    >
      <form className="modal-form ah-dialog" onSubmit={handleSubmit}>
        <p className="ah-required-note">
          <RequiredMark /> Required
        </p>

        <div className="modal-field-row">
          <label>
            <span>
              Type
              <RequiredMark />
            </span>
            <select name="eventType" value={form.eventType} onChange={handleChange} required>
              {calendarEventTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {category === "boarding" && (
            <label>
              <span>
                Number of dogs
                <RequiredMark />
              </span>
              <input
                type="number"
                name="dogCount"
                min={1}
                value={form.dogCount}
                onChange={handleChange}
                required
              />
            </label>
          )}
        </div>

        <div className="modal-field-row">
          <label>
            <span>
              {startLabel}
              <RequiredMark />
            </span>
            <input
              type="date"
              name="startDate"
              value={form.startDate}
              onChange={handleChange}
              required
            />
          </label>

          {category === "boarding" && (
            <label>
              <span>
                Pick-up date
                <RequiredMark />
              </span>
              <input
                type="date"
                name="endDate"
                min={form.startDate || undefined}
                value={form.endDate}
                onChange={handleChange}
                required
              />
            </label>
          )}
        </div>

        <div className="modal-field-row">
          <label>
            <span>
              First name
              <RequiredMark />
            </span>
            <input name="firstName" value={form.firstName} onChange={handleChange} required />
          </label>
          <label>
            <span>
              Last name
              <RequiredMark />
            </span>
            <input name="lastName" value={form.lastName} onChange={handleChange} required />
          </label>
        </div>

        <div className="modal-field-row">
          <label>
            Phone
            <input type="tel" name="phone" value={form.phone} onChange={handleChange} />
          </label>
          <label>
            Email
            <input type="email" name="email" value={form.email} onChange={handleChange} />
          </label>
        </div>

        {category === "training" && (
          <>
            <div className="modal-field-row">
              <label>
                Dog name
                <input name="dogName" value={form.dogName} onChange={handleChange} />
              </label>
              <label>
                Breed
                <input name="dogBreed" value={form.dogBreed} onChange={handleChange} />
              </label>
            </div>
            <div className="modal-field-row">
              <label>
                Dog age
                <input name="dogAge" value={form.dogAge} onChange={handleChange} />
              </label>
              <label>
                Sex
                <select name="dogSex" value={form.dogSex} onChange={handleChange}>
                  <option value="">Not specified</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </label>
            </div>
          </>
        )}

        {category === "interest" && (
          <div className="modal-field-row">
            <label>
              Dog being picked up
              <input
                name="dogName"
                list="ah-available-dogs"
                value={form.dogName}
                onChange={handleChange}
                placeholder="Start typing a dog’s name"
              />
              <datalist id="ah-available-dogs">
                {availableDogs
                  .filter((dog) => dog.name)
                  .map((dog) => (
                    <option key={dog.id} value={dog.name ?? ""}>
                      {dog.breed}
                    </option>
                  ))}
              </datalist>
            </label>
            <label>
              Breed
              <input name="dogBreed" value={form.dogBreed} onChange={handleChange} />
            </label>
          </div>
        )}

        <label>
          Notes
          <textarea name="notes" rows={3} value={form.notes} onChange={handleChange} />
        </label>

        {formError && <p className="ah-error">{formError}</p>}

        <div className="ah-dialog-actions">
          <button type="button" className="ah-button ah-button-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ah-button" disabled={saving}>
            {saving ? "Saving…" : event ? "Save changes" : "Add to calendar"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AdminHome;
