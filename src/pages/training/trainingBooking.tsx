import { type ChangeEvent, type FormEvent, useState } from "react";
import "./trainingBooking.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api";

type EventType =
  | "gun_dog_training"
  | "house_training"
  | "basic_obedience_training";

type BookingFormState = {
  eventType: EventType;
  startDate: string;
  endDate: string;
  dogName: string;
  dogBreed: string;
  dogAge: string;
  dogSex: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  notes: string;
};

const initialFormState: BookingFormState = {
  eventType: "gun_dog_training",
  startDate: "",
  endDate: "",
  dogName: "",
  dogBreed: "",
  dogAge: "",
  dogSex: "",
  ownerFirstName: "",
  ownerLastName: "",
  ownerEmail: "",
  ownerPhone: "",
  notes: "",
};

const TrainingBooking = () => {
  const [formData, setFormData] = useState<BookingFormState>(initialFormState);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: formData.eventType,
          event_status: "requested",
          start_date: formData.startDate,
          end_date: formData.endDate || null,
          details: {
            dog_name: formData.dogName,
            dog_breed: formData.dogBreed,
            dog_age: formData.dogAge,
            dog_sex: formData.dogSex,
            owner_first_name: formData.ownerFirstName,
            owner_last_name: formData.ownerLastName,
            owner_email: formData.ownerEmail,
            owner_phone: formData.ownerPhone,
            notes: formData.notes,
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create the booking request.");
      }

      setStatus("success");
      setMessage("Your request has been added. We’ll review it and reach out soon.");
      setFormData(initialFormState);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating your booking request.",
      );
    }
  };

  return (
    <main className="training-booking-page">
      <section className="booking-shell">
        <div className="booking-copy">
          <p className="booking-eyebrow">Training request</p>
          <h1>Book a training start date</h1>
          <p>
            Tell us when you’d like to start and a few details about your dog.
            We’ll use this request to review the right training plan and next steps.
          </p>
        </div>

        <form className="booking-form" onSubmit={handleSubmit}>
          <div className="field-row">
            <label>
              Event type
              <select
                name="eventType"
                value={formData.eventType}
                onChange={handleChange}
              >
                <option value="gun_dog_training">Gun Dog Training</option>
                <option value="house_training">House Training</option>
                <option value="basic_obedience_training">
                  Basic Obedience Training
                </option>
              </select>
            </label>

            <label>
              Start date
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                required
              />
            </label>
          </div>

          <div className="field-row">
            <label>
              Dog name
              <input
                type="text"
                name="dogName"
                value={formData.dogName}
                onChange={handleChange}
                placeholder="Dog name"
                required
              />
            </label>

            <label>
              Breed
              <input
                type="text"
                name="dogBreed"
                value={formData.dogBreed}
                onChange={handleChange}
                placeholder="Breed"
              />
            </label>
          </div>

          <div className="field-row">
            <label>
              Dog age
              <input
                type="text"
                name="dogAge"
                value={formData.dogAge}
                onChange={handleChange}
                placeholder="For example: 18 months"
              />
            </label>

            <label>
              Sex
              <select name="dogSex" value={formData.dogSex} onChange={handleChange}>
                <option value="">Select</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </label>
          </div>

          <div className="field-row">
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

          <div className="field-row">
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

          <label>
            Details
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Tell us about your dog’s experience, goals, or anything else we should know."
              rows={5}
            />
          </label>

          <button type="submit" className="booking-submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Submitting..." : "Submit booking request"}
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

export default TrainingBooking;
