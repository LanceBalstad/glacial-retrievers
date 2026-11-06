import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import FormSubmit from "../formSubmit/formSubmit.tsx";
import OwnerContactFields, {
  emptyOwnerContact,
  type OwnerContactValues,
} from "../ownerContactFields/ownerContactFields.tsx";
import RequiredMark from "../requiredMark/requiredMark.tsx";
import InquiryModalLayout from "../../layouts/inquiryModalLayout.tsx";
import useEventRequest from "../../lib/useEventRequest";
import "./boardingBookingModal.css";

type BookingFormState = OwnerContactValues & {
  startDate: string;
  endDate: string;
};

interface BoardingBookingModalProps {
  onClose: () => void;
}

const MAX_DOGS = 10;

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
  ...emptyOwnerContact,
  startDate: "",
  endDate: "",
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

const BoardingBookingModal = ({ onClose }: BoardingBookingModalProps) => {
  const [formData, setFormData] = useState<BookingFormState>(initialFormState);
  const [dogCountInput, setDogCountInput] = useState("1");
  const [dogCountError, setDogCountError] = useState("");
  const { status, message, submit, fail, reset } = useEventRequest();

  const syncDogCount = (nextValue: string) => {
    setDogCountInput(nextValue);

    if (nextValue.trim() === "") {
      setDogCountError("Please enter how many dogs are staying.");
      return;
    }

    const parsed = Number(nextValue);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DOGS) {
      setDogCountError(`Please enter a number between 1 and ${MAX_DOGS}.`);
      return;
    }

    setDogCountError("");
  };

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (dogCountInput.trim() === "") {
      setDogCountError("Please enter how many dogs are staying.");
      return;
    }

    const parsedDogCount = Number(dogCountInput);

    if (!Number.isInteger(parsedDogCount) || parsedDogCount < 1 || parsedDogCount > MAX_DOGS) {
      setDogCountError(`Please enter a number between 1 and ${MAX_DOGS}.`);
      return;
    }

    if (!formData.startDate) {
      fail("Please choose your dog's stay dates.");
      return;
    }

    const created = await submit(
      {
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
        },
      },
      {
        success: "Thanks! Your boarding inquiry has been sent. We’ll reach out to follow up.",
        error: "Could not send the boarding inquiry.",
      },
    );

    if (created) {
      setFormData(initialFormState);
      setDogCountInput("1");
      setDogCountError("");
    }
  };

  return (
    <InquiryModalLayout
      eyebrow="Boarding"
      title="Boarding inquiry"
      size="wide"
      onClose={onClose}
      successMessage={status === "success" ? message : null}
      onDismissSuccess={reset}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="date-range-section">
          <p className="section-label">
            Stay dates
            <RequiredMark />
          </p>
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

        <OwnerContactFields values={formData} onChange={handleChange} />

        <div className="count-row">
          <label>
            <span>
              How many dogs?
              <RequiredMark />
            </span>
            <input
              type="number"
              min={1}
              max={MAX_DOGS}
              required
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

        <FormSubmit
          label="Send boarding inquiry"
          status={status}
          message={message}
        />
      </form>
    </InquiryModalLayout>
  );
};

export default BoardingBookingModal;
