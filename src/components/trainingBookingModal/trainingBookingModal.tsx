import { type ChangeEvent, type FormEvent, useState } from "react";
import FormSubmit from "../formSubmit/formSubmit.tsx";
import OwnerContactFields, {
  emptyOwnerContact,
  type OwnerContactValues,
} from "../ownerContactFields/ownerContactFields.tsx";
import RequiredMark from "../requiredMark/requiredMark.tsx";
import InquiryModalLayout from "../../layouts/inquiryModalLayout.tsx";
import { type EventType } from "../../lib/api";
import useEventRequest from "../../lib/useEventRequest";

type TrainingEventType = Extract<
  EventType,
  "gun_dog_training" | "house_training" | "basic_obedience_training"
>;

type BookingFormState = OwnerContactValues & {
  eventType: TrainingEventType;
  startDate: string;
  dogName: string;
  dogBreed: string;
  dogAge: string;
  dogSex: string;
  notes: string;
};

interface TrainingBookingModalProps {
  onClose: () => void;
}

const initialFormState: BookingFormState = {
  ...emptyOwnerContact,
  eventType: "gun_dog_training",
  startDate: "",
  dogName: "",
  dogBreed: "",
  dogAge: "",
  dogSex: "",
  notes: "",
};

const TrainingBookingModal = ({ onClose }: TrainingBookingModalProps) => {
  const [formData, setFormData] = useState<BookingFormState>(initialFormState);
  const { status, message, submit } = useEventRequest();

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const created = await submit(
      {
        event_type: formData.eventType,
        event_status: "requested",
        start_date: formData.startDate,
        end_date: null,
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
      },
      {
        success: "Thanks! Your training inquiry has been sent. We’ll reach out to follow up.",
        error: "Could not send the training inquiry.",
      },
    );

    if (created) {
      setFormData(initialFormState);
    }
  };

  return (
    <InquiryModalLayout
      eyebrow="Training"
      title="Training inquiry"
      size="wide"
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <div className="modal-field-row">
          <label>
            <span>
              Training type
              <RequiredMark />
            </span>
            <select
              name="eventType"
              value={formData.eventType}
              onChange={handleChange}
              required
            >
              <option value="gun_dog_training">Gun Dog Training</option>
              <option value="house_training">House Training</option>
              <option value="basic_obedience_training">
                Basic Obedience Training
              </option>
            </select>
          </label>

          <label>
            <span>
              Preferred start date
              <RequiredMark />
            </span>
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              onChange={handleChange}
              required
            />
          </label>
        </div>

        <div className="modal-field-row">
          <label>
            Dog name
            <input
              type="text"
              name="dogName"
              value={formData.dogName}
              onChange={handleChange}
              placeholder="Dog name"
            />
          </label>

          <label>
            <span>
              Breed
              <RequiredMark />
            </span>
            <input
              type="text"
              name="dogBreed"
              value={formData.dogBreed}
              onChange={handleChange}
              placeholder="Breed"
              required
            />
          </label>
        </div>

        <div className="modal-field-row">
          <label>
            <span>
              Dog age
              <RequiredMark />
            </span>
            <input
              type="text"
              name="dogAge"
              value={formData.dogAge}
              onChange={handleChange}
              placeholder="For example: 18 months"
              required
            />
          </label>

          <label>
            <span>
              Sex
              <RequiredMark />
            </span>
            <select
              name="dogSex"
              value={formData.dogSex}
              onChange={handleChange}
              required
            >
              <option value="">Select</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </label>
        </div>

        <OwnerContactFields values={formData} onChange={handleChange} />

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

        <FormSubmit
          label="Send training inquiry"
          status={status}
          message={message}
        />
      </form>
    </InquiryModalLayout>
  );
};

export default TrainingBookingModal;
