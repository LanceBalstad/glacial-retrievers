import { type ChangeEvent, type FormEvent, useState } from "react";
import FormSubmit from "../formSubmit/formSubmit.tsx";
import OwnerContactFields, {
  emptyOwnerContact,
  type OwnerContactValues,
} from "../ownerContactFields/ownerContactFields.tsx";
import InquiryModalLayout from "../../layouts/inquiryModalLayout.tsx";
import useEventRequest from "../../lib/useEventRequest";

export interface InterestDog {
  id: number;
  name: string | null;
  breed: string;
}

interface DogInterestModalProps {
  dog: InterestDog;
  onClose: () => void;
}

const DogInterestModal = ({ dog, onClose }: DogInterestModalProps) => {
  const [formData, setFormData] = useState<OwnerContactValues>(emptyOwnerContact);
  const { status, message, submit, fail } = useEventRequest();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const firstName = formData.ownerFirstName.trim();
    const lastName = formData.ownerLastName.trim();
    const email = formData.ownerEmail.trim();

    if (!firstName || !lastName || !email) {
      fail("Please enter your first name, last name, and email.");
      return;
    }

    const created = await submit(
      {
        event_type: "interested_in_dog",
        event_status: "requested",
        // No date: interest stays off the admin calendar until a pickup is scheduled.
        details: {
          dog_id: dog.id,
          dog_name: dog.name,
          dog_breed: dog.breed,
          owner_first_name: firstName,
          owner_last_name: lastName,
          owner_email: email,
          owner_phone: formData.ownerPhone.trim(),
          description: `${firstName} ${lastName} is interested in ${dog.name || "this dog"} ${dog.breed}`,
        },
      },
      {
        success: "Thanks! We’ve saved your interest and will be in touch.",
        error: "Unable to submit your interest request.",
      },
    );

    if (created) {
      setFormData(emptyOwnerContact);
    }
  };

  return (
    <InquiryModalLayout
      eyebrow="Available dog"
      title={`I’m interested in ${dog.name || "this dog"}`}
      subtitle={dog.name ? `${dog.name} · ${dog.breed}` : dog.breed}
      onClose={onClose}
    >
      <form className="modal-form" onSubmit={handleSubmit}>
        <OwnerContactFields values={formData} onChange={handleChange} />

        <FormSubmit label="Send inquiry" status={status} message={message} />
      </form>
    </InquiryModalLayout>
  );
};

export default DogInterestModal;
