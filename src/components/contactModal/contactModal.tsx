import { type ChangeEvent, type FormEvent, useState } from "react";
import FormSubmit from "../formSubmit/formSubmit.tsx";
import OwnerContactFields, {
  emptyOwnerContact,
  type OwnerContactValues,
} from "../ownerContactFields/ownerContactFields.tsx";
import RequiredMark from "../requiredMark/requiredMark.tsx";
import InquiryModalLayout from "../../layouts/inquiryModalLayout.tsx";
import { todayISODate } from "../../lib/api";
import useEventRequest from "../../lib/useEventRequest";

type ContactFormState = OwnerContactValues & {
  question: string;
};

interface ContactModalProps {
  onClose: () => void;
}

const initialFormState: ContactFormState = {
  ...emptyOwnerContact,
  question: "",
};

const ContactModal = ({ onClose }: ContactModalProps) => {
  const [formData, setFormData] = useState<ContactFormState>(initialFormState);
  const { status, message, submit, reset } = useEventRequest();

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const created = await submit(
      {
        event_type: "general",
        event_status: "requested",
        start_date: todayISODate(),
        end_date: null,
        details: {
          owner_first_name: formData.ownerFirstName,
          owner_last_name: formData.ownerLastName,
          owner_phone: formData.ownerPhone,
          owner_email: formData.ownerEmail,
          question: formData.question,
          description: formData.question,
        },
      },
      {
        success: "Thanks! Your question has been sent. We’ll be in touch soon.",
        error: "Could not submit your general inquiry.",
      },
    );

    if (created) {
      setFormData(initialFormState);
    }
  };

  return (
    <InquiryModalLayout
      eyebrow="Contact us"
      title="Ask a question"
      onClose={onClose}
      successMessage={status === "success" ? message : null}
      onDismissSuccess={reset}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <OwnerContactFields values={formData} onChange={handleChange} />

        <label>
          <span>
            Question / description
            <RequiredMark />
          </span>
          <textarea
            name="question"
            value={formData.question}
            onChange={handleChange}
            placeholder="Tell us what you’re looking for, what you’d like to know, or what kind of support you need."
            rows={6}
            required
          />
        </label>

        <FormSubmit
          label="Send question"
          submittingLabel="Sending..."
          status={status}
          message={message}
        />
      </form>
    </InquiryModalLayout>
  );
};

export default ContactModal;
