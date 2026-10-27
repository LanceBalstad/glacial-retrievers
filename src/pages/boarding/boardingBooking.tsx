import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import "./boardingBooking.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";

type DogEntry = {
  name: string;
  breed: string;
  age: string;
};

type BookingFormState = {
  startDate: string;
  endDate: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
};

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const createDogEntry = (): DogEntry => ({
  name: "",
  breed: "",
  age: "",
});

const toISODate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const initialFormState: BookingFormState = {
  startDate: "",
  endDate: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerEmail: "",
  ownerPhone: "",
};

const formatDateForDisplay = (value: string) => {
  if (!value) {
    return "Select date";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "Select date";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
};

const getCalendarMonthData = (year: number, monthIndex: number) => {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const firstDayIndex = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const cells: Array<{ day: number | null; dateValue: string | null }> = [];

  for (let i = 0; i < firstDayIndex; i += 1) {
    cells.push({ day: null, dateValue: null });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const dateValue = new Date(year, monthIndex, day).toISOString().slice(0, 10);
    cells.push({ day, dateValue });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateValue: null });
  }

  return cells;
};

type DateRangePickerProps = {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
};

const DateRangePicker = ({ startDate, endDate, onChange }: DateRangePickerProps) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const minAllowedDate = today;
  const maxAllowedDate = addDays(today, 365);

  const initialMonth = startDate
    ? new Date(`${startDate}T00:00:00`)
    : new Date(today);

  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
  );

  const monthLabel = `${monthNames[calendarMonth.getMonth()]} ${calendarMonth.getFullYear()}`;

  const calendarCells = useMemo(
    () => getCalendarMonthData(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth],
  );

  const isDateAllowed = (dateValue: string) => {
    const candidate = new Date(`${dateValue}T00:00:00`);
    return candidate >= minAllowedDate && candidate <= maxAllowedDate;
  };

  const handleDateSelect = (dateValue: string) => {
    if (!isDateAllowed(dateValue)) {
      return;
    }

    const selectedDate = new Date(`${dateValue}T00:00:00`);
    const selectedDateIso = toISODate(selectedDate);
    const selectedNextDayIso = toISODate(addDays(selectedDate, 1));

    if (!startDate) {
      onChange(selectedDateIso, selectedNextDayIso);
      return;
    }

    const currentStart = new Date(`${startDate}T00:00:00`);
    const currentEnd = endDate ? new Date(`${endDate}T00:00:00`) : null;

    if (!currentEnd) {
      onChange(selectedDateIso, selectedNextDayIso);
      return;
    }

    const isDefaultRange =
      currentEnd.getTime() - currentStart.getTime() === 24 * 60 * 60 * 1000;

    if (isDefaultRange) {
      if (selectedDate.getTime() < currentStart.getTime()) {
        onChange(selectedDateIso, selectedNextDayIso);
        return;
      }

      if (selectedDate.getTime() === currentStart.getTime()) {
        onChange(selectedDateIso, selectedDateIso);
        return;
      }

      onChange(startDate, selectedDateIso);
      return;
    }

    onChange(selectedDateIso, selectedNextDayIso);
  };

  const isSelectedDate = (dateValue: string | null) => {
    if (!dateValue) {
      return false;
    }

    const value = new Date(`${dateValue}T00:00:00`);
    const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const end = endDate ? new Date(`${endDate}T00:00:00`) : null;

    if (!start) {
      return false;
    }

    if (!end) {
      return value.getTime() === start.getTime();
    }

    return value >= start && value <= end;
  };

  return (
    <div className="date-range-picker">
      <div className="range-header">
        <div className="range-visual">
          <span className={startDate ? "filled" : "placeholder"}>
            {formatDateForDisplay(startDate)}
          </span>
          <span className="range-arrow">→</span>
          <span className={endDate ? "filled" : "placeholder"}>
            {formatDateForDisplay(endDate)}
          </span>
        </div>
      </div>

      <div className="calendar-header">
        <h3>{monthLabel}</h3>
        <div className="month-nav-group">
          <button
            type="button"
            className="month-nav"
            aria-label="Previous month"
            onClick={() =>
              setCalendarMonth(
                new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1),
              )
            }
          >
            ←
          </button>
          <button
            type="button"
            className="month-nav"
            aria-label="Next month"
            onClick={() =>
              setCalendarMonth(
                new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1),
              )
            }
          >
            →
          </button>
        </div>
      </div>

      <div className="weekday-row">
        {dayNames.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {calendarCells.map((cell, index) => (
          <button
            key={`${cell.dateValue ?? "empty"}-${index}`}
            type="button"
            className={[
              "calendar-day",
              cell.day === null ? "empty" : "",
              cell.dateValue && isSelectedDate(cell.dateValue) ? "selected" : "",
              cell.dateValue && cell.dateValue === startDate ? "start" : "",
              cell.dateValue && cell.dateValue === endDate ? "end" : "",
              cell.dateValue && !isDateAllowed(cell.dateValue) ? "disabled" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => cell.dateValue && handleDateSelect(cell.dateValue)}
            disabled={cell.day === null || (cell.dateValue ? !isDateAllowed(cell.dateValue) : false)}
          >
            {cell.day ?? ""}
          </button>
        ))}
      </div>
    </div>
  );
};

const BoardingBooking = () => {
  const [formData, setFormData] = useState<BookingFormState>(initialFormState);
  const [dogs, setDogs] = useState<DogEntry[]>([createDogEntry()]);
  const [dogCountInput, setDogCountInput] = useState("1");
  const [dogCountError, setDogCountError] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const syncDogCount = (nextValue: string) => {
    setDogCountInput(nextValue);

    if (nextValue.trim() === "") {
      setDogCountError("Please enter how many dogs are staying.");
      return;
    }

    const parsed = Number(nextValue);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
      setDogCountError("Please enter a number between 1 and 12.");
      return;
    }

    setDogCountError("");
    const nextCount = Math.max(1, parsed);

    setDogs((current) => {
      const nextDogs = Array.from({ length: nextCount }, (_, index) =>
        current[index] ?? createDogEntry(),
      );
      return nextDogs;
    });
  };

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleDogChange = (
    index: number,
    field: keyof DogEntry,
    value: string,
  ) => {
    setDogs((current) =>
      current.map((dog, dogIndex) =>
        dogIndex === index ? { ...dog, [field]: value } : dog,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (dogCountInput.trim() === "") {
      setDogCountError("Please enter how many dogs are staying.");
      return;
    }

    const parsedDogCount = Number(dogCountInput);

    if (!Number.isInteger(parsedDogCount) || parsedDogCount < 1 || parsedDogCount > 12) {
      setDogCountError("Please enter a number between 1 and 12.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: "dog_boarding",
          event_status: "requested",
          start_date: formData.startDate,
          end_date: formData.endDate || null,
          details: {
            owner_first_name: formData.ownerFirstName,
            owner_last_name: formData.ownerLastName,
            owner_email: formData.ownerEmail,
            owner_phone: formData.ownerPhone,
            dog_count: parsedDogCount,
            dogs: dogs.slice(0, parsedDogCount).map((dog) => ({
              name: dog.name,
              breed: dog.breed,
              age: dog.age,
            })),
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create the boarding request.");
      }

      setStatus("success");
      setMessage("Your boarding request has been added. We’ll review it and reach out soon.");
      setFormData(initialFormState);
      setDogCountInput("1");
      setDogCountError("");
      setDogs([createDogEntry()]);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating your boarding request.",
      );
    }
  };

  return (
    <main className="boarding-booking-page">
      <section className="booking-shell">
        <div className="booking-copy">
          <p className="booking-eyebrow">Boarding request</p>
          <h1>Book a stay</h1>
          <p>
            Tell us when you’d like your dogs to stay with us and share the details we need to
            plan their care.
          </p>
        </div>

        <form className="booking-form" onSubmit={handleSubmit}>
          <div className="date-range-section">
            <p className="section-label">Stay dates</p>
            <DateRangePicker
              startDate={formData.startDate}
              endDate={formData.endDate}
              onChange={(startDate, endDate) => {
                setFormData((current) => ({
                  ...current,
                  startDate,
                  endDate,
                }));
              }}
            />
          </div>

          <div className="field-row compact-row">
            <label>
              First name
              <input
                type="text"
                name="ownerFirstName"
                value={formData.ownerFirstName}
                onChange={handleChange}
                placeholder="Your first name"
                required
              />
            </label>

            <label>
              Last name
              <input
                type="text"
                name="ownerLastName"
                value={formData.ownerLastName}
                onChange={handleChange}
                placeholder="Your last name"
                required
              />
            </label>
          </div>

          <div className="field-row compact-row">
            <label>
              Phone number
              <input
                type="tel"
                name="ownerPhone"
                value={formData.ownerPhone}
                onChange={handleChange}
                placeholder="(555) 123-4567"
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                name="ownerEmail"
                value={formData.ownerEmail}
                onChange={handleChange}
                placeholder="you@example.com"
              />
            </label>
          </div>

          <div className="count-row">
            <label>
              How many dogs?
              <input
                type="number"
                min={1}
                max={12}
                value={dogCountInput}
                onChange={(event) => syncDogCount(event.target.value)}
                onBlur={() => {
                  if (dogCountInput.trim() === "") {
                    setDogCountError("Please enter how many dogs are staying.");
                  }
                }}
              />
            </label>
          </div>

          {dogCountError ? <p className="count-error">{dogCountError}</p> : null}

          {dogs.map((dog, index) => (
            <div key={`dog-${index}`} className="dog-card">
              <div className="dog-card-header">
                <h3>Dog {index + 1}</h3>
              </div>

              <div className="field-row compact-row">
                <label>
                  Dog name
                  <input
                    type="text"
                    value={dog.name}
                    onChange={(event) =>
                      handleDogChange(index, "name", event.target.value)
                    }
                    placeholder="Dog name"
                    required
                  />
                </label>

                <label>
                  Breed
                  <input
                    type="text"
                    value={dog.breed}
                    onChange={(event) =>
                      handleDogChange(index, "breed", event.target.value)
                    }
                    placeholder="Breed"
                  />
                </label>
              </div>

              <label>
                Age
                <input
                  type="text"
                  value={dog.age}
                  onChange={(event) => handleDogChange(index, "age", event.target.value)}
                  placeholder="For example: 2 years"
                />
              </label>
            </div>
          ))}

          <button type="submit" className="booking-submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Submitting..." : "Submit boarding request"}
          </button>

          {message ? (
            <p className={`booking-status ${status}`} role="status">
              {message}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
};

export default BoardingBooking;
